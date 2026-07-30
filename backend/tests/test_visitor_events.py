from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app


def _event(client: TestClient, session_id: str, event_type: str, **payload):
    return client.post(
        "/api/visitor/events",
        json={
            "session_id": session_id,
            "event_type": event_type,
            **payload,
        },
    )


def test_anonymous_events_build_operational_insights(monkeypatch, tmp_path):
    database_path = tmp_path / "visitor-events.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    client = TestClient(app)

    assert _event(client, "anonymous-session-a", "page_view", page="home").status_code == 202
    assert _event(client, "anonymous-session-a", "page_view", page="map").status_code == 202
    assert _event(
        client,
        "anonymous-session-a",
        "page_dwell",
        page="map",
        metadata={"seconds": 93},
    ).status_code == 202
    assert _event(
        client,
        "anonymous-session-a",
        "map_search",
        page="map",
        entity_type="destination",
        entity_id="灵山大佛",
    ).status_code == 202
    assert _event(
        client,
        "anonymous-session-a",
        "navigation_success",
        page="map",
        metadata={"distance": 880, "duration": 720},
    ).status_code == 202
    assert _event(client, "anonymous-session-b", "page_view", page="services").status_code == 202
    assert _event(
        client,
        "anonymous-session-b",
        "service_category",
        page="services",
        entity_id="toilet",
        metadata={"category": "卫生间", "phone": "13800000000", "latitude": 31.0},
    ).status_code == 202

    response = client.get("/api/admin/visitor-insights", params={"days": 7})
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["anonymous_sessions"] == 2
    assert body["summary"]["feature_sessions"] == 2
    assert body["summary"]["action_sessions"] == 2
    assert body["summary"]["completed_sessions"] == 1
    assert body["data_policy"]["retention_days"] == 90
    assert next(item for item in body["page_engagement"] if item["page"] == "map") == {
        "page": "map",
        "label": "地图导航",
        "views": 1,
        "unique_sessions": 1,
        "average_dwell_seconds": 93.0,
    }
    assert body["service_categories"][0]["label"] == "卫生间"
    assert "session_id" not in json.dumps(body)
    with sqlite3.connect(database_path) as connection:
        stored_metadata = connection.execute(
            "SELECT metadata_json FROM visitor_events WHERE event_type = 'service_category'"
        ).fetchone()[0]
    assert json.loads(stored_metadata) == {"category": "卫生间"}


def test_event_validation_and_ninety_day_retention(monkeypatch, tmp_path):
    database_path = tmp_path / "visitor-events.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    client = TestClient(app)

    invalid = client.post(
        "/api/visitor/events",
        json={"session_id": "anonymous-session", "event_type": "precise_gps"},
    )
    assert invalid.status_code == 422

    assert _event(client, "anonymous-current", "page_view", page="home").status_code == 202
    expired_at = (datetime.now(timezone.utc) - timedelta(days=91)).strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            INSERT INTO visitor_events (
                session_id, event_type, page, entity_type, entity_id,
                metadata_json, created_at
            ) VALUES (?, 'page_view', 'home', '', '', '{}', ?)
            """,
            ("anonymous-expired", expired_at),
        )
        connection.commit()

    response = client.get("/api/admin/visitor-insights", params={"days": 30})
    assert response.status_code == 200
    assert response.json()["summary"]["anonymous_sessions"] == 1
    with sqlite3.connect(database_path) as connection:
        expired_count = connection.execute(
            "SELECT COUNT(*) FROM visitor_events WHERE session_id = 'anonymous-expired'"
        ).fetchone()[0]
    assert expired_count == 0
