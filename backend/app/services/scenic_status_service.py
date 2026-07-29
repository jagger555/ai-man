from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import ScenicStatusConfig, get_scenic_status_config


AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"
SCENIC_TIMEZONE = timezone(timedelta(hours=8), name="Asia/Shanghai")

_ENTRANCES = (
    {
        "id": "main-gate",
        "name": "景区正门",
        "entry_share": 0.58,
        "exit_share": 0.52,
    },
    {
        "id": "group-gate",
        "name": "东侧团队入口",
        "entry_share": 0.24,
        "exit_share": 0.20,
    },
    {
        "id": "visitor-center",
        "name": "游客中心入口",
        "entry_share": 0.18,
        "exit_share": 0.28,
    },
)

# Cumulative entries and exits at each point in a representative operating day.
# The values are explicitly exposed as demo simulation data by the API.
_CROWD_CURVE = (
    (7.5, 0, 0),
    (8.0, 180, 10),
    (9.0, 720, 40),
    (10.0, 1380, 120),
    (11.0, 2150, 280),
    (12.0, 2750, 620),
    (13.0, 3180, 1100),
    (14.0, 3520, 1700),
    (15.0, 3790, 2440),
    (16.0, 3950, 3150),
    (17.0, 4020, 3750),
    (17.5, 4030, 4000),
    (18.0, 4030, 4030),
)

_weather_cache: dict[str, tuple[dict[str, Any], datetime]] = {}


class ScenicStatusServiceError(RuntimeError):
    pass


async def get_scenic_status(now: datetime | None = None) -> dict[str, Any]:
    current_time = _normalize_time(now)
    config = get_scenic_status_config()
    weather = await _load_weather(config, current_time)
    return {
        "scenic_name": config.scenic_name,
        "opening": _build_opening_status(current_time),
        "weather": weather,
        "crowd": build_crowd_snapshot(current_time),
        "updated_at": current_time.isoformat(timespec="seconds"),
    }


def build_crowd_snapshot(now: datetime | None = None) -> dict[str, Any]:
    current_time = _normalize_time(now)
    decimal_hour = _decimal_hour(current_time)
    today_entries, today_exits = _interpolate_totals(decimal_hour)
    previous_entries, previous_exits = _interpolate_totals(decimal_hour - (5 / 60))
    entries_last_5m = max(0, today_entries - previous_entries)
    exits_last_5m = max(0, today_exits - previous_exits)

    entrances: list[dict[str, Any]] = []
    for entrance in _ENTRANCES:
        entrance_entries = round(today_entries * float(entrance["entry_share"]))
        entrance_exits = round(today_exits * float(entrance["exit_share"]))
        recent_entries = round(entries_last_5m * float(entrance["entry_share"]))
        recent_exits = round(exits_last_5m * float(entrance["exit_share"]))
        entrances.append(
            {
                "id": entrance["id"],
                "name": entrance["name"],
                "today_entries": entrance_entries,
                "today_exits": entrance_exits,
                "entries_last_5m": recent_entries,
                "exits_last_5m": recent_exits,
                "flow_level": _flow_level(recent_entries + recent_exits),
            }
        )

    current_inside = max(0, today_entries - today_exits)
    has_live_flow = entries_last_5m > 0 or exits_last_5m > 0
    recommended = (
        min(entrances, key=lambda item: item["entries_last_5m"])
        if has_live_flow
        else None
    )
    return {
        "source": "demo_simulation",
        "source_label": "演示模拟数据",
        "current_inside": current_inside,
        "today_entries": today_entries,
        "today_exits": today_exits,
        "comfort_level": _comfort_level(current_inside),
        "recommended_entrance": recommended["name"] if recommended else None,
        "entrances": entrances,
        "updated_at": current_time.isoformat(timespec="seconds"),
    }


