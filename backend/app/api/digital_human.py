from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.services.digital_human_service import (
    create_avatar_task,
    delete_avatar_task,
    get_avatar_task,
    get_effective_digital_human_config,
    get_local_avatar_preview,
    list_avatar_tasks,
    list_local_avatars,
    select_local_avatar,
)


router = APIRouter(prefix="/api/digital-human", tags=["digital-human"])


class SelectAvatarPayload(BaseModel):
    avatar_id: str = Field(min_length=1, max_length=120)


@router.get("/config")
def digital_human_config():
    config = get_effective_digital_human_config()
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


@router.get("/avatars")
def digital_human_avatars():
    return JSONResponse(
        list_local_avatars(),
        media_type="application/json; charset=utf-8",
    )


@router.get("/avatars/{avatar_id}/preview")
def digital_human_avatar_preview(avatar_id: str):
    preview_path = get_local_avatar_preview(avatar_id)
    return FileResponse(preview_path, content_disposition_type="inline")


@router.post("/avatars/select")
def select_digital_human_avatar(payload: SelectAvatarPayload):
    return JSONResponse(
        select_local_avatar(payload.avatar_id),
        media_type="application/json; charset=utf-8",
    )


@router.post("/avatar-tasks")
async def create_digital_human_avatar_task(
    model: str = Form(default="wav2lip"),
    avatar_id: str = Form(...),
    video_path: str = Form(default=""),
    video_file: UploadFile | None = File(default=None),
    img_size: str = Form(default="256"),
    nosmooth: str = Form(default="false"),
    pads: str = Form(default="0 10 0 0"),
    face_det_batch_size: str = Form(default="16"),
    bbox_shift: str = Form(default="0"),
    extra_margin: str = Form(default="10"),
    parsing_mode: str = Form(default="jaw"),
    version: str = Form(default="v15"),
):
    payload = await create_avatar_task(
        model=model,
        avatar_id=avatar_id,
        video_path=video_path,
        video_file=video_file,
        params={
            "img_size": img_size,
            "nosmooth": nosmooth,
            "pads": pads,
            "face_det_batch_size": face_det_batch_size,
            "bbox_shift": bbox_shift,
            "extra_margin": extra_margin,
            "parsing_mode": parsing_mode,
            "version": version,
        },
    )
    return JSONResponse(payload, media_type="application/json; charset=utf-8")


@router.get("/avatar-tasks")
async def list_digital_human_avatar_tasks():
    payload = await list_avatar_tasks()
    return JSONResponse(payload, media_type="application/json; charset=utf-8")


@router.get("/avatar-tasks/{task_id}")
async def get_digital_human_avatar_task(task_id: str):
    payload = await get_avatar_task(task_id)
    return JSONResponse(payload, media_type="application/json; charset=utf-8")


@router.delete("/avatar-tasks/{task_id}")
async def delete_digital_human_avatar_task(task_id: str):
    payload = await delete_avatar_task(task_id)
    return JSONResponse(payload, media_type="application/json; charset=utf-8")
