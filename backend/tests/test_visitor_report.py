from fastapi.testclient import TestClient

from app.main import app


def test_visitor_report_summarizes_focus_sentiment_and_suggestions(
    monkeypatch,
    tmp_path,
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setenv("LLM_PROVIDER", "mock")

    client = TestClient(app)

    helpful_chat = client.post(
        "/api/chat",
        json={
            "session_id": "report-helpful",
            "question": "灵山大佛有多高？",
        },
    )
    unhelpful_chat = client.post(
        "/api/chat",
        json={
            "session_id": "report-culture",
            "question": "灵山大佛有什么历史文化寓意？",
        },
    )
    low_confidence_chat = client.post(
        "/api/chat",
        json={
            "session_id": "report-traffic",
            "question": "停车场怎么走？",
        },
    )
    assert helpful_chat.status_code == 200
    assert unhelpful_chat.status_code == 200
    assert low_confidence_chat.status_code == 200

    helpful_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": helpful_chat.json()["record_id"],
            "session_id": "report-helpful",
            "rating": "helpful",
            "feedback_text": "讲解清楚",
        },
    )
    unhelpful_feedback = client.post(
        "/api/feedback",
        json={
            "record_id": unhelpful_chat.json()["record_id"],
            "session_id": "report-culture",
            "rating": "unhelpful",
            "feedback_text": "文化背景不够详细",
        },
    )
    assert helpful_feedback.status_code == 200
    assert unhelpful_feedback.status_code == 200

    response = client.get("/api/admin/visitor-report", params={"limit": 20})

    assert response.status_code == 200
    body = response.json()
    summary = body["summary"]
    assert summary["total_records"] == 3
    assert summary["feedback_count"] == 2
    assert summary["positive_count"] == 1
    assert summary["negative_count"] >= 1
    assert summary["low_confidence_count"] >= 1

    focus_topics = {item["topic"] for item in body["focus_points"]}
    assert "核心景点" in focus_topics
    assert "交通到达" in focus_topics
    assert body["sentiment_trend"][0]["total_count"] == 3
    assert body["suggestions"]
    assert all(item["title"] and item["action"] for item in body["suggestions"])