async def _load_weather(
    config: ScenicStatusConfig,
    now: datetime,
) -> dict[str, Any]:
    cache_entry = _weather_cache.get(config.adcode)
    if cache_entry is not None:
        cached_weather, cached_at = cache_entry
        cache_age = max(0, round((now - cached_at).total_seconds()))
        if 0 <= cache_age < config.weather_cache_seconds:
            return _weather_with_cache_metadata(
                cached_weather,
                status="live",
                cached_at=cached_at,
                age_seconds=cache_age,
                message="",
            )

    if not config.amap_web_service_key:
        return _unavailable_weather(config, "未配置高德天气服务密钥")

    params = {
        "key": config.amap_web_service_key,
        "city": config.adcode,
        "extensions": "base",
        "output": "JSON",
    }
    try:
        async with httpx.AsyncClient(timeout=config.weather_timeout) as client:
            response = await client.get(AMAP_WEATHER_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        live_weather = _normalize_amap_weather(payload, config.adcode)
    except (httpx.HTTPError, ValueError, ScenicStatusServiceError):
        if cache_entry is not None:
            cached_weather, cached_at = cache_entry
            cache_age = max(0, round((now - cached_at).total_seconds()))
            if cache_age <= config.weather_max_stale_seconds:
                return _weather_with_cache_metadata(
                    cached_weather,
                    status="cached",
                    cached_at=cached_at,
                    age_seconds=cache_age,
                    message="天气服务暂时不可用，显示最近一次数据",
                )
        return _unavailable_weather(config, "高德天气服务暂时不可用")

    _weather_cache[config.adcode] = (live_weather, now)
    return _weather_with_cache_metadata(
        live_weather,
        status="live",
        cached_at=now,
        age_seconds=0,
        message="",
    )


def _normalize_amap_weather(payload: Any, fallback_adcode: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("status") != "1":
        raise ScenicStatusServiceError("高德天气返回异常")
    lives = payload.get("lives")
    if not isinstance(lives, list) or not lives or not isinstance(lives[0], dict):
        raise ScenicStatusServiceError("高德天气没有实时数据")
    live = lives[0]
    return {
        "provider": "高德天气",
        "city": str(live.get("city") or "滨湖区"),
        "adcode": str(live.get("adcode") or fallback_adcode),
        "weather": str(live.get("weather") or "--"),
        "temperature": _nullable_string(live.get("temperature")),
        "wind_direction": str(live.get("winddirection") or "--"),
        "wind_power": str(live.get("windpower") or "--"),
        "humidity": _nullable_string(live.get("humidity")),
        "report_time": str(live.get("reporttime") or ""),
    }


def _unavailable_weather(
    config: ScenicStatusConfig,
    message: str,
) -> dict[str, Any]:
    return {
        "status": "unavailable",
        "provider": "高德天气",
        "city": "滨湖区",
        "adcode": config.adcode,
        "weather": "暂不可用",
        "temperature": None,
        "wind_direction": "--",
        "wind_power": "--",
        "humidity": None,
        "report_time": "",
        "fetched_at": None,
        "age_seconds": None,
        "message": message,
    }


def _weather_with_cache_metadata(
    weather: dict[str, Any],
    *,
    status: str,
    cached_at: datetime,
    age_seconds: int,
    message: str,
) -> dict[str, Any]:
    return {
        **weather,
        "status": status,
        "fetched_at": cached_at.isoformat(timespec="seconds"),
        "age_seconds": age_seconds,
        "message": message,
    }


def _build_opening_status(now: datetime) -> dict[str, str]:
    hour = _decimal_hour(now)
    if hour < 7.5:
        status = "upcoming"
        label = "参考开放时段外"
    elif hour < 17.5:
        status = "open"
        label = "参考开放时段内"
    else:
        status = "closed"
        label = "参考开放时段外"
    return {
        "status": status,
        "label": label,
        "hours": "07:30–17:30",
        "source": "演示运营配置",
    }


def _interpolate_totals(hour: float) -> tuple[int, int]:
    if hour <= _CROWD_CURVE[0][0]:
        return 0, 0
    if hour >= _CROWD_CURVE[-1][0]:
        return _CROWD_CURVE[-1][1], _CROWD_CURVE[-1][2]

    for start, end in zip(_CROWD_CURVE, _CROWD_CURVE[1:]):
        if start[0] <= hour <= end[0]:
            ratio = (hour - start[0]) / (end[0] - start[0])
            entries = round(start[1] + ((end[1] - start[1]) * ratio))
            exits = round(start[2] + ((end[2] - start[2]) * ratio))
            return entries, exits
    return 0, 0


def _flow_level(total_last_5m: int) -> str:
    if total_last_5m <= 10:
        return "畅通"
    if total_last_5m <= 25:
        return "适中"
    return "繁忙"


def _comfort_level(current_inside: int) -> str:
    if current_inside < 1600:
        return "舒适"
    if current_inside < 2800:
        return "适中"
    return "较拥挤"


def _decimal_hour(value: datetime) -> float:
    return value.hour + (value.minute / 60) + (value.second / 3600)


def _normalize_time(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(SCENIC_TIMEZONE)
    if value.tzinfo is None:
        return value.replace(tzinfo=SCENIC_TIMEZONE)
    return value.astimezone(SCENIC_TIMEZONE)


def _nullable_string(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _reset_weather_cache() -> None:
    _weather_cache.clear()
