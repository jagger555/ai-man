from __future__ import annotations

import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.core.config import DatabaseConfig, get_database_config
from app.services.chat_record_service import (
    FEEDBACK_SCHEMA_SQL,
    SCHEMA_SQL,
)


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

POSITIVE_WORDS = ("清楚", "有用", "准确", "满意", "喜欢", "详细", "帮助")
NEGATIVE_WORDS = ("不够", "没有", "不准", "错误", "缺少", "不清楚", "失望")


class VisitorReportService:
    def __init__(self, config: DatabaseConfig | None = None):
        self._config = config or get_database_config()

    def build_report(self, limit: int = 200) -> dict[str, object]:
        rows = self._load_rows(limit=limit)
        focus_points = _build_focus_points(rows)
        sentiment_trend = _build_sentiment_trend(rows)
        summary = _build_summary(rows, focus_points)
        suggestions = _build_suggestions(summary, focus_points, sentiment_trend)

        return {
            "summary": summary,
            "focus_points": focus_points,
            "sentiment_trend": sentiment_trend,
            "suggestions": suggestions,
        }

    def _load_rows(self, limit: int) -> list[dict[str, object]]:
        self._ensure_database()
        with sqlite3.connect(self._config.path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT
                    records.id,
                    records.session_id,
                    records.original_question,
                    records.cleaned_question,
                    records.answer,
                    records.confidence,
                    records.reliable,
                    records.source_count,
                    records.created_at,
                    feedback.rating,
                    feedback.feedback_text,
                    feedback.updated_at AS feedback_updated_at
                FROM chat_records AS records
                LEFT JOIN chat_feedback AS feedback
                  ON feedback.record_id = records.id
                ORDER BY records.id DESC
                LIMIT ?
                """,
                (limit,),
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
                "sentiment": _infer_sentiment(
                    rating=row["rating"],
                    feedback_text=row["feedback_text"] or "",
                    reliable=bool(row["reliable"]),
                    confidence=float(row["confidence"]),
                    source_count=int(row["source_count"]),
                ),
            }
            for row in rows
        ]

    def _ensure_database(self) -> None:
        database_path = self._config.path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(database_path) as connection:
            connection.execute(SCHEMA_SQL)
            connection.execute(FEEDBACK_SCHEMA_SQL)
            connection.commit()


def _build_summary(
    rows: list[dict[str, object]],
    focus_points: list[dict[str, object]],
) -> dict[str, object]:
    total = len(rows)
    feedback_count = sum(1 for row in rows if row["rating"])
    positive_count = sum(1 for row in rows if row["sentiment"] == "positive")
    negative_count = sum(1 for row in rows if row["sentiment"] == "negative")
    neutral_count = total - positive_count - negative_count
    low_confidence_count = sum(
        1
        for row in rows
        if not bool(row["reliable"])
        or float(row["confidence"]) < 0.5
        or int(row["source_count"]) == 0
    )
    average_confidence = (
        round(sum(float(row["confidence"]) for row in rows) / total, 2)
        if total
        else 0.0
    )
    top_focus = focus_points[0]["topic"] if focus_points else ""

    return {
        "total_records": total,
        "feedback_count": feedback_count,
        "positive_count": positive_count,
        "neutral_count": neutral_count,
        "negative_count": negative_count,
        "positive_rate": round(positive_count / total, 2) if total else 0.0,
        "negative_rate": round(negative_count / total, 2) if total else 0.0,
        "low_confidence_count": low_confidence_count,
        "low_confidence_rate": round(low_confidence_count / total, 2) if total else 0.0,
        "average_confidence": average_confidence,
        "top_focus": top_focus,
    }


def _build_focus_points(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    buckets: dict[str, dict[str, object]] = {}

    for row in rows:
        focus = str(row["focus"])
        if focus not in buckets:
            buckets[focus] = {
                "topic": focus,
                "count": 0,
                "positive_count": 0,
                "negative_count": 0,
                "low_confidence_count": 0,
                "confidence_total": 0.0,
                "sample_questions": [],
                "keywords": set(),
            }

        bucket = buckets[focus]
        bucket["count"] = int(bucket["count"]) + 1
        bucket["confidence_total"] = float(bucket["confidence_total"]) + float(
            row["confidence"]
        )
        if row["sentiment"] == "positive":
            bucket["positive_count"] = int(bucket["positive_count"]) + 1
        if row["sentiment"] == "negative":
            bucket["negative_count"] = int(bucket["negative_count"]) + 1
        if (
            not bool(row["reliable"])
            or float(row["confidence"]) < 0.5
            or int(row["source_count"]) == 0
        ):
            bucket["low_confidence_count"] = int(bucket["low_confidence_count"]) + 1
        samples = bucket["sample_questions"]
        if isinstance(samples, list) and len(samples) < 3:
            samples.append(row["original_question"])
        keywords = bucket["keywords"]
        if isinstance(keywords, set):
            keywords.update(_extract_keywords(str(row["original_question"])))

    focus_points: list[dict[str, object]] = []
    for bucket in buckets.values():
        count = int(bucket["count"])
        keyword_values = sorted(
            bucket["keywords"],
            key=lambda item: (-len(item), item),
        )
        focus_points.append(
            {
                "topic": bucket["topic"],
                "count": count,
                "share": round(count / len(rows), 2) if rows else 0.0,
                "positive_count": bucket["positive_count"],
                "negative_count": bucket["negative_count"],
                "low_confidence_count": bucket["low_confidence_count"],
                "average_confidence": round(
                    float(bucket["confidence_total"]) / count,
                    2,
                )
                if count
                else 0.0,
                "sample_questions": bucket["sample_questions"],
                "keywords": keyword_values[:5],
            }
        )

    return sorted(
        focus_points,
        key=lambda item: (
            -int(item["count"]),
            -int(item["negative_count"]),
            str(item["topic"]),
        ),
    )


def _build_sentiment_trend(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "positive_count": 0,
            "neutral_count": 0,
            "negative_count": 0,
            "total_count": 0,
        }
    )

    for row in rows:
        day = str(row["created_at"])[:10]
        sentiment = str(row["sentiment"])
        buckets[day]["total_count"] += 1
        buckets[day][f"{sentiment}_count"] += 1

    return [
        {
            "date": day,
            **values,
            "positive_rate": round(values["positive_count"] / values["total_count"], 2)
            if values["total_count"]
            else 0.0,
            "negative_rate": round(values["negative_count"] / values["total_count"], 2)
            if values["total_count"]
            else 0.0,
        }
        for day, values in sorted(buckets.items())
    ]


def _build_suggestions(
    summary: dict[str, object],
    focus_points: list[dict[str, object]],
    sentiment_trend: list[dict[str, object]],
) -> list[dict[str, object]]:
    suggestions: list[dict[str, object]] = []

    if summary["low_confidence_rate"] >= 0.3:
        suggestions.append(
            {
                "priority": "high",
                "title": "优先补齐低命中知识",
                "reason": f"近期待复核问题占比 {int(float(summary['low_confidence_rate']) * 100)}%。",
                "action": "从低置信度问题池挑选高频问题，补充讲解词、FAQ 或文史资料。",
                "related_focus": summary["top_focus"],
            }
        )

    for focus in focus_points[:3]:
        count = int(focus["count"])
        negative_count = int(focus["negative_count"])
        low_confidence_count = int(focus["low_confidence_count"])
        if negative_count == 0 and low_confidence_count == 0:
            continue

        priority = "high" if negative_count >= 2 or low_confidence_count >= 2 else "medium"
        suggestions.append(
            {
                "priority": priority,
                "title": f"优化{focus['topic']}相关回答",
                "reason": (
                    f"该关注点出现 {count} 次，其中负向 {negative_count} 次、"
                    f"低置信度 {low_confidence_count} 次。"
                ),
                "action": "补充游客最常问的具体事实、服务规则和现场导览表达。",
                "related_focus": focus["topic"],
            }
        )

    if sentiment_trend:
        latest = sentiment_trend[-1]
        if float(latest["negative_rate"]) >= 0.4:
            suggestions.append(
                {
                    "priority": "medium",
                    "title": "关注最近一天负向反馈",
                    "reason": f"{latest['date']} 负向占比达到 {int(float(latest['negative_rate']) * 100)}%。",
                    "action": "复盘当天问题样本，检查是否存在知识缺口或表达不够清晰。",
                    "related_focus": summary["top_focus"],
                }
            )

    if not suggestions:
        suggestions.append(
            {
                "priority": "low",
                "title": "维持当前知识库巡检节奏",
                "reason": "近期反馈和置信度整体稳定，暂未发现集中风险点。",
                "action": "每周复核新增问题和未反馈高频问题，保持知识库持续更新。",
                "related_focus": summary["top_focus"],
            }
        )

    return suggestions[:5]


def _infer_focus(question: str) -> str:
    for rule in FOCUS_RULES:
        if any(keyword in question for keyword in rule.keywords):
            return rule.name
    return "其他关注"


def _infer_sentiment(
    *,
    rating: str | None,
    feedback_text: str,
    reliable: bool,
    confidence: float,
    source_count: int,
) -> str:
    if rating == "helpful":
        return "positive"
    if rating == "unhelpful":
        return "negative"
    if any(word in feedback_text for word in POSITIVE_WORDS):
        return "positive"
    if any(word in feedback_text for word in NEGATIVE_WORDS):
        return "negative"
    if not reliable or confidence < 0.5 or source_count == 0:
        return "negative"
    return "neutral"


def _extract_keywords(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}", text)
    ignored = {"什么", "怎么", "哪些", "有没有", "多少", "这个", "那个", "一下"}
    return [word for word in words if word not in ignored][:8]
