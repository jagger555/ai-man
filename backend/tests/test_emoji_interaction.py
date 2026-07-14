from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.answer_service import AnswerService
from app.services.chat_record_service import ChatRecordService
from app.services.retriever_service import RetrieverService


@pytest.mark.parametrize(
    ("emoji", "reply"),
    [
        ("😊", "很高兴见到您！想了解景点、路线还是演出安排呢？"),
        ("😄", "看到您心情不错！祝您在灵山胜境游览愉快。"),
        ("👍", "谢谢您的认可！我可以继续为您介绍更多景点。"),
        ("❤️", "感谢您的喜欢！愿这段灵山之旅给您留下美好回忆。"),
        ("🙏", "谢谢您的祝福！愿您旅途顺心、平安愉快。"),
        ("🤩", "灵山还有很多精彩看点，要不要继续听我介绍？"),
        ("👏", "谢谢鼓励！我会继续为您提供清晰的导览讲解。"),
        ("🌸", "愿您在灵山胜境收获一段轻松、美好的旅程。"),
    ],
)
def test_pure_supported_emoji_uses_fixed_reply_without_retrieval_or_llm(
    monkeypatch, tmp_path, emoji, reply
):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setattr(
        RetrieverService,
        "retrieve",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("retrieval called")),
    )
    monkeypatch.setattr(
        AnswerService,
        "_generate_answer",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("llm called")),
    )

    response = TestClient(app).post(
        "/api/chat", json={"session_id": "emoji-session", "question": emoji}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == reply
    assert body["interaction_type"] == "emoji"
    assert body["emoji_value"] == emoji
    assert body["model_provider"] == "fixed"
    assert body["model_status"] == "emoji_fixed_reply"
    assert body["confidence"] == 1.0
    assert body["sources"] == []
    assert body["prompt"] == ""


@pytest.mark.parametrize(
    ("question", "emoji_value", "expected_text"),
    [
        ("😊😊😊", "😊", "很高兴见到您"),
        ("😊👍", "mixed", "谢谢您的积极互动"),
        ("😢", "other", "谢谢您的积极互动"),
    ],
)
def test_pure_emoji_variants_are_always_positive(
    monkeypatch, tmp_path, question, emoji_value, expected_text
):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    response = TestClient(app).post(
        "/api/chat", json={"session_id": "emoji-variants", "question": question}
    )
    body = response.json()
    assert body["interaction_type"] == "emoji"
    assert body["emoji_value"] == emoji_value
    assert expected_text in body["answer"]


def test_text_with_emoji_uses_normal_question_flow_and_preserves_raw_input(
    monkeypatch, tmp_path
):
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("LLM_PROVIDER", "mock")

    response = TestClient(app).post(
        "/api/chat",
        json={"session_id": "mixed-input", "question": "灵山大佛有多高😊？"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["interaction_type"] == "question"
    assert body["emoji_value"] == ""
    assert body["cleaned_question"] == "灵山大佛有多高？"
    with sqlite3.connect(database_path) as connection:
        stored = connection.execute(
            "SELECT original_question, cleaned_question FROM chat_records WHERE id = ?",
            (body["record_id"],),
        ).fetchone()
    assert stored == ("灵山大佛有多高😊？", "灵山大佛有多高？")


def test_emoji_is_excluded_from_question_history_and_quality_metrics(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    client = TestClient(app)
    emoji_response = client.post(
        "/api/chat", json={"session_id": "history-session", "question": "👏"}
    )
    question_response = client.post(
        "/api/chat",
        json={"session_id": "history-session", "question": "灵山大佛有多高？"},
    )

    assert emoji_response.status_code == 200
    assert question_response.json()["history_turns_used"] == 0
    service = ChatRecordService()
    assert service.count_low_confidence_records() == 0
    dashboard = service.get_dashboard_metrics(days=7)
    assert dashboard["summary"]["total_records"] == 2
    assert dashboard["summary"]["question_count"] == 1
    assert dashboard["summary"]["emoji_interaction_count"] == 1
    assert dashboard["popular_questions"][0]["question"] == "灵山大佛有多高？"
