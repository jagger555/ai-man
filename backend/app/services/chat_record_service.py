from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from app.core.config import DatabaseConfig, get_database_config
from app.services.visitor_analytics_service import VisitorAnalyticsService


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chat_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    original_question TEXT NOT NULL,
    cleaned_question TEXT NOT NULL,
    answer TEXT NOT NULL,
    prompt_text TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL,
    reliable INTEGER NOT NULL,
    history_turns_used INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL,
    sources_json TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_status TEXT NOT NULL,
    response_time_ms INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

FEEDBACK_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chat_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    feedback_text TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(record_id) REFERENCES chat_records(id)
)
"""


@dataclass(frozen=True)
class ChatRecord:
    session_id: str
    original_question: str
    cleaned_question: str
    answer: str
    prompt_text: str
    confidence: float
    reliable: bool
    history_turns_used: int
    source_count: int
    sources: list[dict[str, str | int | float]]
    model_provider: str
    model_status: str
    response_time_ms: int


class ChatRecordService:
    def __init__(self, config: DatabaseConfig | None = None):
        self._config = config or get_database_config()

    def save_record(self, record: ChatRecord) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO chat_records (
                    session_id,
                    original_question,
                    cleaned_question,
                    answer,
                    prompt_text,
                    confidence,
                    reliable,
                    history_turns_used,
                    source_count,
                    sources_json,
                    model_provider,
                    model_status,
                    response_time_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.session_id,
                    record.original_question,
                    record.cleaned_question,
                    record.answer,
                    record.prompt_text,
                    record.confidence,
                    int(record.reliable),
                    record.history_turns_used,
                    record.source_count,
                    json.dumps(record.sources, ensure_ascii=False),
                    record.model_provider,
                    record.model_status,
                    record.response_time_ms,
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def list_recent_records(self, limit: int = 20) -> list[dict[str, object]]:
        rows = self._fetch_rows(
            """
            SELECT id, session_id, original_question, cleaned_question, answer,
                   prompt_text, confidence, reliable, history_turns_used,
                   source_count, sources_json, model_provider,
                   model_status, response_time_ms, created_at
            FROM chat_records
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [_row_to_record(row) for row in rows]

    def list_session_records(
        self,
        session_id: str,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        rows = self._fetch_rows(
            """
            SELECT id, session_id, original_question, cleaned_question, answer,
                   prompt_text, confidence, reliable, history_turns_used,
                   source_count, sources_json, model_provider,
                   model_status, response_time_ms, created_at
            FROM chat_records
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, limit),
        )
        return [_row_to_record(row) for row in rows]

    def count_records(self, session_id: str | None = None) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            if session_id:
                row = connection.execute(
                    "SELECT COUNT(*) FROM chat_records WHERE session_id = ?",
                    (session_id,),
                ).fetchone()
            else:
                row = connection.execute("SELECT COUNT(*) FROM chat_records").fetchone()

        return int(row[0]) if row else 0

    def list_low_confidence_records(self, limit: int = 20) -> list[dict[str, object]]:
        rows = self._fetch_rows(
            """
            SELECT id, session_id, original_question, cleaned_question, answer,
                   prompt_text, confidence, reliable, history_turns_used,
                   source_count, sources_json, model_provider,
                   model_status, response_time_ms, created_at
            FROM chat_records
            WHERE reliable = 0 OR confidence < 0.5 OR source_count = 0
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [_row_to_low_confidence_record(row) for row in rows]

    def count_low_confidence_records(self) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            row = connection.execute(
                """
                SELECT COUNT(*)
                FROM chat_records
                WHERE reliable = 0 OR confidence < 0.5 OR source_count = 0
                """
            ).fetchone()
        return int(row[0]) if row else 0

    def get_overview_metrics(self) -> dict[str, int]:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            row = connection.execute(
                """
                SELECT
                    COUNT(*) AS total_records,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN DATE(created_at, 'localtime') = DATE('now', 'localtime')
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS today_records,
                    COALESCE(ROUND(AVG(response_time_ms)), 0) AS average_response_time_ms,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN reliable = 0 OR confidence < 0.5 OR source_count = 0
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS low_confidence_count,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN model_status LIKE 'fallback_to_mock:%' THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS fallback_count,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN model_provider = 'mock'
                                     AND model_status NOT LIKE 'fallback_to_mock:%'
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS mock_model_count,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN model_provider NOT IN ('mock', 'retrieval_guard')
                                     AND model_status NOT LIKE 'fallback_to_mock:%'
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS real_model_count
                FROM chat_records
                """
            ).fetchone()

        if row is None:
            return {
                "total_records": 0,
                "today_records": 0,
                "average_response_time_ms": 0,
                "low_confidence_count": 0,
                "real_model_count": 0,
                "mock_model_count": 0,
                "fallback_count": 0,
                "feedback_total_count": 0,
                "feedback_helpful_count": 0,
                "feedback_unhelpful_count": 0,
                "feedback_helpful_rate": 0.0,
            }

        feedback_total_count = self.count_feedback()
        feedback_helpful_count = self.count_feedback(rating="helpful")
        feedback_unhelpful_count = self.count_feedback(rating="unhelpful")
        feedback_helpful_rate = (
            round(feedback_helpful_count / feedback_total_count, 2)
            if feedback_total_count > 0
            else 0.0
        )

        return {
            "total_records": int(row[0]),
            "today_records": int(row[1]),
            "average_response_time_ms": int(row[2]),
            "low_confidence_count": int(row[3]),
            "fallback_count": int(row[4]),
            "mock_model_count": int(row[5]),
            "real_model_count": int(row[6]),
            "feedback_total_count": feedback_total_count,
            "feedback_helpful_count": feedback_helpful_count,
            "feedback_unhelpful_count": feedback_unhelpful_count,
            "feedback_helpful_rate": feedback_helpful_rate,
        }

    def get_dashboard_metrics(self, limit: int = 8) -> dict[str, object]:
        limit = min(max(limit, 1), 50)
        self._ensure_database()

        today = date.today()
        trend_dates = [today - timedelta(days=offset) for offset in range(6, -1, -1)]
        trend_start = trend_dates[0].isoformat()

        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row

            summary_row = connection.execute(
                """
                SELECT
                    COUNT(*) AS total_records,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN DATE(created_at, 'localtime') = DATE('now', 'localtime')
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS today_records,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-6 day')
                                     AND DATE(created_at, 'localtime') <= DATE('now', 'localtime')
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS week_records,
                    COALESCE(ROUND(AVG(response_time_ms)), 0) AS average_response_time_ms,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN reliable = 0 OR confidence < 0.5 OR source_count = 0
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS low_confidence_count
                FROM chat_records
                """
            ).fetchone()

            feedback_summary_row = connection.execute(
                """
                SELECT
                    COUNT(*) AS feedback_total_count,
                    COALESCE(SUM(CASE WHEN rating = 'helpful' THEN 1 ELSE 0 END), 0)
                        AS feedback_helpful_count,
                    COALESCE(SUM(CASE WHEN rating = 'unhelpful' THEN 1 ELSE 0 END), 0)
                        AS feedback_unhelpful_count
                FROM chat_feedback
                """
            ).fetchone()

            weekly_rows = connection.execute(
                """
                SELECT
                    DATE(created_at, 'localtime') AS record_date,
                    COUNT(*) AS service_count,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN reliable = 0 OR confidence < 0.5 OR source_count = 0
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS low_confidence_count,
                    COALESCE(ROUND(AVG(response_time_ms)), 0) AS average_response_time_ms
                FROM chat_records
                WHERE DATE(created_at, 'localtime') >= ?
                  AND DATE(created_at, 'localtime') <= DATE('now', 'localtime')
                GROUP BY record_date
                """,
                (trend_start,),
            ).fetchall()

            popular_rows = connection.execute(
                """
                SELECT
                    questions.question AS question,
                    COUNT(*) AS count,
                    MAX(questions.created_at) AS latest_at,
                    COALESCE(ROUND(AVG(questions.confidence), 2), 0) AS average_confidence,
                    COALESCE(
                        SUM(CASE WHEN feedback.rating = 'helpful' THEN 1 ELSE 0 END),
                        0
                    ) AS helpful_count,
                    COALESCE(
                        SUM(CASE WHEN feedback.rating = 'unhelpful' THEN 1 ELSE 0 END),
                        0
                    ) AS unhelpful_count
                FROM (
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(cleaned_question), ''), original_question)
                            AS question,
                        confidence,
                        created_at
                    FROM chat_records
                ) AS questions
                LEFT JOIN chat_feedback AS feedback
                  ON feedback.record_id = questions.id
                GROUP BY questions.question
                ORDER BY count DESC, latest_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            satisfaction_rows = connection.execute(
                """
                SELECT
                    DATE(created_at, 'localtime') AS feedback_date,
                    COUNT(*) AS feedback_count,
                    COALESCE(SUM(CASE WHEN rating = 'helpful' THEN 1 ELSE 0 END), 0)
                        AS helpful_count,
                    COALESCE(SUM(CASE WHEN rating = 'unhelpful' THEN 1 ELSE 0 END), 0)
                        AS unhelpful_count
                FROM chat_feedback
                WHERE DATE(created_at, 'localtime') >= ?
                  AND DATE(created_at, 'localtime') <= DATE('now', 'localtime')
                GROUP BY feedback_date
                """,
                (trend_start,),
            ).fetchall()

        feedback_total_count = int(feedback_summary_row["feedback_total_count"])
        feedback_helpful_count = int(feedback_summary_row["feedback_helpful_count"])
        feedback_unhelpful_count = int(feedback_summary_row["feedback_unhelpful_count"])

        weekly_by_date = {row["record_date"]: row for row in weekly_rows}
        satisfaction_by_date = {row["feedback_date"]: row for row in satisfaction_rows}

        summary = {
            "total_records": int(summary_row["total_records"]),
            "today_records": int(summary_row["today_records"]),
            "week_records": int(summary_row["week_records"]),
            "average_response_time_ms": int(summary_row["average_response_time_ms"]),
            "low_confidence_count": int(summary_row["low_confidence_count"]),
            "accuracy_rate": _load_latest_accuracy_rate(),
            "feedback_total_count": feedback_total_count,
            "feedback_helpful_count": feedback_helpful_count,
            "feedback_unhelpful_count": feedback_unhelpful_count,
            "feedback_helpful_rate": _safe_rate(
                feedback_helpful_count,
                feedback_total_count,
            ),
        }

        return {
            "summary": summary,
            "weekly_service_trend": [
                _weekly_trend_item(day, weekly_by_date.get(day.isoformat()))
                for day in trend_dates
            ],
            "popular_questions": [
                {
                    "question": row["question"],
                    "count": int(row["count"]),
                    "latest_at": row["latest_at"],
                    "average_confidence": float(row["average_confidence"]),
                    "helpful_count": int(row["helpful_count"]),
                    "unhelpful_count": int(row["unhelpful_count"]),
                }
                for row in popular_rows
            ],
            "satisfaction_trend": [
                _satisfaction_trend_item(day, satisfaction_by_date.get(day.isoformat()))
                for day in trend_dates
            ],
            "visitor_analytics": (
                VisitorAnalyticsService().get_summary()
                if summary["total_records"] > 0
                else {}
            ),
        }

    def save_feedback(
        self,
        *,
        record_id: int,
        session_id: str,
        rating: str,
        feedback_text: str,
    ) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO chat_feedback (
                    record_id,
                    session_id,
                    rating,
                    feedback_text
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(record_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    rating = excluded.rating,
                    feedback_text = excluded.feedback_text,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
                """,
                (record_id, session_id, rating, feedback_text),
            )
            row = cursor.fetchone()
            connection.commit()
            return int(row[0]) if row else 0

    def list_feedback(
        self,
        limit: int = 20,
        rating: str | None = None,
    ) -> list[dict[str, object]]:
        if rating:
            sql = """
                SELECT
                    feedback.id,
                    feedback.record_id,
                    feedback.session_id,
                    feedback.rating,
                    feedback.feedback_text,
                    feedback.created_at,
                    feedback.updated_at,
                    records.original_question,
                    records.answer
                FROM chat_feedback AS feedback
                JOIN chat_records AS records
                  ON records.id = feedback.record_id
                WHERE feedback.rating = ?
                ORDER BY feedback.id DESC
                LIMIT ?
            """
            params: tuple[object, ...] = (rating, limit)
        else:
            sql = """
                SELECT
                    feedback.id,
                    feedback.record_id,
                    feedback.session_id,
                    feedback.rating,
                    feedback.feedback_text,
                    feedback.created_at,
                    feedback.updated_at,
                    records.original_question,
                    records.answer
                FROM chat_feedback AS feedback
                JOIN chat_records AS records
                  ON records.id = feedback.record_id
                ORDER BY feedback.id DESC
                LIMIT ?
            """
            params = (limit,)

        rows = self._fetch_rows(sql, params)
        return [
            {
                "id": int(row["id"]),
                "record_id": int(row["record_id"]),
                "session_id": row["session_id"],
                "rating": row["rating"],
                "feedback_text": row["feedback_text"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "original_question": row["original_question"],
                "answer": row["answer"],
            }
            for row in rows
        ]

    def count_feedback(self, rating: str | None = None) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            if rating:
                row = connection.execute(
                    "SELECT COUNT(*) FROM chat_feedback WHERE rating = ?",
                    (rating,),
                ).fetchone()
            else:
                row = connection.execute("SELECT COUNT(*) FROM chat_feedback").fetchone()
        return int(row[0]) if row else 0

    def _fetch_rows(
        self,
        sql: str,
        params: tuple[object, ...],
    ) -> list[sqlite3.Row]:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row
            return connection.execute(sql, params).fetchall()

    def _ensure_database(self) -> None:
        database_path = self._config.path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(database_path) as connection:
            connection.execute(SCHEMA_SQL)
            connection.execute(FEEDBACK_SCHEMA_SQL)
            _ensure_required_columns(connection)
            connection.commit()


def _row_to_record(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": int(row["id"]),
        "session_id": row["session_id"],
        "original_question": row["original_question"],
        "cleaned_question": row["cleaned_question"],
        "answer": row["answer"],
        "prompt_text": row["prompt_text"],
        "confidence": float(row["confidence"]),
        "reliable": bool(row["reliable"]),
        "history_turns_used": int(row["history_turns_used"]),
        "source_count": int(row["source_count"]),
        "sources": json.loads(row["sources_json"]),
        "model_provider": row["model_provider"],
        "model_status": row["model_status"],
        "response_time_ms": int(row["response_time_ms"]),
        "created_at": row["created_at"],
    }


def _row_to_low_confidence_record(row: sqlite3.Row) -> dict[str, object]:
    record = _row_to_record(row)
    sources = record["sources"]
    top_score = 0.0
    if isinstance(sources, list) and sources:
        try:
            top_score = max(float(source.get("score", 0)) for source in sources)
        except (AttributeError, TypeError, ValueError):
            top_score = 0.0

    record["top_score"] = round(top_score, 2)
    record["issue_reason"] = _infer_issue_reason(
        reliable=bool(record["reliable"]),
        source_count=int(record["source_count"]),
        model_status=str(record["model_status"]),
    )
    return record


def _weekly_trend_item(day: date, row: sqlite3.Row | None) -> dict[str, object]:
    if row is None:
        return {
            "date": day.isoformat(),
            "service_count": 0,
            "low_confidence_count": 0,
            "average_response_time_ms": 0,
        }

    return {
        "date": day.isoformat(),
        "service_count": int(row["service_count"]),
        "low_confidence_count": int(row["low_confidence_count"]),
        "average_response_time_ms": int(row["average_response_time_ms"]),
    }


def _satisfaction_trend_item(day: date, row: sqlite3.Row | None) -> dict[str, object]:
    if row is None:
        return {
            "date": day.isoformat(),
            "feedback_count": 0,
            "helpful_count": 0,
            "unhelpful_count": 0,
            "helpful_rate": 0.0,
        }

    feedback_count = int(row["feedback_count"])
    helpful_count = int(row["helpful_count"])
    return {
        "date": day.isoformat(),
        "feedback_count": feedback_count,
        "helpful_count": helpful_count,
        "unhelpful_count": int(row["unhelpful_count"]),
        "helpful_rate": _safe_rate(helpful_count, feedback_count),
    }


def _safe_rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 2) if denominator > 0 else 0.0


def _load_latest_accuracy_rate() -> float:
    metrics_path = Path(
        os.getenv(
            "ACCURACY_METRICS_PATH",
            str(
                Path(__file__).resolve().parents[3]
                / "data"
                / "runtime"
                / "accuracy_metrics.json"
            ),
        )
    )
    if not metrics_path.exists():
        return 0.0
    try:
        payload = json.loads(metrics_path.read_text(encoding="utf-8"))
        return round(float(payload.get("accuracy_rate", 0.0)), 2)
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return 0.0


def _infer_issue_reason(
    *,
    reliable: bool,
    source_count: int,
    model_status: str,
) -> str:
    if source_count == 0:
        return "资料不足"
    if model_status.startswith("fallback_to_mock:"):
        return "模型降级"
    if not reliable:
        return "命中不足"
    return "需要复核"


def _ensure_required_columns(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(chat_records)").fetchall()
    }
    required_columns = {
        "prompt_text": "ALTER TABLE chat_records ADD COLUMN prompt_text TEXT NOT NULL DEFAULT ''",
        "history_turns_used": "ALTER TABLE chat_records ADD COLUMN history_turns_used INTEGER NOT NULL DEFAULT 0",
    }

    for column_name, sql in required_columns.items():
        if column_name not in existing_columns:
            connection.execute(sql)
