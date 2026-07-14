from __future__ import annotations

import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from app.core.config import DatabaseConfig, get_database_config
from app.services.chat_record_service import ChatRecordService


@dataclass(frozen=True)
class FocusRule:
    name: str
    keywords: tuple[str, ...]


FOCUS_RULES = (
    FocusRule("核心景点", ("灵山大佛", "大佛", "佛像", "九龙灌浴", "梵宫")),
    FocusRule("文史文化", ("历史", "文化", "典故", "寓意", "佛教", "故事", "背景")),
    FocusRule("游览体验", ("体验", "表演", "活动", "演出", "游玩", "推荐", "路线")),
    FocusRule("开放时间", ("时间", "开放", "几点", "多久", "闭园", "入园")),
    FocusRule("票务服务", ("门票", "预约", "价格", "优惠", "购票", "退票")),
    FocusRule("交通到达", ("交通", "停车", "地铁", "公交", "怎么去", "导航")),
    FocusRule("配套服务", ("餐饮", "厕所", "卫生间", "休息", "商店", "行李")),
)


class VisitorReportService:
    def __init__(self, config: DatabaseConfig | None = None):
        self._config = config or get_database_config()

    def build_report(self, limit: int = 200, days: int = 7) -> dict[str, object]:
        days = days if days in {1, 7, 30} else 7
        start_date = (date.today() - timedelta(days=days - 1)).isoformat()
        rows = self._load_question_rows(limit=limit, start_date=start_date)
        emoji_rows = self._load_emoji_rows(start_date=start_date)
        focus_points = _build_focus_points(rows)
        feedback_trend = _build_feedback_trend(rows, days)
        summary = _build_summary(rows, focus_points, emoji_rows, days)
        suggestions = _build_suggestions(summary, focus_points, feedback_trend)

        return {
            "summary": summary,
            "focus_points": focus_points,
            "feedback_trend": feedback_trend,
            "emoji_distribution": _build_emoji_distribution(emoji_rows),
            "emoji_trend": _build_emoji_trend(emoji_rows, days),
            # 保留旧字段供既有调用方平滑升级；数据仅来自服务反馈，不做情绪推断。
            "sentiment_trend": [
                {
                    "date": item["date"],
                    "positive_count": item["helpful_count"],
                    "neutral_count": item["unrated_count"],
                    "negative_count": item["unhelpful_count"],
                    "total_count": item["question_count"],
                    "positive_rate": item["helpful_rate"],
                    "negative_rate": item["unhelpful_rate"],
                }
                for item in feedback_trend
            ],
            "suggestions": suggestions,
        }

    def _load_question_rows(
        self, *, limit: int, start_date: str
    ) -> list[dict[str, object]]:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT records.id, records.session_id, records.original_question,
                    records.cleaned_question, records.answer, records.confidence,
                    records.reliable, records.source_count,
                    DATETIME(records.created_at, 'localtime') AS created_at,
                    feedback.rating, feedback.feedback_text,
                    feedback.updated_at AS feedback_updated_at
                FROM chat_records AS records
                LEFT JOIN chat_feedback AS feedback ON feedback.record_id = records.id
                WHERE records.interaction_type = 'question'
                  AND DATE(records.created_at, 'localtime') >= ?
                ORDER BY records.id DESC
                LIMIT ?
                """,
                (start_date, limit),
            ).fetchall()

        return [
            {
                "id": int(row["id"]),
                "session_id": row["session_id"],
                "original_question": row["original_question"],
                "cleaned_question": row["cleaned_question"],
                "answer": row["answer"],
                "confidence": float(row["confidence"]),
                "reliable": bool(row["reliable"]),
                "source_count": int(row["source_count"]),
                "created_at": row["created_at"],
                "rating": row["rating"],
                "feedback_text": row["feedback_text"] or "",
                "feedback_updated_at": row["feedback_updated_at"],
                "focus": _infer_focus(row["original_question"]),
            }
            for row in rows
        ]

    def _load_emoji_rows(self, *, start_date: str) -> list[dict[str, str]]:
        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT emoji_value, DATETIME(created_at, 'localtime') AS created_at
                FROM chat_records
                WHERE interaction_type = 'emoji'
                  AND DATE(created_at, 'localtime') >= ?
                ORDER BY id DESC
                """,
                (start_date,),
            ).fetchall()
        return [
            {"emoji_value": row["emoji_value"] or "other", "created_at": row["created_at"]}
            for row in rows
        ]

    def _ensure_database(self) -> None:
        ChatRecordService(self._config).count_records()


