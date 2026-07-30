from __future__ import annotations

import json
from typing import Any

from app.core.config import get_llm_config
from app.services.llm.llm_factory import get_guide_llm
from app.services.visitor_event_service import VisitorEventService


class OperationsSuggestionService:
    def build(self, days: int = 7) -> dict[str, object]:
        insights = VisitorEventService().build_insights(days=days)
        candidates = _mine_candidates(insights)
        suggestions, engine = _explain_with_llm(candidates)
        return {
            "period_days": days,
            "engine": engine,
            "generated_from": "anonymous_behavior_aggregates",
            "suggestions": suggestions,
        }


def _mine_candidates(insights: dict[str, object]) -> list[dict[str, object]]:
    summary = insights.get("summary", {})
    event_counts = insights.get("event_counts", {})
    pages = insights.get("page_engagement", [])
    services = insights.get("service_categories", [])
    preferences = insights.get("route_preferences", [])
    if not isinstance(summary, dict) or int(summary.get("anonymous_sessions", 0)) == 0:
        return []

    candidates: list[dict[str, object]] = []
    sessions = int(summary.get("anonymous_sessions", 0))
    feature_rate = float(summary.get("feature_reach_rate", 0))
    if sessions >= 5 and feature_rate < 0.45:
        candidates.append({
            "id": "improve-feature-entry",
            "priority": "high",
            "title": "强化首页功能入口",
            "evidence": [f"{sessions} 个匿名会话中，功能页触达率仅 {round(feature_rate * 100)}%。"],
            "action": "调整首页五项功能的顺序与说明，优先突出访问量最高的功能，并在下一周期比较触达率。",
            "module": "insights",
        })

    if isinstance(event_counts, dict):
        failures = int(event_counts.get("navigation_failure", 0))
        successes = int(event_counts.get("navigation_success", 0))
        attempts = failures + successes
        if failures > 0 and (attempts < 3 or failures / attempts >= 0.2):
            candidates.append({
                "id": "navigation-recovery",
                "priority": "high",
                "title": "复核高德步行路线失败点",
                "evidence": [f"路线规划成功 {successes} 次、失败 {failures} 次。"],
                "action": "按失败目的地检查坐标与景区内部道路可达性，并复测失败入口，不修改已成功路线。",
                "module": "content",
            })

    viewed_pages = [item for item in pages if isinstance(item, dict) and int(item.get("views", 0)) > 0] if isinstance(pages, list) else []
    if viewed_pages:
        top_page = max(viewed_pages, key=lambda item: int(item.get("views", 0)))
        candidates.append({
            "id": "feature-demand",
            "priority": "medium",
            "title": f"围绕{top_page.get('label', '高频功能')}配置现场资源",
            "evidence": [f"该页面访问 {top_page.get('views', 0)} 次，覆盖 {top_page.get('unique_sessions', 0)} 个匿名会话。"],
            "action": "核对该功能对应的现场指引、人员话术和首页入口，下一周期观察访问到行动的转化变化。",
            "module": "insights",
        })

    if isinstance(services, list) and services:
        top_service = services[0]
        if isinstance(top_service, dict):
            candidates.append({
                "id": "service-demand",
                "priority": "medium",
                "title": f"优先检查{top_service.get('label', '高频服务')}指引",
                "evidence": [f"游客主动查找或咨询 {top_service.get('count', 0)} 次，占服务需求 {round(float(top_service.get('share', 0)) * 100)}%。"],
                "action": "检查入口标识、地图设施名称和数字人回答是否一致，必要时调整现场引导位置。",
                "module": "content",
            })

    if isinstance(preferences, list) and preferences:
        top_preference = preferences[0]
        if isinstance(top_preference, dict):
            candidates.append({
                "id": "route-preference",
                "priority": "medium",
                "title": f"优化{top_preference.get('label', '高频偏好')}路线供给",
                "evidence": [f"该偏好被选择 {top_preference.get('count', 0)} 次。"],
                "action": "检查现有发布路线是否充分覆盖该偏好，并用采用推荐率验证调整是否有效。",
                "module": "content",
            })
    return candidates[:5]


def _explain_with_llm(candidates: list[dict[str, object]]) -> tuple[list[dict[str, object]], str]:
    if not candidates:
        return [], "rule_mining"
    config = get_llm_config()
    if config.provider == "mock":
        return candidates, "rule_mining"
    try:
        llm = get_guide_llm(config)
        prompt = (
            "请将以下景区运营建议压缩为 JSON 数组。只能改写 title 和 action，"
            "不得改变 id、priority、evidence、module，不得增加数据或结论。\n"
            + json.dumps(candidates, ensure_ascii=False)
        )
        text = llm.generate(prompt, system_prompt="你是景区运营分析助手，只能解释给定证据，不能编造数据。")
        parsed: Any = json.loads(text)
        if not isinstance(parsed, list):
            raise ValueError("LLM output is not a list")
        by_id = {str(item["id"]): item for item in candidates}
        for item in parsed:
            if not isinstance(item, dict) or str(item.get("id")) not in by_id:
                continue
            original = by_id[str(item["id"])]
            if isinstance(item.get("title"), str):
                original["title"] = item["title"][:80]
            if isinstance(item.get("action"), str):
                original["action"] = item["action"][:300]
        return candidates, "rule_mining+llm_explanation"
    except Exception:
        return candidates, "rule_mining_fallback"
