from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from io import BytesIO
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from websockets.client import connect as async_websocket_connect
from websockets.exceptions import ConnectionClosed

from app.services.speech_service import (
    ASR_AUDIO_FORMAT,
    ASR_SAMPLE_RATE,
    SpeechService,
    SpeechServiceError,
    _event_name,
    _extract_text,
    _load_json_event,
    _select_final_text,
)


router = APIRouter(prefix="/api/speech", tags=["speech"])


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.websocket("/asr-stream")
async def stream_asr(websocket: WebSocket):
    await websocket.accept()
    service = SpeechService()
    try:
        service.ensure_asr_configured()
    except SpeechServiceError as exc:
        await _send_asr_error(websocket, str(exc))
        await websocket.close()
        return

    task_id = str(uuid.uuid4())
    try:
        await _wait_for_client_start(websocket)
        async with async_websocket_connect(
            service.asr_url,
            extra_headers=service.websocket_headers(),
            open_timeout=service.timeout,
            close_timeout=service.timeout,
        ) as upstream:
            await upstream.send(
                json.dumps(
                    service.build_asr_start_event(
                        task_id,
                        audio_format=ASR_AUDIO_FORMAT,
                        sample_rate=ASR_SAMPLE_RATE,
                    ),
                    ensure_ascii=False,
                )
            )
            await _wait_for_upstream_event(upstream, {"task-started"})

            client_task = asyncio.create_task(
                _forward_client_audio(websocket, upstream, service, task_id)
            )
            try:
                await _forward_upstream_results(websocket, upstream)
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(client_task, timeout=0.2)
            finally:
                client_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await client_task
    except SpeechServiceError as exc:
        await _send_asr_error(websocket, str(exc))
    except Exception as exc:
        await _send_asr_error(websocket, f"ASR stream failed: {exc}")
    finally:
        with contextlib.suppress(Exception):
            await websocket.close()


@router.post("/recognize")
async def recognize_speech(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio file must not be empty")

    audio_format = _guess_audio_format(audio.filename, audio.content_type)
    try:
        text = SpeechService().recognize(audio_bytes, audio_format=audio_format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SpeechServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return JSONResponse({"text": text}, media_type="application/json; charset=utf-8")


@router.post("/synthesize")
def synthesize_speech(request: SynthesizeRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")

    try:
        audio_bytes = SpeechService().synthesize(text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SpeechServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return StreamingResponse(
        BytesIO(audio_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="speech.wav"'},
    )


def _guess_audio_format(filename: str | None, content_type: str | None) -> str:
    if content_type:
        if "webm" in content_type:
            return "webm"
        if "mpeg" in content_type or "mp3" in content_type:
            return "mp3"
        if "ogg" in content_type:
            return "ogg"
    if filename and "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return "wav"


async def _wait_for_client_start(websocket: WebSocket) -> None:
    message = await websocket.receive()
    if message.get("type") == "websocket.disconnect":
        raise SpeechServiceError("client disconnected before ASR started")
    try:
        payload = json.loads(message.get("text") or "{}")
    except ValueError as exc:
        raise SpeechServiceError("ASR stream start message is not JSON") from exc
    if payload.get("type") != "start":
        raise SpeechServiceError("ASR stream must start with {'type': 'start'}")


async def _forward_client_audio(
    websocket: WebSocket,
    upstream: Any,
    service: SpeechService,
    task_id: str,
) -> None:
    while True:
        message = await websocket.receive()
        if message.get("type") == "websocket.disconnect":
            await upstream.send(
                json.dumps(service.build_asr_finish_event(task_id), ensure_ascii=False)
            )
            return
        if message.get("bytes") is not None:
            await upstream.send(message["bytes"])
            continue
        if message.get("text") is not None:
            try:
                payload = json.loads(message["text"])
            except ValueError:
                continue
            if payload.get("type") == "finish":
                await upstream.send(
                    json.dumps(
                        service.build_asr_finish_event(task_id), ensure_ascii=False
                    )
                )
                return


async def _forward_upstream_results(websocket: WebSocket, upstream: Any) -> None:
    results: list[str] = []
    while True:
        try:
            message = await upstream.recv()
        except ConnectionClosed:
            if results:
                await websocket.send_json(
                    {"type": "final", "text": _select_final_text(results)}
                )
                return
            raise SpeechServiceError("ASR upstream closed before returning text")

        if isinstance(message, bytes):
            continue
        event = _load_json_event(message)
        event_name = _event_name(event)
        if event_name == "task-failed":
            raise SpeechServiceError(f"ASR task failed: {event}")

        text = _extract_text(event)
        if text:
            results.append(text)
            await websocket.send_json({"type": "partial", "text": text})

        if event_name == "task-finished":
            await websocket.send_json(
                {"type": "final", "text": _select_final_text(results)}
            )
            return


async def _wait_for_upstream_event(upstream: Any, event_names: set[str]) -> None:
    while True:
        message = await upstream.recv()
        if isinstance(message, bytes):
            continue
        event = _load_json_event(message)
        event_name = _event_name(event)
        if event_name in event_names:
            return
        if event_name == "task-failed":
            raise SpeechServiceError(f"ASR task failed: {event}")


async def _send_asr_error(websocket: WebSocket, message: str) -> None:
    with contextlib.suppress(Exception):
        await websocket.send_json({"type": "error", "message": message})
