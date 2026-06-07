from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.services.speech_service import SpeechService, SpeechServiceError


router = APIRouter(prefix="/api/speech", tags=["speech"])


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


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
