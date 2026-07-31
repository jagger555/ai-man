from __future__ import annotations

import json
import os
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile

from app.core.config import DigitalHumanConfig, get_digital_human_config


AVATAR_VOICE_OVERRIDES = {
    "001": "Serena",
    "002": "Ethan",
    "626": "Cherry",
}


def get_effective_digital_human_config() -> DigitalHumanConfig:
    config = get_digital_human_config()
    selected_avatar = _load_state().get("selected_avatar")
    if isinstance(selected_avatar, str) and selected_avatar.strip():
        normalized_avatar = selected_avatar.strip()
        voice_override = AVATAR_VOICE_OVERRIDES.get(normalized_avatar)
        if voice_override:
            return replace(
                config,
                avatar=normalized_avatar,
                voice=voice_override,
                ref_audio=voice_override,
            )
        return replace(config, avatar=normalized_avatar)
    return config


def list_local_avatars() -> dict[str, Any]:
    avatar_dir = resolve_avatar_dir()
    current_avatar = get_effective_digital_human_config().avatar
    avatars: list[dict[str, Any]] = []

    if avatar_dir.exists():
        for avatar_path in sorted(avatar_dir.iterdir(), key=lambda item: item.name.lower()):
            if not avatar_path.is_dir() or avatar_path.name.startswith("."):
                continue
            full_image_count = _count_files(avatar_path / "full_imgs")
            face_image_count = _count_files(avatar_path / "face_imgs")
            preview_path = _find_avatar_preview(avatar_path)
            avatars.append(
                {
                    "avatar_id": avatar_path.name,
                    "path": str(avatar_path),
                    "preview_url": (
                        f"/api/digital-human/avatars/{quote(avatar_path.name, safe='')}/preview"
                        if preview_path
                        else ""
                    ),
                    "selected": avatar_path.name == current_avatar,
                    "ready": (avatar_path / "coords.pkl").exists()
                    and full_image_count > 0
                    and face_image_count > 0,
                    "full_image_count": full_image_count,
                    "face_image_count": face_image_count,
                }
            )

    return {
        "avatar_dir": str(avatar_dir),
        "current_avatar": current_avatar,
        "avatars": avatars,
    }


def get_local_avatar_preview(avatar_id: str) -> Path:
    avatar_path = _resolve_local_avatar_path(avatar_id)
    preview_path = _find_avatar_preview(avatar_path)
    if preview_path is None:
        raise HTTPException(status_code=404, detail="Avatar preview image not found")
    return preview_path


def select_local_avatar(avatar_id: str) -> dict[str, Any]:
    normalized_avatar_id = avatar_id.strip()
    if not normalized_avatar_id:
        raise HTTPException(status_code=400, detail="avatar_id is required")

    avatar_path = resolve_avatar_dir() / normalized_avatar_id
    if not avatar_path.exists() or not avatar_path.is_dir():
        raise HTTPException(status_code=404, detail="Avatar directory not found")

    state = _load_state()
    state["selected_avatar"] = normalized_avatar_id
    _save_state(state)
    return {
        "selected_avatar": normalized_avatar_id,
        "config": _serialize_config(get_effective_digital_human_config()),
    }


def _resolve_local_avatar_path(avatar_id: str) -> Path:
    normalized_avatar_id = avatar_id.strip()
    if (
        not normalized_avatar_id
        or Path(normalized_avatar_id).name != normalized_avatar_id
        or normalized_avatar_id in {".", ".."}
    ):
        raise HTTPException(status_code=400, detail="Invalid avatar_id")

    avatar_dir = resolve_avatar_dir().resolve()
    avatar_path = (avatar_dir / normalized_avatar_id).resolve()
    if avatar_path.parent != avatar_dir or not avatar_path.is_dir():
        raise HTTPException(status_code=404, detail="Avatar directory not found")
    return avatar_path


def _find_avatar_preview(avatar_path: Path) -> Path | None:
    image_extensions = {".png", ".jpg", ".jpeg", ".webp"}
    for directory_name in ("full_imgs", "face_imgs"):
        image_dir = avatar_path / directory_name
        if not image_dir.is_dir():
            continue
        for image_path in sorted(image_dir.iterdir(), key=lambda item: item.name.lower()):
            if image_path.is_file() and image_path.suffix.lower() in image_extensions:
                return image_path
    return None


