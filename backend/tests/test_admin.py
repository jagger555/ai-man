from fastapi.testclient import TestClient

from app.main import app


def test_admin_overview_endpoint_summarizes_model_and_quality_metrics(
    monkeypatch, tmp_path
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)

    mock_response = client.post(
        "/api/chat",
        json={
            "session_id": "overview-mock",
            "question": "灵山大佛有多高？",
        },
    )
    assert mock_response.status_code == 200

    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("LLM_MODEL", "test-model")

    def fake_post(url, *, json, headers, timeout):
        assert url == "https://example.com/v1/chat/completions"
        assert json["model"] == "test-model"
        assert headers["Authorization"] == "Bearer test-key"
        assert timeout == 20

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": "灵山大佛通高88米，是景区最具代表性的核心景点。"
                            }
                        }
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr("app.services.llm.real_llm.httpx.post", fake_post)

    real_response = client.post(
        "/api/chat",
        json={
            "session_id": "overview-real",
            "question": "灵山大佛有多高？",
        },
    )
    assert real_response.status_code == 200

    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    fallback_response = client.post(
        "/api/chat",
        json={
            "session_id": "overview-fallback",
            "question": "灵山大佛有多高？",
        },
    )
    assert fallback_response.status_code == 200

    monkeypatch.setenv("LLM_PROVIDER", "mock")
    low_confidence_response = client.post(
        "/api/chat",
        json={
            "session_id": "overview-low-confidence",
            "question": "附近哪家火锅店最好吃？",
        },
    )
    assert low_confidence_response.status_code == 200

    overview_response = client.get("/api/admin/overview")

    assert overview_response.status_code == 200
    body = overview_response.json()
    assert body["total_records"] == 4
    assert body["today_records"] == 4
    assert body["low_confidence_count"] == 1
    assert body["real_model_count"] == 1
    assert body["mock_model_count"] == 2
    assert body["fallback_count"] == 1
    assert body["average_response_time_ms"] >= 0


def test_low_confidence_pool_endpoint_returns_only_records_needing_follow_up(
    monkeypatch, tmp_path
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("LLM_PROVIDER", "mock")

    client = TestClient(app)
    reliable_response = client.post(
        "/api/chat",
        json={
            "session_id": "pool-reliable",
            "question": "灵山大佛有多高？",
        },
    )
    assert reliable_response.status_code == 200

    low_confidence_response = client.post(
        "/api/chat",
        json={
            "session_id": "pool-low-confidence",
            "question": "附近哪家火锅店最好吃？",
        },
    )
    assert low_confidence_response.status_code == 200

    response = client.get("/api/admin/chat-records/low-confidence", params={"limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["total_count"] == 1
    record = body["records"][0]
    assert record["session_id"] == "pool-low-confidence"
    assert record["reliable"] is False
    assert record["source_count"] == 0
    assert record["issue_reason"] == "资料不足"
    assert record["top_score"] == 0.0
