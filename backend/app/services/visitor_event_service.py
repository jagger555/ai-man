from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from app.core.config import DatabaseConfig, get_database_config


RETENTION_DAYS = 90

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS visitor_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at
ON visitor_events(created_at)
"""

SESSION_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_visitor_events_session
ON visitor_events(session_id, created_at)
"""

FEATURE_PAGES = {"route", "map", "vr", "performance", "services"}
ACTION_EVENTS = {
    "route_generate",
    "route_adjust",
    "route_confirm",
    "map_search",
    "navigation_request",
    "performance_view",
    "service_category",
    "chat_question",
    "feedback",
}
COMPLETION_EVENTS = {"route_confirm", "navigation_success", "feedback"}

EVENT_GROUPS = {
    "内容浏览": {"page_view", "page_dwell", "vr_load", "performance_view"},
    "路线与导航": {
        "route_generate",
        "route_adjust",
        "route_confirm",
        "map_search",
        "navigation_request",
        "navigation_success",
        "navigation_failure",
    },
    "服务咨询": {"service_category", "chat_question", "chat_reliability", "feedback"},
    "偏好表达": {"preference_select"},
}

METADATA_FIELDS = {
    "page_view": set(),
    "page_dwell": {"seconds"},
    "preference_select": {"category", "values"},
    "route_generate": {"routeId", "durationMinutes", "score"},
    "route_adjust": {"routeId", "adjustment"},
    "route_confirm": {"routeId", "durationMinutes"},
    "map_search": {"destination", "source"},
    "navigation_request": {"startMode", "destination"},
    "navigation_success": {"destination", "distance", "duration"},
    "navigation_failure": {"destination", "reason"},
    "vr_load": {"state"},
    "performance_view": {"performanceId"},
    "service_category": {"category", "action"},
    "chat_question": {"length"},
    "chat_reliability": {"reliable", "confidence", "sourceCount", "latencyMs"},
    "feedback": {"rating"},
}


