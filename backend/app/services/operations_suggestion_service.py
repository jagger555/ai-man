from __future__ import annotations

import json
from typing import Any

from app.core.config import get_llm_config
from app.services.crowd_simulation_service import get_crowd_history
from app.services.llm.llm_factory import get_guide_llm
from app.services.scenic_content_service import get_scenic_content
from app.services.visitor_analytics_service import VisitorAnalyticsService
from app.services.visitor_event_service import VisitorEventService


class OperationsSuggestionService:
    def build(self, days: int = 7) -> dict[str, object]:
        insights = VisitorEventService().build_insights(days=days)
        analytics = VisitorAnalyticsService().get_summary()
        candidates = [
            *_mine_behavior_candidates(insights),
            *_mine_audience_candidates(analytics),
            *_mine_capacity_candidates(get_crowd_history(), get_scenic_content()),
        ]
        candidates.sort(key=lambda item: {"high": 0, "medium": 1, "low": 2}.get(str(item.get("priority")), 3))
        candidates = candidates[:7]
        suggestions, engine = _explain_with_llm(candidates)
        return {
            "period_days": days,
            "engine": engine,
            "generated_from": "traceable_operational_signals",
            "suggestions": suggestions,
        }


def _mine_behavior_candidates(insights: dict[str, object]) -> list[dict[str, object]]:
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
            "domain": "游客行为",
            "source_label": "匿名访问统计",
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
                "domain": "地图导航",
                "source_label": "导航结果记录",
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
            "domain": "资源配置",
            "source_label": "匿名访问统计",
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
                "domain": "游客服务",
                "source_label": "服务查询统计",
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
                "domain": "路线产品",
                "source_label": "路线偏好统计",
            })
    return candidates


def _mine_audience_candidates(analytics: dict[str, object]) -> list[dict[str, object]]:
    if not analytics or int(analytics.get("total_visits", 0)) == 0:
        return []

    age_groups = analytics.get("age_groups", [])
    age_by_label = {
        str(item.get("label")): item
        for item in age_groups
        if isinstance(item, dict)
    } if isinstance(age_groups, list) else {}
    young_share = sum(
        float(age_by_label.get(label, {}).get("share", 0))
        for label in ("18岁以下", "18-29岁", "30-44岁")
    )
    senior_share = float(age_by_label.get("60岁以上", {}).get("share", 0))
    average_group_size = float(analytics.get("average_group_size", 0))
    average_cost = float(analytics.get("average_total_cost", 0))
    total_visits = int(analytics.get("total_visits", 0))
    source_name = str(analytics.get("source_file", "公开旅游行为样本"))

    candidates: list[dict[str, object]] = []
    if young_share >= 0.5:
        candidates.append({
            "id": "audience-retail-mix",
            "priority": "medium",
            "title": "按主力年龄层调整文创商品组合",
            "evidence": [
                f"公开旅游行为样本共 {total_visits:,} 条，18-44 岁占 {round(young_share * 100)}%。",
                f"样本平均同行 {average_group_size:g} 人、综合消费 {average_cost:.0f} 元。",
            ],
            "action": "礼品店设置入门纪念品、家庭组合与收藏型文创三个价格带；优先测试便携、互动和可分享商品，并按周比较各价格带成交占比与连带率。",
            "module": "insights",
            "domain": "商业经营",
            "source_label": f"公开样本 · {source_name}",
        })
    if senior_share >= 0.05:
        candidates.append({
            "id": "senior-service-capacity",
            "priority": "medium",
            "title": "为长者客群强化休息与低强度路线",
            "evidence": [f"公开旅游行为样本中 60 岁以上占 {round(senior_share * 100)}%。"],
            "action": "把休息区、卫生间、医务室和观光车站组合成一条低强度服务链；在入口、数字人和路线页统一推荐，并记录采用率与求助量。",
            "module": "content",
            "domain": "人群服务",
            "source_label": f"公开样本 · {source_name}",
        })
    return candidates


def _mine_capacity_candidates(
    crowd_history: dict[str, object],
    scenic_content: dict[str, object],
) -> list[dict[str, object]]:
    points = crowd_history.get("points", [])
    if not isinstance(points, list) or not points:
        return []
    valid_points = [item for item in points if isinstance(item, dict)]
    if not valid_points:
        return []
    peak = max(valid_points, key=lambda item: int(item.get("current_inside", 0)))
    peak_label = str(peak.get("label", "--"))
    peak_count = int(peak.get("current_inside", 0))
    scenario = str(crowd_history.get("scenario", "steady"))
    scenario_label = {"steady": "平稳客流", "entry_peak": "入园高峰", "exit_peak": "离园高峰"}.get(scenario, "当前客流")

    content_items = scenic_content.get("items", {})
    performances = content_items.get("performance", []) if isinstance(content_items, dict) else []
    active_performances = [item for item in performances if isinstance(item, dict) and bool(item.get("enabled"))]
    return [{
        "id": "performance-capacity-window",
        "priority": "high",
        "title": "用入园峰值安排演出场次与现场人员",
        "evidence": [
            f"{scenario_label}方案的在园峰值出现在 {peak_label}，约 {peak_count:,} 人。",
            f"当前发布 {len(active_performances)} 个演出主题。",
        ],
        "action": "把主场次放在预计入园峰值后的 30-60 分钟，并在检票、观演入口和散场路线预留人员；结合当日预约与售票时段分布复核后再发布具体场次。",
        "module": "crowd",
        "domain": "演出运营",
        "source_label": "客流方案与演出配置",
    }]


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