def _build_summary(
    rows: list[dict[str, object]],
    focus_points: list[dict[str, object]],
    emoji_rows: list[dict[str, str]],
    days: int,
) -> dict[str, object]:
    total = len(rows)
    helpful_count = sum(1 for row in rows if row["rating"] == "helpful")
    unhelpful_count = sum(1 for row in rows if row["rating"] == "unhelpful")
    feedback_count = helpful_count + unhelpful_count
    low_confidence_count = sum(1 for row in rows if _is_low_confidence(row))
    average_confidence = (
        round(sum(float(row["confidence"]) for row in rows) / total, 2) if total else 0.0
    )
    top_focus = str(focus_points[0]["topic"]) if focus_points else ""

    return {
        "total_records": total,
        "question_count": total,
        "emoji_interaction_count": len(emoji_rows),
        "period_days": days,
        "feedback_count": feedback_count,
        "helpful_count": helpful_count,
        "unhelpful_count": unhelpful_count,
        "unrated_count": total - feedback_count,
        "helpful_rate": _safe_rate(helpful_count, feedback_count),
        "unhelpful_rate": _safe_rate(unhelpful_count, feedback_count),
        "low_confidence_count": low_confidence_count,
        "low_confidence_rate": _safe_rate(low_confidence_count, total),
        "average_confidence": average_confidence,
        "top_focus": top_focus,
        # 兼容旧客户端，含义为服务反馈而非游客情绪。
        "positive_count": helpful_count,
        "neutral_count": total - feedback_count,
        "negative_count": unhelpful_count,
        "positive_rate": _safe_rate(helpful_count, feedback_count),
        "negative_rate": _safe_rate(unhelpful_count, feedback_count),
    }


