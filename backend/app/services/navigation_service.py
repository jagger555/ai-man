from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_navigation_config


AMAP_WALKING_URL = "https://restapi.amap.com/v3/direction/walking"


class NavigationServiceError(RuntimeError):
    pass


async def plan_walking_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> dict[str, Any]:
    config = get_navigation_config()
    if not config.amap_web_service_key:
        raise NavigationServiceError("AMAP_WEB_SERVICE_KEY is not configured")

    params = {
        "key": config.amap_web_service_key,
        "origin": f"{origin[0]},{origin[1]}",
        "destination": f"{destination[0]},{destination[1]}",
    }
    try:
        async with httpx.AsyncClient(timeout=config.timeout) as client:
            response = await client.get(AMAP_WALKING_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise NavigationServiceError("高德步行路线服务暂时不可用") from exc

    paths = payload.get("route", {}).get("paths", [])
    if payload.get("status") != "1" or not paths:
        info = payload.get("info") or payload.get("infocode") or "未找到可用路线"
        raise NavigationServiceError(str(info))

    path = paths[0]
    steps = [_normalize_step(step) for step in path.get("steps", [])]
    return {
        "provider": "amap_web_service",
        "origin": [origin[0], origin[1]],
        "destination": [destination[0], destination[1]],
        "distance": _to_int(path.get("distance")),
        "duration": _to_int(path.get("duration")),
        "steps": steps,
        "polyline": [point for step in steps for point in step["polyline"]],
    }


def _normalize_step(step: dict[str, Any]) -> dict[str, Any]:
    return {
        "instruction": str(step.get("instruction") or "继续步行"),
        "distance": _to_int(step.get("distance")),
        "duration": _to_int(step.get("duration")),
        "polyline": _parse_polyline(step.get("polyline")),
    }


def _parse_polyline(value: Any) -> list[list[float]]:
    if not isinstance(value, str):
        return []
    points: list[list[float]] = []
    for item in value.split(";"):
        try:
            lng, lat = item.split(",", maxsplit=1)
            points.append([float(lng), float(lat)])
        except (TypeError, ValueError):
            continue
    return points


def _to_int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0
