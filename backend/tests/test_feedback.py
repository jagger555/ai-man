import sqlite3

from fastapi.testclient import TestClient

from app.main import app


def test_feedback_endpoint_upserts_feedback_for_chat_record(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    chat_response = client.post(
        "/api/chat",
        json={
            "session_id": "feedback-session",
            "question": "灵山大佛有多高？",
        },
    )
    assert chat_response.status_code == 200
    record_id = chat_response.json()["record_id"]

    first_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": record_id,
            "session_id": "feedback-session",
            "rating": "helpful",
            "feedback_text": "讲解很清楚",
        },
    )

    assert first_feedback.status_code == 200

    second_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": record_id,
            "session_id": "feedback-session",
            "rating": "unhelpful",
            "feedback_text": "想看更具体的文化背景",
        },
    )

    assert second_feedback.status_code == 200
    body = second_feedback.json()
    assert body["status"] == "saved"
    assert body["rating"] == "unhelpful"
    assert body["feedback_id"] >= 1

    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            """
            SELECT COUNT(*), rating, feedback_text
            FROM chat_feedback
            WHERE record_id = ?
            GROUP BY rating, feedback_text
            """,
            (record_id,),
        ).fetchone()
    finally:
        connection.close()

    assert row is not None
    assert row[0] == 1
    assert row[1] == "unhelpful"
    assert row[2] == "想看更具体的文化背景"


def test_admin_feedback_endpoint_lists_feedback_with_question_context(
    monkeypatch, tmp_path
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    chat_response = client.post(
        "/api/chat",
        json={
            "session_id": "feedback-list-session",
            "question": "灵山大佛有多高？",
        },
    )
    assert chat_response.status_code == 200
    record_id = chat_response.json()["record_id"]

    feedback_response = client.post(
        "/api/feedback",
        json={
            "record_id": record_id,
            "session_id": "feedback-list-session",
            "rating": "helpful",
        },
    )
    assert feedback_response.status_code == 200

    response = client.get("/api/admin/feedback", params={"limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["total_count"] == 1
    record = body["records"][0]
    assert record["record_id"] == record_id
    assert record["session_id"] == "feedback-list-session"
    assert record["rating"] == "helpful"
    assert record["original_question"] == "灵山大佛有多高？"
    assert "灵山大佛" in record["answer"]


def test_admin_feedback_endpoint_supports_rating_filter_and_overview_feedback_metrics(
    monkeypatch, tmp_path
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))

    client = TestClient(app)
    helpful_chat = client.post(
        "/api/chat",
        json={
            "session_id": "feedback-metrics-helpful",
            "question": "灵山大佛有多高？",
        },
    )
    unhelpful_chat = client.post(
        "/api/chat",
        json={
            "session_id": "feedback-metrics-unhelpful",
            "question": "今天股票市场怎么走？",
        },
    )
    assert helpful_chat.status_code == 200
    assert unhelpful_chat.status_code == 200

    helpful_record_id = helpful_chat.json()["record_id"]
    unhelpful_record_id = unhelpful_chat.json()["record_id"]

    helpful_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": helpful_record_id,
            "session_id": "feedback-metrics-helpful",
            "rating": "helpful",
        },
    )
    unhelpful_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": unhelpful_record_id,
            "session_id": "feedback-metrics-unhelpful",
            "rating": "unhelpful",
            "feedback_text": "这条回答还不够贴近游客需求",
        },
    )
    assert helpful_feedback.status_code == 200
    assert unhelpful_feedback.status_code == 200

    filtered_response = client.get(
        "/api/admin/feedback",
        params={"limit": 10, "rating": "unhelpful"},
    )
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["count"] == 1
    assert filtered_body["total_count"] == 1
    assert filtered_body["records"][0]["rating"] == "unhelpful"
    assert filtered_body["records"][0]["feedback_text"] == "这条回答还不够贴近游客需求"

    overview_response = client.get("/api/admin/overview")
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["feedback_total_count"] == 2
    assert overview["feedback_helpful_count"] == 1
    assert overview["feedback_unhelpful_count"] == 1
    assert overview["feedback_helpful_rate"] == 0.5
