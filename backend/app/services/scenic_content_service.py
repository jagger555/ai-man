from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

from app.services.lingshan_snapshot import load_lingshan_snapshot


def _route_defaults() -> list[dict[str, Any]]:
    """Normalize the approved route snapshot for the existing content API."""

    snapshot = load_lingshan_snapshot()
    route_ids = {
        "祈福禅悟线": "blessing-zen",
        "文化体验线": "culture-experience",
        "亲子喜乐线": "family-joy",
        "舌尖上的灵山": "lingshan-flavors",
        "文博探索之旅": "museum-exploration",
        "清净自在线（建议全程电瓶车）": "easy-electric-tour",
    }
    routes: list[dict[str, Any]] = []
    for order, route in enumerate(snapshot["routes"], start=1):
        flat_path = route["path"]
        path = [
            {"lng": float(flat_path[index]), "lat": float(flat_path[index + 1])}
            for index in range(0, len(flat_path), 2)
        ]
        stops = [
            {
                "id": stop["id"],
                "name": stop["name"],
                "lat": float(stop["lat"]),
                "lng": float(stop["lng"]),
                "order": stop_order,
            }
            for stop_order, stop in enumerate(route["stops"], start=1)
        ]
        duration_hours = float(route["durationHours"])
        distance_km = float(route["distanceKm"])
        tags = [str(tag) for tag in route.get("tags", []) if str(tag).strip()]
        routes.append(
            {
                "id": route_ids.get(route["name"], route["id"]),
                "title": route["name"],
                "helper": " / ".join(tags[:2]) or "景区主题游览路线",
                "duration": f"约 {duration_hours:g} 小时",
                "duration_minutes": round(duration_hours * 60),
                "audience": tags[0] if tags else "景区游客",
                "pace": "景区推荐",
                "summary": f"全程约 {distance_km:g} 公里，共 {len(stops)} 个推荐停靠点。",
                "stops": [stop["name"] for stop in stops],
                "route_stops": stops,
                "path": path,
                "distance_km": distance_km,
                "tags": tags,
                "notes": [],
                "audience_tags": [],
                "interest_tags": tags,
                "enabled": True,
                "featured": order == 1,
                "order": order * 10,
            }
        )
    return routes


def _facility_category_defaults() -> list[dict[str, Any]]:
    snapshot = load_lingshan_snapshot()
    return [
        {
            "id": category["id"],
            "title": category["name"],
            "is_common": bool(category["isCommon"]),
            "enabled": True,
            "order": int(category["sort"]),
        }
        for category in snapshot["facilityCategories"]
    ]


def _facility_defaults() -> list[dict[str, Any]]:
    snapshot = load_lingshan_snapshot()
    return [
        {
            "id": facility["id"],
            "title": facility["name"],
            "category_id": facility["categoryId"],
            "lat": float(facility["lat"]),
            "lng": float(facility["lng"]),
            "enabled": True,
            "order": index,
        }
        for index, facility in enumerate(snapshot["facilities"], start=1)
    ]


