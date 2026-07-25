"""Reset runtime business data and seed a deterministic demo dataset.

This script only operates on ``data/runtime``. It deliberately leaves source
knowledge under ``data/sample_scenic`` and all test fixtures untouched.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
RUNTIME_ROOT = ROOT / "data" / "runtime"
CHAT_DATABASE = RUNTIME_ROOT / "chat_records.db"
KNOWLEDGE_DATABASE = RUNTIME_ROOT / "knowledge.db"
ACCURACY_METRICS = RUNTIME_ROOT / "accuracy_metrics.json"
DIGITAL_HUMAN_STATE = RUNTIME_ROOT / "digital_human_state.json"

sys.path.insert(0, str(BACKEND_ROOT))

from app.services.chat_record_service import (  # noqa: E402
    ChatRecord,
    ChatRecordService,
)
from app.services.knowledge_service import KnowledgeDocumentStore  # noqa: E402


DEMO_DOCUMENTS = (
    {
        "title": "【演示】灵山胜境核心讲解资料",
        "category": "guide_script",
        "source_name": "demo-scenic-guide.md",
        "content": """本资料仅用于系统演示。

灵山大佛通高 88 米，佛体高 79 米，莲花瓣高 9 米。游客可沿登云道前往大佛平台；216 级台阶寓意前 108 级烦恼尽除、后 108 级愿望圆满。

灵山梵宫是景区重要文化建筑，适合安排在大佛游览后参观。亲子游客可优先体验九龙灌浴、佛手广场和百子戏弥勒；带老人游览时，建议合理安排休息并优先选择步行距离较短的路线。

开放时间、演出场次、票价、车辆运行状态等可能变化的信息，应以景区当日公告和现场说明为准。""",
    },
    {
        "title": "【演示】游客常见问答与服务提示",
        "category": "faq",
        "source_name": "demo-visitor-faq.md",
        "content": """本资料仅用于系统演示。

游客服务中心可提供咨询、路线指引等服务。景区游览以步行为主，请穿着舒适的鞋子并根据天气准备雨具或防晒用品。

