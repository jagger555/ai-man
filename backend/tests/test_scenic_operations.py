from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.crowd_simulation_service import (
    _reset_crowd_simulation,
    get_operational_crowd_snapshot,
    update_crowd_simulation,
)
from app.services.scenic_content_service import _reset_scenic_content_cache


@pytest.fixture(autouse=True)
def reset_operations_state(tmp_path, monkeypatch):
    monkeypatch.setenv("SCENIC_CONTENT_STATE_PATH", str(tmp_path / "content.json"))
    _reset_crowd_simulation()
    _reset_scenic_content_cache()
    yield
    _reset_crowd_simulation()
    _reset_scenic_content_cache()


def test_crowd_simulation_play_pause_reset_and_shared_status(monkeypatch):
    monkeypatch.delenv("AMAP_WEB_SERVICE_KEY", raising=False)
    client = TestClient(app)

    entry_peak = client.post(
        "/api/admin/crowd/simulation",
        json={"action": "play", "scenario": "entry_peak"},
    )
    assert entry_peak.status_code == 200
    peak_body = entry_peak.json()
    assert peak_body["simulation"]["scenario"] == "entry_peak"
    assert peak_body["simulation"]["status"] == "playing"

    visitor_status = client.get("/api/scenic/status")
    assert visitor_status.status_code == 200
    assert visitor_status.json()["crowd"]["simulation"]["scenario"] == "entry_peak"

    paused = client.post("/api/admin/crowd/simulation", json={"action": "pause"})
    assert paused.status_code == 200
    frozen = paused.json()
    assert frozen["simulation"]["status"] == "paused"
    assert client.get("/api/admin/crowd/simulation").json() == frozen

    reset = client.post("/api/admin/crowd/simulation", json={"action": "reset"})
    assert reset.status_code == 200
    assert reset.json()["simulation"] == {
        "scenario": "steady",
        "status": "playing",
        "effective_at": reset.json()["simulation"]["effective_at"],
    }


def test_crowd_history_and_entrance_totals_are_consistent():
    timezone = ZoneInfo("Asia/Shanghai")
    now = datetime(2026, 7, 30, 10, 0, tzinfo=timezone)
    update_crowd_simulation(action="play", scenario="exit_peak", now=now)
    snapshot = get_operational_crowd_snapshot(now)

    assert sum(item["today_entries"] for item in snapshot["entrances"]) == snapshot["today_entries"]
    assert sum(item["today_exits"] for item in snapshot["entrances"]) == snapshot["today_exits"]

    history = TestClient(app).get("/api/crowd/history")
    assert history.status_code == 200
    assert len(history.json()["points"]) == 11
    assert history.json()["scenario"] == "exit_peak"


def test_scenic_content_save_publish_persists_and_rejects_unsupported_fields():
    client = TestClient(app)
    original = client.get("/api/scenic/content")
    assert original.status_code == 200
    assert len(original.json()["items"]["poi"]) == 6

    hidden = client.patch(
        "/api/admin/scenic/content/poi/local-wuyin",
        json={"enabled": False},
    )
    assert hidden.status_code == 200
    assert hidden.json()["enabled"] is False

    route = client.patch(
        "/api/admin/scenic/content/route/blessing-zen",
        json={
            "duration": "约 3 小时",
            "duration_minutes": 180,
            "stops": ["检票口", "九龙灌浴", "灵山大佛", "景区出口"],
        },
    )
    assert route.status_code == 200
    assert route.json()["duration_minutes"] == 180

    performance = client.patch(
        "/api/admin/scenic/content/performance/jiulong",
        json={
            "valid_from": "2026-08-01T00:00:00+08:00",
            "valid_until": "2026-08-31T23:59:59+08:00",
            "schedules": [{"label": "每日", "times": ["10:30", "15:00"]}],
        },
    )
    assert performance.status_code == 200
    assert performance.json()["schedules"][0]["times"] == ["10:30", "15:00"]

    _reset_scenic_content_cache()
    persisted = client.get("/api/scenic/content").json()["items"]
    assert next(item for item in persisted["poi"] if item["id"] == "local-wuyin")["enabled"] is False
    assert next(item for item in persisted["route"] if item["id"] == "blessing-zen")["duration_minutes"] == 180
    assert "vr" not in persisted

    invalid = client.patch(
        "/api/admin/scenic/content/poi/local-wuyin",
        json={"source_url": "https://example.com/not-allowed"},
    )
    assert invalid.status_code == 422


def test_route_and_facility_snapshot_is_exposed_as_local_content():
    content = TestClient(app).get("/api/scenic/content")
    assert content.status_code == 200
    items = content.json()["items"]

    routes = items["route"]
    assert len(routes) == 6
    assert [route["title"] for route in routes] == [
        "祈福禅悟线",
        "文化体验线",
        "亲子喜乐线",
        "舌尖上的灵山",
        "文博探索之旅",
        "清净自在线（建议全程电瓶车）",
    ]
    culture_route = next(route for route in routes if route["id"] == "culture-experience")
    assert len(culture_route["route_stops"]) == 21
    assert len(culture_route["path"]) == 80

    categories = {category["id"]: category for category in items["facility_category"]}
    facilities = items["facility"]
    assert len(categories) == 17
    assert len(facilities) == 214
    assert categories["facility-41"]["title"] == "卫生间"
    assert sum(item["category_id"] == "facility-41" for item in facilities) == 12
    assert all(isinstance(item["lng"], float) and isinstance(item["lat"], float) for item in facilities)