_DEFAULT_CONTENT: dict[str, list[dict[str, Any]]] = {
    "poi": [
        {"id": "local-tourist-center", "title": "灵山胜境游客中心", "category": "游客服务", "summary": "景区咨询与综合服务入口", "enabled": True, "featured": False, "order": 10},
        {"id": "local-jiulong", "title": "九龙灌浴", "category": "景点", "summary": "大型音乐动态群雕景观", "enabled": True, "featured": True, "order": 20},
        {"id": "local-buddha-hand", "title": "灵山佛手", "category": "景点", "summary": "灵山中轴代表性文化景观", "enabled": True, "featured": False, "order": 30},
        {"id": "local-lingshan-buddha", "title": "灵山大佛", "category": "景点", "summary": "灵山胜境核心文化地标", "enabled": True, "featured": True, "order": 40},
        {"id": "local-fangong", "title": "灵山梵宫", "category": "景点", "summary": "建筑艺术与室内文化体验空间", "enabled": True, "featured": True, "order": 50},
        {"id": "local-wuyin", "title": "五印坛城", "category": "景点", "summary": "藏传佛教文化艺术景观", "enabled": True, "featured": False, "order": 60},
    ],
    "route": [
        {
            "id": "classic", "title": "经典一日游", "helper": "首次到访 / 核心景点全覆盖",
            "duration": "6–7 小时", "duration_minutes": 390, "audience": "首次到访", "pace": "从容深度",
            "summary": "沿景区中轴进入大佛核心区，再前往梵宫与五印坛城，完整感受灵山代表性景观。",
            "stops": ["检票口", "佛足坛", "九龙灌浴", "灵山佛手", "祥符禅寺", "灵山大佛", "梵宫", "五印坛城", "景区出口"],
            "notes": ["先看核心佛教文化景观", "梵宫与五印坛城安排在后半程", "适合 6-7 小时游览"],
            "audience_tags": ["个人", "朋友"], "interest_tags": ["佛教文化", "建筑艺术"],
            "enabled": True, "featured": True, "order": 10,
        },
        {
            "id": "family", "title": "亲子轻松游", "helper": "互动拍照 / 步行压力较低",
            "duration": "约 4 小时", "duration_minutes": 240, "audience": "亲子家庭", "pace": "轻松少折返",
            "summary": "减少登高与长距离折返，把互动景观、拍照点和室内空间安排在同一条轻松动线上。",
            "stops": ["检票口", "九龙灌浴", "灵山佛手", "百子戏弥勒", "梵宫", "游客中心"],
            "notes": ["减少登高与长距离折返", "优先选择互动性强的点位", "适合 4 小时左右"],
            "audience_tags": ["亲子"], "interest_tags": ["演出体验", "轻松休闲", "拍照打卡"],
            "enabled": True, "featured": True, "order": 20,
        },
        {
            "id": "halfday", "title": "半日精华游", "helper": "时间有限 / 快速看重点",
            "duration": "3–4 小时", "duration_minutes": 210, "audience": "时间有限", "pace": "重点优先",
            "summary": "压缩支线停留，优先串联九龙灌浴、灵山大佛、梵宫和五印坛城四处核心景观。",
            "stops": ["检票口", "九龙灌浴", "灵山大佛", "梵宫", "五印坛城", "景区出口"],
            "notes": ["压缩支线停留", "优先保证大佛、梵宫、五印坛城", "适合 3-4 小时"],
            "audience_tags": ["个人", "朋友", "长者同行"], "interest_tags": ["佛教文化", "建筑艺术"],
            "enabled": True, "featured": True, "order": 30,
        },
    ],
    "performance": [
        {
            "id": "jiulong", "title": "九龙灌浴", "subtitle": "大型音乐动态群雕", "location": "九龙灌浴广场",
            "map_destination": "九龙灌浴", "description": "莲花开启、太子像升起并接受九龙喷水沐浴，适合在景区中轴游览时安排观看。",
            "arrival_notice": "建议提前 10 分钟到达观演区", "image_key": "jiulong",
            "valid_from": "2026-07-02T00:00:00+08:00", "valid_until": "2026-07-31T23:59:59+08:00",
            "schedules": [{"label": "周一至周五", "times": ["10:00", "11:30", "14:45", "16:45"]}, {"label": "周六、周日", "times": ["10:00", "11:30", "13:00", "14:45", "16:45"]}],
            "enabled": True, "featured": True, "order": 10,
        },
        {
            "id": "fangong", "title": "梵宫文化体验之旅", "subtitle": "建筑艺术与沉浸式文化体验", "location": "灵山梵宫",
            "map_destination": "梵宫", "description": "在梵宫空间中感受木雕、琉璃与穹顶艺术，具体开放区域请遵循现场工作人员指引。",
            "arrival_notice": "建议提前 30 分钟到场排队", "image_key": "fangong",
            "valid_from": "2026-07-02T00:00:00+08:00", "valid_until": "2026-07-31T23:59:59+08:00",
            "schedules": [{"label": "每日", "times": ["10:00", "11:00", "12:00", "13:30", "14:30", "15:30"]}],
            "enabled": True, "featured": True, "order": 20,
        },
    ],
}

# Replace the legacy three-route seed with the approved six-route snapshot.
# Facility data is exposed through the same content endpoint so both visitor
# pages and the admin console read a single, versioned source of truth.
_DEFAULT_CONTENT["route"] = _route_defaults()
_DEFAULT_CONTENT["facility_category"] = _facility_category_defaults()
_DEFAULT_CONTENT["facility"] = _facility_defaults()


