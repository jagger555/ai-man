from fastapi.testclient import TestClient

from app.main import app


def test_operations_suggestions_use_aggregated_evidence_and_links(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "operations.db"))
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    client = TestClient(app)
    for event_type, page, metadata in [
        ("page_view", "home", {}),
        ("page_view", "map", {}),
        ("navigation_failure", "map", {"destination": "灵山大佛", "reason": "unavailable"}),
        ("service_category", "services", {"category": "卫生间", "action": "map"}),
        ("preference_select", "route", {"category": "interest", "values": ["演出体验"]}),
    ]:
        response = client.post("/api/visitor/events", json={
            "session_id": "visitor-operations-test",
            "event_type": event_type,
            "page": page,
            "metadata": metadata,
        })
        assert response.status_code == 202

    response = client.get("/api/admin/operations-suggestions", params={"days": 7})
    assert response.status_code == 200
    body = response.json()
    assert body["engine"] == "rule_mining"
    assert body["suggestions"]
    assert all(item["evidence"] and item["action"] and item["module"] for item in body["suggestions"])
    assert any(item["id"] == "navigation-recovery" for item in body["suggestions"])


def test_operations_suggestions_do_not_invent_when_no_events(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "empty.db"))
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    response = TestClient(app).get("/api/admin/operations-suggestions")
    assert response.status_code == 200
    assert response.json()["suggestions"] == []