对于天气、排队时长、停车位、缆车或演出临时调整等实时问题，如无可靠实时数据，系统应明确提示资料不足，不生成未经核实的结论。""",
    },
)


def source(text: str, score: float = 0.91) -> list[dict[str, object]]:
    return [{"source": "demo-scenic-guide.md", "text": text, "score": score}]


DEMO_RECORDS = (
    {
        "question": "灵山大佛有多高？",
        "answer": "灵山大佛通高 88 米，其中佛体高 79 米、莲花瓣高 9 米。您可以沿登云道前往大佛平台，近距离感受其庄严气势。",
        "confidence": 0.98,
        "reliable": True,
        "sources": source("灵山大佛通高 88 米，佛体高 79 米，莲花瓣高 9 米。"),
        "response_time_ms": 1680,
        "feedback": ("helpful", "讲解清楚，数据直观。"),
    },
    {
        "question": "第一次来灵山，带老人游玩半天怎么安排？",
        "answer": "建议从游客服务中心开始，优先安排灵山大佛、梵宫等核心景点，并在路线中预留休息时间；如需减少步行，可向现场咨询便捷游览方式。",
        "confidence": 0.95,
        "reliable": True,
        "sources": source("带老人游览时建议合理安排休息，并优先选择步行距离较短的路线。"),
        "response_time_ms": 2430,
        "feedback": ("helpful", "路线建议很实用。"),
    },
    {
        "question": "灵山梵宫有什么看点？",
        "answer": "灵山梵宫是景区的重要文化建筑，适合在参观灵山大佛后继续游览。建议您放慢节奏，重点感受其建筑空间和佛教艺术氛围。",
        "confidence": 0.96,
        "reliable": True,
        "sources": source("灵山梵宫是景区重要文化建筑，适合安排在大佛游览后参观。"),
        "response_time_ms": 1930,
        "feedback": None,
    },
    {
        "question": "亲子游有哪些推荐？",
        "answer": "亲子游客可优先体验九龙灌浴、佛手广场和百子戏弥勒。建议结合孩子体力安排节奏，并在游览中穿插休息和补给。",
        "confidence": 0.94,
        "reliable": True,
        "sources": source("亲子游客可优先体验九龙灌浴、佛手广场和百子戏弥勒。"),
        "response_time_ms": 2050,
        "feedback": ("helpful", "孩子很喜欢这个安排。"),
    },
    {
        "question": "抱佛脚怎么走？",
        "answer": "您可先前往灵山大佛区域，再沿登云道向大佛平台方向游览。现场如有临时导向调整，请以景区标识和工作人员指引为准。",
        "confidence": 0.91,
        "reliable": True,
        "sources": source("游客可沿登云道前往大佛平台。"),
        "response_time_ms": 1760,
        "feedback": None,
    },
    {
        "question": "景区今天缆车是否临时停运？",
        "answer": "抱歉，我没有可核实的实时运营信息。缆车运行可能随天气、检修或现场调度调整，建议以景区公告、官方小程序或工作人员说明为准。",
        "confidence": 0.0,
        "reliable": False,
        "sources": [],
        "response_time_ms": 82,
        "feedback": ("helpful", "明确说明了实时信息边界。"),
    },
    {
        "question": "上海明天天气怎么样？",
        "answer": "抱歉，我是灵山胜境的 AI 导游，无法提供上海的天气信息。如果您计划来景区游玩，可咨询景区路线、景点和服务信息。",
        "confidence": 0.0,
        "reliable": False,
        "sources": [],
        "response_time_ms": 76,
        "feedback": None,
    },
    {
        "question": "附近哪家火锅店最好吃？",
        "answer": "当前知识库没有可核实的餐饮推荐信息。建议您咨询游客服务中心，或使用本地生活服务平台查看实时评价。",
        "confidence": 0.0,
        "reliable": False,
        "sources": [],
        "response_time_ms": 71,
        "feedback": ("unhelpful", "希望后续补充餐饮信息。"),
    },
)


def reset_chat_records() -> tuple[int, int]:
    service = ChatRecordService()
    service._ensure_database()  # Establishes the application schema before reset.
    with sqlite3.connect(CHAT_DATABASE) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        deleted_feedback = connection.execute("DELETE FROM chat_feedback").rowcount
        deleted_records = connection.execute("DELETE FROM chat_records").rowcount
        connection.execute("DELETE FROM sqlite_sequence WHERE name IN ('chat_feedback', 'chat_records')")
        connection.commit()

    base_time = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=6)
    for index, item in enumerate(DEMO_RECORDS):
        created_at = base_time + timedelta(hours=index * 8)
        record = ChatRecord(
            session_id=f"demo-session-{index // 2 + 1:02d}",
            original_question=str(item["question"]),
            cleaned_question=str(item["question"]),
            answer=str(item["answer"]),
            prompt_text="演示用模拟问答记录。",
            confidence=float(item["confidence"]),
            reliable=bool(item["reliable"]),
            history_turns_used=0,
            source_count=len(item["sources"]),
            sources=list(item["sources"]),
            model_provider="mock" if item["reliable"] else "retrieval_guard",
            model_status="mock_response" if item["reliable"] else "insufficient_reliable_sources",
            response_time_ms=int(item["response_time_ms"]),
        )
        record_id = service.save_record(record)
        with sqlite3.connect(CHAT_DATABASE) as connection:
            connection.execute(
                "UPDATE chat_records SET created_at = ? WHERE id = ?",
                (created_at.isoformat(sep=" "), record_id),
            )
            connection.commit()
        feedback = item["feedback"]
        if feedback:
            rating, feedback_text = feedback
            service.save_feedback(
                record_id=record_id,
                session_id=record.session_id,
                rating=rating,
                feedback_text=feedback_text,
            )

    emoji_values = ("👍", "😊", "👍", "🙏", "😊", "👍")
    for index, emoji in enumerate(emoji_values):
        created_at = base_time + timedelta(hours=index * 12 + 3)
        record = ChatRecord(
            session_id=f"demo-emoji-{index // 2 + 1:02d}",
            original_question=emoji,
            cleaned_question=emoji,
            answer="感谢您的互动，祝您在灵山游览愉快。",
            prompt_text="演示用模拟表情互动记录。",
            confidence=1.0,
            reliable=True,
            history_turns_used=0,
            source_count=0,
            sources=[],
            model_provider="fixed",
            model_status="emoji_interaction",
            response_time_ms=40,
            interaction_type="emoji",
            emoji_value=emoji,
        )
        record_id = service.save_record(record)
        with sqlite3.connect(CHAT_DATABASE) as connection:
            connection.execute(
                "UPDATE chat_records SET created_at = ? WHERE id = ?",
                (created_at.isoformat(sep=" "), record_id),
            )
            connection.commit()

    return deleted_records, deleted_feedback


def reset_knowledge() -> int:
    store = KnowledgeDocumentStore(KNOWLEDGE_DATABASE)
    with sqlite3.connect(KNOWLEDGE_DATABASE) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("DELETE FROM knowledge_chunks")
        deleted_documents = connection.execute("DELETE FROM knowledge_documents").rowcount
        connection.execute("DELETE FROM sqlite_sequence WHERE name IN ('knowledge_chunks', 'knowledge_documents')")
        connection.commit()

    for document in DEMO_DOCUMENTS:
        store.create_document(**document, status="active")
    return deleted_documents


def reset_runtime_metadata() -> None:
    ACCURACY_METRICS.write_text(
        json.dumps(
            {
                "is_demo_data": True,
                "note": "演示用模拟统计，不作为正式准确率验收依据。",
                "case_count": 40,
                "accuracy_rate": 0.95,
                "reliable_rate": 0.95,
                "no_source_rate": 0.05,
                "average_latency_ms": 1530,
                "results": [],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    DIGITAL_HUMAN_STATE.write_text(
        json.dumps({"selected_avatar": "626"}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)
    deleted_records, deleted_feedback = reset_chat_records()
    deleted_documents = reset_knowledge()
    reset_runtime_metadata()
    print(
        json.dumps(
            {
                "deleted_chat_records": deleted_records,
                "deleted_feedback": deleted_feedback,
                "deleted_knowledge_documents": deleted_documents,
                "seeded_chat_records": len(DEMO_RECORDS),
                "seeded_emoji_interactions": 6,
                "seeded_knowledge_documents": len(DEMO_DOCUMENTS),
                "demo_data": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
