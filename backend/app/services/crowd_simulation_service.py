from __future__ import annotations

from datetime import datetime
from threading import RLock
from typing import Any, Literal

from app.services.scenic_status_service import _normalize_time, build_crowd_snapshot


CrowdScenario = Literal["steady", "entry_peak", "exit_peak"]
CrowdPlayback = Literal["playing", "paused"]

_lock = RLock()
_scenario: CrowdScenario = "steady"
_playback: CrowdPlayback = "playing"
_paused_at: datetime | None = None


def get_operational_crowd_snapshot(now: datetime | None = None) -> dict[str, Any]:
    with _lock:
        effective_time = _paused_at if _playback == "paused" and _paused_at else _normalize_time(now)
        scenario = _scenario
        playback = _playback
    snapshot = build_crowd_snapshot(effective_time, scenario=scenario)
    return {
        **snapshot,
        "simulation": {
            "scenario": scenario,
            "status": playback,
            "effective_at": effective_time.isoformat(timespec="seconds"),
        },
    }


def update_crowd_simulation(
    *,
    action: Literal["play", "pause", "reset"],
    scenario: CrowdScenario | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    global _scenario, _playback, _paused_at

    current_time = _normalize_time(now)
    with _lock:
        if action == "reset":
            _scenario = "steady"
            _playback = "playing"
            _paused_at = None
        else:
            if scenario is not None:
                _scenario = scenario
            if action == "pause":
                _playback = "paused"
                _paused_at = current_time
            elif action == "play":
                _playback = "playing"
                _paused_at = None
    return get_operational_crowd_snapshot(current_time)


def get_crowd_history(now: datetime | None = None) -> dict[str, Any]:
    current_time = _normalize_time(now)
    with _lock:
        scenario = _scenario
        playback = _playback

    points = []
    for hour in range(8, 19):
        point_time = current_time.replace(hour=hour, minute=0, second=0, microsecond=0)
        snapshot = build_crowd_snapshot(point_time, scenario=scenario)
        points.append(
            {
                "time": point_time.isoformat(timespec="seconds"),
                "label": f"{hour:02d}:00",
                "current_inside": snapshot["current_inside"],
                "today_entries": snapshot["today_entries"],
                "today_exits": snapshot["today_exits"],
            }
        )
    return {
        "scenario": scenario,
        "status": playback,
        "updated_at": current_time.isoformat(timespec="seconds"),
        "points": points,
    }


def _reset_crowd_simulation() -> None:
    global _scenario, _playback, _paused_at
    with _lock:
        _scenario = "steady"
        _playback = "playing"
        _paused_at = None
