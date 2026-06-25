from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import get_digital_human_config


router = APIRouter(prefix="/api/digital-human", tags=["digital-human"])


@router.get("/config")
def digital_human_config():
    config = get_digital_human_config()
    return JSONResponse(
        {
            "enabled": bool(config.base_url),
            "base_url": config.base_url,
            "avatar": config.avatar,
            "voice": config.voice,
            "ref_audio": config.ref_audio,
            "ref_text": config.ref_text,
        },
        media_type="application/json; charset=utf-8",
    )
