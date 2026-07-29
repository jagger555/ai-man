import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.scenic_status_service import (
    _reset_weather_cache,
    build_crowd_snapshot,
    get_scenic_status,
)


@pytest.fixture(autouse=True)
def reset_weather_cache():
    _reset_weather_cache()
    yield
    _reset_weather_cache()


def test_scenic_status_returns_live_amap_weather_and_demo_crowd(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    monkeypatch.setenv("SCENIC_ADCODE", "320211")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "1",
                "lives": [
                    {
                        "province": "江苏",
                        "city": "滨湖区",
                        "adcode": "320211",
                        "weather": "多云",
                        "temperature": "27",
                        "winddirection": "东南",
                        "windpower": "3",
                        "humidity": "68",
                        "reporttime": "2026-07-30 10:20:00",
                    }
                ],
            }

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["timeout"] == 2.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            assert url.endswith("/v3/weather/weatherInfo")
            assert params == {
                "key": "test-amap-key",
                "city": "320211",
                "extensions": "base",
                "output": "JSON",
            }
            return FakeResponse()

    monkeypatch.setattr(
        "app.services.scenic_status_service.httpx.AsyncClient",
        FakeClient,
    )

    response = TestClient(app).get("/api/scenic/status")

    assert response.status_code == 200
    body = response.json()
    assert body["scenic_name"] == "灵山胜境"
    weather = body["weather"]
    assert weather["status"] == "live"
    assert weather["provider"] == "高德天气"
    assert weather["city"] == "滨湖区"
    assert weather["adcode"] == "320211"
    assert weather["weather"] == "多云"
    assert weather["temperature"] == "27"
    assert weather["wind_direction"] == "东南"
    assert weather["wind_power"] == "3"
    assert weather["humidity"] == "68"
    assert weather["report_time"] == "2026-07-30 10:20:00"
    assert weather["age_seconds"] == 0
    assert weather["fetched_at"]
    assert weather["message"] == ""
    assert body["crowd"]["source"] == "demo_simulation"
    assert body["crowd"]["source_label"] == "演示模拟数据"
    assert len(body["crowd"]["entrances"]) == 3


def test_scenic_status_keeps_crowd_available_without_amap_key(monkeypatch):
    monkeypatch.delenv("AMAP_WEB_SERVICE_KEY", raising=False)
    monkeypatch.setenv("SCENIC_ADCODE", "110101")

    response = TestClient(app).get("/api/scenic/status")

    assert response.status_code == 200
    body = response.json()
    assert body["weather"]["status"] == "unavailable"
    assert body["weather"]["adcode"] == "110101"
    assert body["weather"]["temperature"] is None
    assert "未配置" in body["weather"]["message"]
    assert body["crowd"]["current_inside"] >= 0
    assert body["crowd"]["today_entries"] >= body["crowd"]["today_exits"]


def test_scenic_status_falls_back_to_last_weather_when_amap_fails(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    monkeypatch.setenv("SCENIC_WEATHER_CACHE_SECONDS", "1")
    calls = 0

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "1",
                "lives": [
                    {
                        "city": "滨湖区",
                        "adcode": "320211",
                        "weather": "晴",
                        "temperature": "29",
                        "winddirection": "南",
                        "windpower": "2",
                        "humidity": "62",
                        "reporttime": "2026-07-30 10:00:00",
                    }
                ],
            }

    class FlakyClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            nonlocal calls
            calls += 1
            if calls == 1:
                return FakeResponse()
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(
        "app.services.scenic_status_service.httpx.AsyncClient",
        FlakyClient,
    )

    timezone = ZoneInfo("Asia/Shanghai")
    first_time = datetime(2026, 7, 30, 10, 0, tzinfo=timezone)
    live = asyncio.run(get_scenic_status(first_time))
    cached = asyncio.run(get_scenic_status(first_time + timedelta(minutes=2)))

    assert live["weather"]["status"] == "live"
    assert cached["weather"]["status"] == "cached"
    assert cached["weather"]["temperature"] == "29"
    assert "最近一次" in cached["weather"]["message"]


def test_scenic_status_rejects_weather_older_than_max_stale(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")
    monkeypatch.setenv("SCENIC_WEATHER_CACHE_SECONDS", "1")
    monkeypatch.setenv("SCENIC_WEATHER_MAX_STALE_SECONDS", "60")
    calls = 0

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "1",
                "lives": [
                    {
                        "city": "滨湖区",
                        "adcode": "320211",
                        "weather": "晴",
                        "temperature": "29",
                        "winddirection": "南",
                        "windpower": "2",
                        "humidity": "62",
                        "reporttime": "2026-07-30 10:00:00",
                    }
                ],
            }

    class FlakyClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            nonlocal calls
            calls += 1
            if calls == 1:
                return FakeResponse()
            raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(
        "app.services.scenic_status_service.httpx.AsyncClient",
        FlakyClient,
    )

    timezone = ZoneInfo("Asia/Shanghai")
    first_time = datetime(2026, 7, 30, 10, 0, tzinfo=timezone)
    asyncio.run(get_scenic_status(first_time))
    stale = asyncio.run(get_scenic_status(first_time + timedelta(minutes=2)))

    assert stale["weather"]["status"] == "unavailable"
    assert stale["weather"]["temperature"] is None
    assert stale["weather"]["fetched_at"] is None


def test_crowd_snapshot_is_deterministic_and_recommends_quietest_entrance():
    timezone = ZoneInfo("Asia/Shanghai")
    morning = build_crowd_snapshot(datetime(2026, 7, 30, 10, 0, tzinfo=timezone))
    afternoon = build_crowd_snapshot(datetime(2026, 7, 30, 16, 0, tzinfo=timezone))

    assert morning == build_crowd_snapshot(datetime(2026, 7, 30, 10, 0, tzinfo=timezone))
    assert morning["current_inside"] > 0
    assert afternoon["today_entries"] > morning["today_entries"]
    assert afternoon["today_exits"] > morning["today_exits"]

    quietest = min(
        morning["entrances"],
        key=lambda entrance: entrance["entries_last_5m"],
    )
    assert morning["recommended_entrance"] == quietest["name"]
    assert {item["flow_level"] for item in morning["entrances"]} <= {
        "畅通",
        "适中",
        "繁忙",
    }

    before_opening = build_crowd_snapshot(
        datetime(2026, 7, 30, 6, 30, tzinfo=timezone)
    )
    assert before_opening["recommended_entrance"] is None
