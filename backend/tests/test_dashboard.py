from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.chat_record_service import ChatRecord, ChatRecordService


def test_admin_dashboard_returns_empty_7_day_contract(monkeypatch, tmp_path):
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("ACCURACY_METRICS_PATH", str(tmp_path / "accuracy_metrics.json"))

    client = TestClient(app)
    response = client.get("/api/admin/dashboard")

    assert response.status_code == 200
    body = response.json()

    assert body["summary"] == {
        "total_records": 0,
        "today_records": 0,
        "week_records": 0,
        "average_response_time_ms": 0,
        "low_confidence_count": 0,
        "accuracy_rate": 0.0,
        "feedback_total_count": 0,
        "feedback_helpful_count": 0,
        "feedback_unhelpful_count": 0,
        "feedback_helpful_rate": 0.0,
    }
    assert body["popular_questions"] == []
    assert body["visitor_analytics"] == {}
    assert len(body["weekly_service_trend"]) == 7
    assert len(body["satisfaction_trend"]) == 7
    assert [item["date"] for item in body["weekly_service_trend"]] == _last_7_dates()
    assert all(item["service_count"] == 0 for item in body["weekly_service_trend"])
    assert all(item["feedback_count"] == 0 for item in body["satisfaction_trend"])


def test_admin_dashboard_aggregates_trends_popular_questions_and_feedback(
    monkeypatch,
    tmp_path,
):
    database_path = tmp_path / "chat_records.db"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("ACCURACY_METRICS_PATH", str(tmp_path / "accuracy_metrics.json"))
    service = ChatRecordService()

    today = date.today()
    latest_gate_id = _save_record(
        service,
        created_on=today,
        session_id="today-gate",
        original_question="Where is the north gate?",
        cleaned_question="Where is the gate?",
        confidence=0.8,
        reliable=True,
        source_count=1,
        response_time_ms=100,
        database_path=database_path,
    )
    older_gate_id = _save_record(
        service,
        created_on=today - timedelta(days=2),
        session_id="older-gate",
        original_question="Where is the gate?",
        cleaned_question="Where is the gate?",
        confidence=0.6,
        reliable=True,
        source_count=1,
        response_time_ms=300,
        database_path=database_path,
    )
    _save_record(
        service,
        created_on=today - timedelta(days=3),
        session_id="low-confidence",
        original_question="Unrelated question",
        cleaned_question="Unrelated question",
        confidence=0.2,
        reliable=False,
        source_count=0,
        response_time_ms=500,
        database_path=database_path,
    )
    ticket_id = _save_record(
        service,
        created_on=today,
        session_id="ticket",
        original_question="How much is a ticket?",
        cleaned_question="How much is a ticket?",
        confidence=0.9,
        reliable=True,
        source_count=1,
        response_time_ms=200,
        database_path=database_path,
    )
    _save_record(
        service,
        created_on=today - timedelta(days=8),
        session_id="old",
        original_question="Old question",
        cleaned_question="Old question",
        confidence=0.7,
        reliable=True,
        source_count=1,
        response_time_ms=900,
        database_path=database_path,
    )

    service.save_feedback(
        record_id=latest_gate_id,
        session_id="today-gate",
        rating="helpful",
        feedback_text="clear",
    )
    _set_feedback_created_at(database_path, latest_gate_id, today)
    service.save_feedback(
        record_id=older_gate_id,
        session_id="older-gate",
        rating="unhelpful",
        feedback_text="needs more detail",
    )
    _set_feedback_created_at(database_path, older_gate_id, today - timedelta(days=2))
    service.save_feedback(
        record_id=ticket_id,
        session_id="ticket",
        rating="helpful",
        feedback_text="useful",
    )
    _set_feedback_created_at(database_path, ticket_id, today)

    client = TestClient(app)
    response = client.get("/api/admin/dashboard", params={"limit": 2})

    assert response.status_code == 200
    body = response.json()

    assert body["summary"]["total_records"] == 5
    assert body["summary"]["today_records"] == 2
    assert body["summary"]["week_records"] == 4
    assert body["summary"]["low_confidence_count"] == 1
    assert body["summary"]["accuracy_rate"] == 0.0
    assert body["summary"]["feedback_total_count"] == 3
    assert body["summary"]["feedback_helpful_count"] == 2
    assert body["summary"]["feedback_unhelpful_count"] == 1
    assert body["summary"]["feedback_helpful_rate"] == 0.67

    weekly_by_date = {item["date"]: item for item in body["weekly_service_trend"]}
    assert list(weekly_by_date) == _last_7_dates()
    assert weekly_by_date[today.isoformat()]["service_count"] == 2
    assert weekly_by_date[(today - timedelta(days=1)).isoformat()]["service_count"] == 0
    assert weekly_by_date[(today - timedelta(days=2)).isoformat()][
        "average_response_time_ms"
    ] == 300
    assert weekly_by_date[(today - timedelta(days=3)).isoformat()][
        "low_confidence_count"
    ] == 1

    popular_questions = body["popular_questions"]
    assert len(popular_questions) == 2
    assert popular_questions[0]["question"] == "Where is the gate?"
    assert popular_questions[0]["count"] == 2
    assert popular_questions[0]["average_confidence"] == 0.7
    assert popular_questions[0]["helpful_count"] == 1
    assert popular_questions[0]["unhelpful_count"] == 1
    assert popular_questions[1]["question"] == "How much is a ticket?"

    satisfaction_by_date = {item["date"]: item for item in body["satisfaction_trend"]}
    assert satisfaction_by_date[today.isoformat()] == {
        "date": today.isoformat(),
        "feedback_count": 2,
        "helpful_count": 2,
        "unhelpful_count": 0,
        "helpful_rate": 1.0,
    }
    assert satisfaction_by_date[(today - timedelta(days=2)).isoformat()][
        "helpful_rate"
    ] == 0.0
    assert satisfaction_by_date[(today - timedelta(days=1)).isoformat()][
        "feedback_count"
    ] == 0


def _save_record(
    service: ChatRecordService,
    *,
    created_on: date,
    session_id: str,
    original_question: str,
    cleaned_question: str,
    confidence: float,
    reliable: bool,
    source_count: int,
    response_time_ms: int,
    database_path: Path,
) -> int:
    record_id = service.save_record(
        ChatRecord(
            session_id=session_id,
            original_question=original_question,
            cleaned_question=cleaned_question,
            answer="answer",
            prompt_text="prompt",
            confidence=confidence,
            reliable=reliable,
            history_turns_used=0,
            source_count=source_count,
            sources=[{"text": "source", "score": 0.9}] if source_count else [],
            model_provider="mock",
            model_status="mock_response",
            response_time_ms=response_time_ms,
        )
    )
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "UPDATE chat_records SET created_at = ? WHERE id = ?",
            (f"{created_on.isoformat()} 12:00:00", record_id),
        )
        connection.commit()
    return record_id


def _set_feedback_created_at(
    database_path: Path,
    record_id: int,
    created_on: date,
) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "UPDATE chat_feedback SET created_at = ? WHERE record_id = ?",
            (f"{created_on.isoformat()} 12:00:00", record_id),
        )
        connection.commit()


def _last_7_dates() -> list[str]:
    today = date.today()
    return [(today - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