_ALLOWED_FIELDS = {
    "poi": {"title", "category", "summary", "enabled", "featured", "order"},
    "route": {"title", "helper", "duration", "duration_minutes", "audience", "pace", "summary", "stops", "notes", "audience_tags", "interest_tags", "tags", "enabled", "featured", "order"},
    "performance": {"title", "subtitle", "location", "map_destination", "description", "arrival_notice", "valid_from", "valid_until", "schedules", "enabled", "featured", "order"},
    "facility_category": {"title", "enabled", "order"},
    "facility": {"title", "enabled", "order"},
}

_lock = RLock()
_cache: dict[str, list[dict[str, Any]]] | None = None


def get_scenic_content() -> dict[str, Any]:
    with _lock:
        content = deepcopy(_load_content())
        for items in content.values():
            items.sort(key=lambda item: (int(item.get("order", 0)), str(item.get("title", ""))))
        return {"items": content}


def update_scenic_content(kind: str, item_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    if kind not in _DEFAULT_CONTENT:
        raise KeyError("unsupported content kind")
    if set(changes) - _ALLOWED_FIELDS[kind]:
        raise ValueError("unsupported content fields")
    normalized = _normalize_changes(kind, changes)

    with _lock:
        content = _load_content()
        item = next((entry for entry in content[kind] if entry["id"] == item_id), None)
        if item is None:
            raise KeyError("content item not found")
        item.update(normalized)
        _write_content(content)
        return deepcopy(item)


def _normalize_changes(kind: str, changes: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(changes)
    for field in ("title", "category", "summary", "helper", "duration", "audience", "pace", "subtitle", "location", "map_destination", "description", "arrival_notice"):
        if field in normalized:
            value = str(normalized[field]).strip()
            if field == "title" and not value:
                raise ValueError("title cannot be empty")
            normalized[field] = value

    for field in ("stops", "notes", "audience_tags", "interest_tags", "tags"):
        if field in normalized:
            if not isinstance(normalized[field], list):
                raise ValueError(f"{field} must be a list")
            normalized[field] = [str(value).strip() for value in normalized[field] if str(value).strip()]

    if kind == "route" and "stops" in normalized and len(normalized["stops"]) < 2:
        raise ValueError("route must contain at least two stops")

    if "duration_minutes" in normalized:
        value = int(normalized["duration_minutes"])
        if not 30 <= value <= 720:
            raise ValueError("duration_minutes out of range")
        normalized["duration_minutes"] = value

    if "order" in normalized:
        normalized["order"] = max(0, min(999, int(normalized["order"])))

    if kind == "performance":
        for field in ("valid_from", "valid_until"):
            if field in normalized:
                datetime.fromisoformat(str(normalized[field]))
        if "schedules" in normalized:
            schedules = normalized["schedules"]
            if not isinstance(schedules, list):
                raise ValueError("schedules must be a list")
            normalized["schedules"] = [
                {
                    "label": str(schedule.get("label", "")).strip(),
                    "times": [str(value).strip() for value in schedule.get("times", []) if str(value).strip()],
                }
                for schedule in schedules
                if isinstance(schedule, dict) and str(schedule.get("label", "")).strip()
            ]
    return normalized


def _load_content() -> dict[str, list[dict[str, Any]]]:
    global _cache
    if _cache is not None:
        return _cache
    path = _content_path()
    stored: Any = None
    if path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            stored = None
    merged = deepcopy(_DEFAULT_CONTENT)
    if isinstance(stored, dict):
        for kind in merged:
            stored_by_id = {
                item.get("id"): item
                for item in stored.get(kind, [])
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
            for item in merged[kind]:
                item.update(stored_by_id.get(item["id"], {}))
    _cache = merged
    return _cache


def _write_content(content: dict[str, list[dict[str, Any]]]) -> None:
    path = _content_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _content_path() -> Path:
    default_path = Path(__file__).resolve().parents[3] / "data" / "runtime" / "scenic_content_state.json"
    return Path(os.getenv("SCENIC_CONTENT_STATE_PATH", str(default_path)))


def _reset_scenic_content_cache() -> None:
    global _cache
    with _lock:
        _cache = None