async def create_avatar_task(
    *,
    model: str,
    avatar_id: str,
    video_path: str,
    video_file: UploadFile | None,
    params: dict[str, str],
) -> dict[str, Any]:
    payload = _clean_payload(
        {
            "model": model,
            "avatar_id": avatar_id,
            "video_path": video_path,
            **params,
        }
    )
    if not payload.get("model") or not payload.get("avatar_id"):
        raise HTTPException(status_code=400, detail="model and avatar_id are required")
    if video_file is None and not payload.get("video_path"):
        raise HTTPException(status_code=400, detail="video_path or video_file is required")

    url = _livetalking_url("/api/avatar/task")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if video_file is not None:
                file_bytes = await video_file.read()
                files = {
                    "video_file": (
                        video_file.filename or "avatar-video.mp4",
                        file_bytes,
                        video_file.content_type or "application/octet-stream",
                    )
                }
                response = await client.post(url, data=payload, files=files)
            else:
                response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LiveTalking avatar task request failed: {exc}",
        ) from exc

    return _parse_livetalking_response(response)


async def list_avatar_tasks() -> dict[str, Any]:
    return await _request_livetalking("GET", "/api/avatar/tasks")


async def get_avatar_task(task_id: str) -> dict[str, Any]:
    return await _request_livetalking("GET", f"/api/avatar/task/{task_id}")


async def delete_avatar_task(task_id: str) -> dict[str, Any]:
    return await _request_livetalking("DELETE", f"/api/avatar/task/{task_id}")


def _serialize_config(config: DigitalHumanConfig) -> dict[str, str | bool]:
    return {
        "enabled": bool(config.base_url),
        "base_url": config.base_url,
        "avatar": config.avatar,
        "voice": config.voice,
        "ref_audio": config.ref_audio,
        "ref_text": config.ref_text,
    }


def resolve_livetalking_root() -> Path:
    raw_root = os.getenv("LIVETALKING_ROOT", "").strip()
    root = (
        Path(raw_root)
        if raw_root
        else Path(__file__).resolve().parents[4] / "LiveTalking"
    )
    if (root / "app.py").exists():
        return root
    nested_root = root / "LiveTalking"
    if (nested_root / "app.py").exists():
        return nested_root
    return root


def resolve_avatar_dir() -> Path:
    raw_avatar_dir = os.getenv("DIGITAL_HUMAN_AVATAR_DIR", "")
    if raw_avatar_dir:
        return Path(raw_avatar_dir)
    return resolve_livetalking_root() / "data" / "avatars"


def _state_path() -> Path:
    raw_state_path = os.getenv("DIGITAL_HUMAN_STATE_PATH")
    if raw_state_path:
        return Path(raw_state_path)
    return Path(__file__).resolve().parents[3] / "data" / "runtime" / "digital_human_state.json"


def _load_state() -> dict[str, Any]:
    path = _state_path()
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if isinstance(payload, dict):
        return payload
    return {}


def _save_state(state: dict[str, Any]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _count_files(path: Path) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    return sum(1 for item in path.iterdir() if item.is_file())


def _clean_payload(payload: dict[str, str]) -> dict[str, str]:
    return {
        key: value.strip()
        for key, value in payload.items()
        if isinstance(value, str) and value.strip()
    }


def _livetalking_url(path: str) -> str:
    config = get_effective_digital_human_config()
    if not config.base_url:
        raise HTTPException(status_code=400, detail="DIGITAL_HUMAN_BASE_URL is not configured")
    return f"{config.base_url}{path}"


async def _request_livetalking(method: str, path: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(method, _livetalking_url(path))
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LiveTalking request failed: {exc}",
        ) from exc
    return _parse_livetalking_response(response)


def _parse_livetalking_response(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="LiveTalking returned a non-JSON response",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=payload)
    if isinstance(payload, dict):
        return payload
    return {"code": 0, "msg": "ok", "data": payload}