class VisitorEventService:
    def __init__(self, config: DatabaseConfig | None = None):
        self._config = config or get_database_config()

    def record_event(
        self,
        *,
        session_id: str,
        event_type: str,
        page: str = "",
        entity_type: str = "",
        entity_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> int:
        self._ensure_database()
        safe_metadata = _sanitize_metadata(event_type, metadata or {})
        with sqlite3.connect(self._config.path) as connection:
            self._purge_expired(connection)
            cursor = connection.execute(
                """
                INSERT INTO visitor_events (
                    session_id, event_type, page, entity_type, entity_id, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id.strip(),
                    event_type,
                    page.strip(),
                    entity_type.strip(),
                    entity_id.strip(),
                    json.dumps(safe_metadata, ensure_ascii=False),
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def build_insights(self, days: int = 7) -> dict[str, object]:
        days = days if days in {1, 7, 30} else 7
        self._ensure_database()
        start_date = (date.today() - timedelta(days=days - 1)).isoformat()
        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row
            self._purge_expired(connection)
            rows = connection.execute(
                """
                SELECT session_id, event_type, page, entity_type, entity_id,
                       metadata_json, DATETIME(created_at, 'localtime') AS created_at
                FROM visitor_events
                WHERE DATE(created_at, 'localtime') >= ?
                ORDER BY created_at ASC, id ASC
                """,
                (start_date,),
            ).fetchall()
            connection.commit()

        events = [_row_to_event(row) for row in rows]
        return _build_insights(events, days)

    def purge_expired(self) -> int:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            deleted = self._purge_expired(connection)
            connection.commit()
            return deleted

    def _ensure_database(self) -> None:
        self._config.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._config.path) as connection:
            connection.execute(SCHEMA_SQL)
            connection.execute(INDEX_SQL)
            connection.execute(SESSION_INDEX_SQL)
            connection.commit()

    def _purge_expired(self, connection: sqlite3.Connection) -> int:
        cursor = connection.execute(
            "DELETE FROM visitor_events WHERE created_at < DATETIME('now', ?)",
            (f"-{RETENTION_DAYS} days",),
        )
        return max(0, int(cursor.rowcount))


def _sanitize_metadata(event_type: str, metadata: dict[str, Any]) -> dict[str, object]:
    result: dict[str, object] = {}
    allowed_fields = METADATA_FIELDS.get(event_type, set())
    for raw_key, raw_value in list(metadata.items())[:20]:
        key = str(raw_key).strip()[:50]
        if not key or key not in allowed_fields or raw_value is None:
            continue
        if isinstance(raw_value, bool):
            result[key] = raw_value
        elif isinstance(raw_value, (int, float)):
            result[key] = raw_value
        elif isinstance(raw_value, list):
            result[key] = [str(value).strip()[:80] for value in raw_value[:12]]
        else:
            result[key] = str(raw_value).strip()[:200]
    return result


def _row_to_event(row: sqlite3.Row) -> dict[str, object]:
    try:
        metadata = json.loads(row["metadata_json"] or "{}")
    except json.JSONDecodeError:
        metadata = {}
    return {
        "session_id": str(row["session_id"]),
        "event_type": str(row["event_type"]),
        "page": str(row["page"] or ""),
        "entity_type": str(row["entity_type"] or ""),
        "entity_id": str(row["entity_id"] or ""),
        "metadata": metadata if isinstance(metadata, dict) else {},
        "created_at": str(row["created_at"]),
    }


def _build_insights(events: list[dict[str, object]], days: int) -> dict[str, object]:
    sessions = {str(event["session_id"]) for event in events}
    feature_sessions = {
        str(event["session_id"])
        for event in events
        if event["event_type"] == "page_view" and event["page"] in FEATURE_PAGES
    }
    action_sessions = {
        str(event["session_id"])
        for event in events
        if event["event_type"] in ACTION_EVENTS
    }
    completed_sessions = {
        str(event["session_id"])
        for event in events
        if event["event_type"] in COMPLETION_EVENTS
    }

    session_times: dict[str, list[datetime]] = defaultdict(list)
    for event in events:
        parsed = _parse_datetime(str(event["created_at"]))
        if parsed:
            session_times[str(event["session_id"])].append(parsed)
    durations = [
        max(0.0, (max(values) - min(values)).total_seconds())
        for values in session_times.values()
        if values
    ]

    page_views: Counter[str] = Counter()
    page_sessions: dict[str, set[str]] = defaultdict(set)
    page_dwell: dict[str, list[float]] = defaultdict(list)
    service_categories: Counter[str] = Counter()
    preference_counts: Counter[str] = Counter()
    daily_events: Counter[str] = Counter()
    daily_sessions: dict[str, set[str]] = defaultdict(set)
    daily_actions: Counter[str] = Counter()

    for event in events:
        event_type = str(event["event_type"])
        page = str(event["page"] or "home")
        session_id = str(event["session_id"])
        day = str(event["created_at"])[:10]
        metadata = event["metadata"] if isinstance(event["metadata"], dict) else {}
        daily_events[day] += 1
        daily_sessions[day].add(session_id)
        if event_type in ACTION_EVENTS:
            daily_actions[day] += 1
        if event_type == "page_view":
            page_views[page] += 1
            page_sessions[page].add(session_id)
        elif event_type == "page_dwell":
            seconds = _to_float(metadata.get("seconds"))
            if seconds > 0:
                page_dwell[page].append(min(seconds, 3600.0))
        elif event_type == "service_category":
            label = str(metadata.get("category") or event["entity_id"] or "其他服务")
            service_categories[label] += 1
        elif event_type == "preference_select":
            values = metadata.get("values", [])
            if isinstance(values, list):
                preference_counts.update(str(value) for value in values if str(value).strip())

    page_labels = {
        "home": "首页",
        "route": "游览路线",
        "map": "地图导航",
        "vr": "VR 实景",
        "performance": "演出时间",
        "services": "游客服务",
    }
    page_engagement = [
        {
            "page": page,
            "label": label,
            "views": page_views[page],
            "unique_sessions": len(page_sessions[page]),
            "average_dwell_seconds": round(
                sum(page_dwell[page]) / len(page_dwell[page]), 1
            ) if page_dwell[page] else 0.0,
        }
        for page, label in page_labels.items()
    ]

    trend_days = [date.today() - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
    daily_trend = [
        {
            "date": day.isoformat(),
            "sessions": len(daily_sessions[day.isoformat()]),
            "events": daily_events[day.isoformat()],
            "actions": daily_actions[day.isoformat()],
        }
        for day in trend_days
    ]

    group_distribution = []
    for label, event_types in EVENT_GROUPS.items():
        count = sum(1 for event in events if event["event_type"] in event_types)
        group_distribution.append(
            {"label": label, "count": count, "share": _safe_rate(count, len(events))}
        )
    event_counts = Counter(str(event["event_type"]) for event in events)

    return {
        "summary": {
            "period_days": days,
            "anonymous_sessions": len(sessions),
            "event_count": len(events),
            "feature_sessions": len(feature_sessions),
            "action_sessions": len(action_sessions),
            "completed_sessions": len(completed_sessions),
            "feature_reach_rate": _safe_rate(len(feature_sessions), len(sessions)),
            "action_rate": _safe_rate(len(action_sessions), len(sessions)),
            "average_session_minutes": round(
                (sum(durations) / len(durations)) / 60, 1
            ) if durations else 0.0,
        },
        "journey_funnel": [
            {"stage": "匿名访问", "sessions": len(sessions)},
            {"stage": "进入功能页", "sessions": len(feature_sessions & sessions)},
            {"stage": "发起服务动作", "sessions": len(action_sessions & sessions)},
            {"stage": "完成关键动作", "sessions": len(completed_sessions & sessions)},
        ],
        "page_engagement": page_engagement,
        "event_distribution": group_distribution,
        "event_counts": dict(event_counts),
        "service_categories": _counter_items(service_categories, 8),
        "route_preferences": _counter_items(preference_counts, 10),
        "daily_trend": daily_trend,
        "data_policy": {
            "anonymous": True,
            "retention_days": RETENTION_DAYS,
            "excluded": ["姓名", "手机号", "原始语音", "精确定位轨迹"],
        },
    }


def _counter_items(counter: Counter[str], limit: int) -> list[dict[str, object]]:
    total = sum(counter.values())
    return [
        {"label": label, "count": count, "share": _safe_rate(count, total)}
        for label, count in counter.most_common(limit)
    ]


def _parse_datetime(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _to_float(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 3) if denominator else 0.0
