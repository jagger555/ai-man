from __future__ import annotations

import base64
from typing import Any

import httpx

from app.core.config import SpeechConfig, get_speech_config


class SpeechServiceError(RuntimeError):
    pass


class SpeechService:
    def __init__(self, config: SpeechConfig | None = None):
        self._config = config or get_speech_config()

    def recognize(self, audio_bytes: bytes, audio_format: str = "wav") -> str:
        self._ensure_asr_configured()
        if not audio_bytes:
            raise ValueError("audio must not be empty")

        headers = {"Authorization": f"Bearer {self._config.api_key}"}
        files = {
            "audio": (
                f"speech.{audio_format}",
                audio_bytes,
                _content_type_for_format(audio_format),
            )
        }
        data = {"format": audio_format}

        response = self._post_with_retries(
            self._config.asr_url,
            headers=headers,
            files=files,
            data=data,
        )

        try:
            payload = response.json()
        except ValueError as exc:
            raise SpeechServiceError("ASR response is not JSON.") from exc

        text = _extract_text(payload)
        if not text:
            raise SpeechServiceError("ASR response did not include recognized text.")
        return text

    def synthesize(self, text: str) -> bytes:
        self._ensure_tts_configured()
        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("text must not be empty")

        headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "text": normalized_text,
            "voice": self._config.tts_voice,
            "format": "wav",
        }

        response = self._post_with_retries(
            self._config.tts_url,
            headers=headers,
            json=payload,
        )
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("audio/"):
            return response.content

        try:
            data = response.json()
        except ValueError as exc:
            raise SpeechServiceError("TTS response is neither audio nor JSON.") from exc

        audio = _extract_audio_bytes(data)
        if not audio:
            raise SpeechServiceError("TTS response did not include audio bytes.")
        return audio

    def _ensure_asr_configured(self) -> None:
        if not self._config.api_key or not self._config.asr_url:
            raise SpeechServiceError("Speech ASR is not configured.")

    def _ensure_tts_configured(self) -> None:
        if not self._config.api_key or not self._config.tts_url:
            raise SpeechServiceError("Speech TTS is not configured.")

    def _post_with_retries(self, url: str, **kwargs: Any) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                response = httpx.post(url, timeout=self._config.timeout, **kwargs)
                response.raise_for_status()
                return response
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    import time

                    time.sleep(0.5 * (2**attempt))
        raise SpeechServiceError(
            f"Speech request failed after 3 attempts: {last_exc}"
        ) from last_exc


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = [
        payload.get("text"),
        payload.get("transcript"),
        payload.get("result"),
        payload.get("output", {}).get("text")
        if isinstance(payload.get("output"), dict)
        else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ""


def _extract_audio_bytes(payload: dict[str, Any]) -> bytes:
    candidates = [
        payload.get("audio"),
        payload.get("audio_base64"),
        payload.get("data"),
        payload.get("output", {}).get("audio")
        if isinstance(payload.get("output"), dict)
        else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            try:
                return base64.b64decode(candidate)
            except ValueError:
                continue
    return b""


def _content_type_for_format(audio_format: str) -> str:
    normalized = audio_format.lower().strip(".")
    if normalized == "mp3":
        return "audio/mpeg"
    if normalized == "webm":
        return "audio/webm"
    if normalized == "ogg":
        return "audio/ogg"
    return "audio/wav"
