from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient

from app.api.knowledge import _reset_knowledge_base_cache
from app.main import app


def test_chat_endpoint_answers_from_default_knowledge_base(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    knowledge_path = (
        Path(__file__).resolve().parents[2] / "data" / "sample_scenic" / "knowledge.md"
    )
    assert knowledge_path.exists()

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "test-session",
            "question": "  灵山大佛有多高？？  ",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == "test-session"
    assert body["cleaned_question"] == "灵山大佛有多高？"
    assert "灵山大佛" in body["answer"]
    assert "88米" in body["answer"]
    assert body["confidence"] >= 0.5
    assert body["reliable"] is True
    assert "导游式回答" in body["prompt"]
    assert body["model_provider"] == "mock"
    assert body["model_status"] == "mock_response"
    assert body["sources"]
    assert body["sources"][0]["text"]
    assert body["record_status"] == "saved"
    assert body["record_id"] >= 1
    assert body["latency_ms"] >= 0


def test_chat_endpoint_includes_optional_visitor_context_in_prompt(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "context-session",
            "question": "带老人怎么游览灵山大佛？",
            "current_location": "游客中心",
            "visitor_type": "老人游客",
            "available_time": "半天",
        },
    )

    assert response.status_code == 200
    prompt = response.json()["prompt"]
    assert "用户当前位置：\n游客中心" in prompt
    assert "用户画像：\n老人游客" in prompt
    assert "可用游玩时间：\n半天" in prompt
    assert "地图/路线检索结果：\n未提供" in prompt


def test_chat_endpoint_returns_low_confidence_for_unrelated_question(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "test-session",
            "question": "今天股票市场怎么走？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reliable"] is False
    assert body["confidence"] < 0.5
    assert body["sources"] == []
    assert "景区知识库" in body["answer"]
    assert body["model_provider"] == "retrieval_guard"
    assert body["model_status"] == "low_confidence_no_llm"
    assert body["record_status"] == "saved"
    assert body["record_id"] >= 1


def test_chat_endpoint_uses_route_context_even_when_knowledge_retrieval_is_unreliable(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "route-context-session",
            "question": "帮我走过去",
            "route_context": "当前位置：游客中心；目的地：灵山梵宫；路线：沿主路向北步行约8分钟。",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_provider"] == "mock"
    assert body["model_status"] == "mock_response"
    assert "地图/路线检索结果" in body["prompt"]
    assert "沿主路向北步行约8分钟" in body["prompt"]
    assert "沿主路向北步行约8分钟" in body["answer"]


def test_unreliable_retrieval_skips_real_llm_generation(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge.db"))
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.com/v1")
    _reset_knowledge_base_cache()

    def fail_post(*args, **kwargs):
        raise AssertionError("real LLM should not be called for unreliable retrieval")

    monkeypatch.setattr("app.services.llm.real_llm.httpx.post", fail_post)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "low-confidence-session",
            "question": "今天股票市场怎么走？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reliable"] is False
    assert body["sources"] == []
    assert body["model_provider"] == "retrieval_guard"
    assert body["model_status"] == "low_confidence_no_llm"
    assert body["record_status"] == "saved"


def test_chat_endpoint_uses_real_llm_when_configured(monkeypatch):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("LLM_MODEL", "test-model")

    def fake_post(url, *, json, headers, timeout):
        assert url == "https://example.com/v1/chat/completions"
        assert json["model"] == "test-model"
        assert "灵山胜境 AI 数字人导游" in json["messages"][0]["content"]
        assert "用户问题：\n灵山大佛有多高？" in json["messages"][1]["content"]
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

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "real-session",
            "question": "灵山大佛有多高？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_provider"] == "openai"
    assert body["model_status"] == "real_llm_success"
    assert body["record_status"] == "saved"
    assert "88米" in body["answer"]


def test_chat_endpoint_falls_back_to_mock_when_real_llm_fails(monkeypatch):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "fallback-session",
            "question": "灵山大佛有多高？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_provider"] == "mock"
    assert body["model_status"].startswith("fallback_to_mock:")
    assert body["record_status"] == "saved"
    assert "88米" in body["answer"]


def test_chat_endpoint_auto_creates_and_persists_sqlite_record(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "db-session",
            "question": "灵山大佛有多高？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["record_status"] == "saved"
    assert database_path.exists()

    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            """
            SELECT session_id, original_question, cleaned_question, reliable,
                   source_count, model_provider, response_time_ms
            FROM chat_records
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()
    finally:
        connection.close()

    assert row is not None
    assert row[0] == "db-session"
    assert row[1] == "灵山大佛有多高？"
    assert row[2] == "灵山大佛有多高？"
    assert row[3] == 1
    assert row[4] >= 1
    assert row[5] == "mock"
    assert row[6] >= 0


def test_chat_records_endpoint_lists_recent_records(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    create_response = client.post(
        "/api/chat",
        json={
            "session_id": "records-session",
            "question": "灵山梵宫有哪些特色体验？",
        },
    )
    assert create_response.status_code == 200

    list_response = client.get("/api/admin/chat-records", params={"limit": 5})

    assert list_response.status_code == 200
    body = list_response.json()
    assert body["count"] >= 1
    assert body["records"][0]["session_id"] == "records-session"
    assert body["records"][0]["model_provider"] == "mock"
    assert body["records"][0]["confidence"] >= 0


def test_chat_endpoint_includes_recent_session_history_in_prompt(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    first_response = client.post(
        "/api/chat",
        json={
            "session_id": "history-session",
            "question": "灵山大佛有多高？",
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/chat",
        json={
            "session_id": "history-session",
            "question": "那它有什么寓意？",
        },
    )

    assert second_response.status_code == 200
    body = second_response.json()
    assert body["history_turns_used"] >= 1
    assert "最近对话历史" in body["prompt"]
    assert "用户：灵山大佛有多高？" in body["prompt"]
    assert "AI：" in body["prompt"]


def test_chat_records_endpoint_supports_session_filter(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    client.post(
        "/api/chat",
        json={
            "session_id": "session-a",
            "question": "灵山大佛有多高？",
        },
    )
    client.post(
        "/api/chat",
        json={
            "session_id": "session-b",
            "question": "灵山梵宫有哪些特色体验？",
        },
    )

    response = client.get(
        "/api/admin/chat-records",
        params={"limit": 10, "session_id": "session-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert all(record["session_id"] == "session-a" for record in body["records"])