def _build_focus_points(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    buckets: dict[str, dict[str, object]] = {}
    for row in rows:
        focus = str(row["focus"])
        bucket = buckets.setdefault(
            focus,
            {
                "topic": focus,
                "count": 0,
                "helpful_count": 0,
                "unhelpful_count": 0,
                "low_confidence_count": 0,
                "confidence_total": 0.0,
                "sample_questions": [],
                "keywords": set(),
            },
        )
        bucket["count"] = int(bucket["count"]) + 1
        bucket["confidence_total"] = float(bucket["confidence_total"]) + float(row["confidence"])
        if row["rating"] == "helpful":
            bucket["helpful_count"] = int(bucket["helpful_count"]) + 1
        if row["rating"] == "unhelpful":
            bucket["unhelpful_count"] = int(bucket["unhelpful_count"]) + 1
        if _is_low_confidence(row):
            bucket["low_confidence_count"] = int(bucket["low_confidence_count"]) + 1
        samples = bucket["sample_questions"]
        if isinstance(samples, list) and len(samples) < 3:
            samples.append(row["original_question"])
        keywords = bucket["keywords"]
        if isinstance(keywords, set):
            keywords.update(_extract_keywords(str(row["original_question"])))

    result: list[dict[str, object]] = []
    for bucket in buckets.values():
        count = int(bucket["count"])
        helpful_count = int(bucket["helpful_count"])
        unhelpful_count = int(bucket["unhelpful_count"])
        result.append(
            {
                "topic": bucket["topic"],
                "count": count,
                "share": _safe_rate(count, len(rows)),
                "helpful_count": helpful_count,
                "unhelpful_count": unhelpful_count,
                "positive_count": helpful_count,
                "negative_count": unhelpful_count,
                "low_confidence_count": bucket["low_confidence_count"],
                "average_confidence": round(float(bucket["confidence_total"]) / count, 2),
                "sample_questions": bucket["sample_questions"],
                "keywords": sorted(bucket["keywords"], key=lambda item: (-len(item), item))[:5],
            }
        )
    return sorted(result, key=lambda item: (-int(item["count"]), str(item["topic"])))


def _build_feedback_trend(
    rows: list[dict[str, object]], days: int
) -> list[dict[str, object]]:
    today = date.today()
    trend_dates = [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {"question_count": 0, "helpful_count": 0, "unhelpful_count": 0}
    )
    for row in rows:
        day = str(row["created_at"])[:10]
        buckets[day]["question_count"] += 1
        if row["rating"] in {"helpful", "unhelpful"}:
            buckets[day][f"{row['rating']}_count"] += 1

    result = []
    for day in trend_dates:
        values = buckets[day.isoformat()]
        feedback_count = values["helpful_count"] + values["unhelpful_count"]
        result.append(
            {
                "date": day.isoformat(),
                **values,
                "unrated_count": values["question_count"] - feedback_count,
                "helpful_rate": _safe_rate(values["helpful_count"], feedback_count),
                "unhelpful_rate": _safe_rate(values["unhelpful_count"], feedback_count),
            }
        )
    return result


def _build_emoji_distribution(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    counts = Counter(row["emoji_value"] for row in rows)
    return [
        {"emoji": emoji, "count": count, "share": _safe_rate(count, len(rows))}
        for emoji, count in counts.most_common()
    ]


def _build_emoji_trend(rows: list[dict[str, str]], days: int) -> list[dict[str, object]]:
    counts = Counter(str(row["created_at"])[:10] for row in rows)
    today = date.today()
    return [
        {"date": day.isoformat(), "count": counts.get(day.isoformat(), 0)}
        for day in [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
    ]


def _build_suggestions(
    summary: dict[str, object],
    focus_points: list[dict[str, object]],
    feedback_trend: list[dict[str, object]],
) -> list[dict[str, object]]:
    suggestions: list[dict[str, object]] = []
    if float(summary["low_confidence_rate"]) >= 0.3:
        suggestions.append(
            {
                "priority": "high",
                "title": "优先补齐低命中知识",
                "reason": f"近期待复核问题占比 {int(float(summary['low_confidence_rate']) * 100)}%。",
                "action": "从低置信问题池选择高频问题，补充讲解词、FAQ 或文史资料。",
                "related_focus": summary["top_focus"],
            }
        )
    for focus in focus_points[:3]:
        unhelpful_count = int(focus["unhelpful_count"])
        low_confidence_count = int(focus["low_confidence_count"])
        if unhelpful_count == 0 and low_confidence_count == 0:
            continue
        suggestions.append(
            {
                "priority": "high" if unhelpful_count >= 2 or low_confidence_count >= 2 else "medium",
                "title": f"优化{focus['topic']}相关回答",
                "reason": (
                    f"该主题收到无帮助反馈 {unhelpful_count} 次，"
                    f"低置信问题 {low_confidence_count} 次。"
                ),
                "action": "补充游客常问事实、服务规则和现场导览表达，并重新测试典型问题。",
                "related_focus": focus["topic"],
            }
        )
    if feedback_trend:
        latest = feedback_trend[-1]
        if float(latest["unhelpful_rate"]) >= 0.4:
            suggestions.append(
                {
                    "priority": "medium",
                    "title": "复核最近一天无帮助反馈",
                    "reason": f"{latest['date']} 无帮助反馈占比达到 {int(float(latest['unhelpful_rate']) * 100)}%。",
                    "action": "复盘对应问答，检查知识缺口和回答表达。",
                    "related_focus": summary["top_focus"],
                }
            )
    if not suggestions:
        suggestions.append(
            {
                "priority": "low",
                "title": "维持当前知识库巡检节奏",
                "reason": "近期服务反馈和回答置信度整体稳定。",
                "action": "每周复核新增问题和未反馈高频问题，持续更新知识库。",
                "related_focus": summary["top_focus"],
            }
        )
    return suggestions[:5]


def _is_low_confidence(row: dict[str, object]) -> bool:
    return (
        not bool(row["reliable"])
        or float(row["confidence"]) < 0.5
        or int(row["source_count"]) == 0
    )


def _safe_rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 2) if denominator else 0.0


def _infer_focus(question: str) -> str:
    for rule in FOCUS_RULES:
        if any(keyword in question for keyword in rule.keywords):
            return rule.name
    return "其他关注"


def _extract_keywords(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}", text)
    ignored = {"什么", "怎么", "哪些", "有没有", "多少", "这个", "那个", "一下"}
    return [word for word in words if word not in ignored][:8]
