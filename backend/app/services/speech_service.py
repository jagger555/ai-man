from __future__ import annotations

import base64
import json
import uuid
from typing import Any

import httpx
from websockets.sync.client import connect as websocket_connect

from app.core.config import SpeechConfig, get_speech_config

ASR_SAMPLE_RATE = 16000
ASR_AUDIO_FORMAT = "pcm"
ASR_MAX_SENTENCE_SILENCE_MS = 800


class SpeechServiceError(RuntimeError):
    pass


class SpeechService:
    def __init__(self, config: SpeechConfig | None = None):
        self._config = config or get_speech_config()

    def recognize(self, audio_bytes: bytes, audio_format: str = "wav") -> str:
        self._ensure_asr_configured()
        if not audio_bytes:
            raise ValueError("audio must not be empty")
        if self._config.asr_url.startswith("wss://"):
            return self._recognize_with_websocket(audio_bytes, audio_format)

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
        if self._config.tts_url.startswith("wss://"):
            return self._synthesize_with_websocket(normalized_text)

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

    def _recognize_with_websocket(self, audio_bytes: bytes, audio_format: str) -> str:
        task_id = str(uuid.uuid4())
        results: list[str] = []
        headers = self._websocket_headers()
        start_event = self.build_asr_start_event(
            task_id,
            audio_format=_normalize_audio_format(audio_format),
        )
        finish_event = self.build_asr_finish_event(task_id)

        try:
            with websocket_connect(
                self._config.asr_url,
                additional_headers=headers,
                open_timeout=self._config.timeout,
                close_timeout=self._config.timeout,
            ) as websocket:
                websocket.send(json.dumps(start_event, ensure_ascii=False))
                self._wait_for_event(websocket, {"task-started"})
                websocket.send(audio_bytes)
                websocket.send(json.dumps(finish_event, ensure_ascii=False))

                while True:
                    message = websocket.recv(timeout=self._config.timeout)
                    if isinstance(message, bytes):
                        continue
                    event = _load_json_event(message)
                    text = _extract_text(event)
                    if text:
                        results.append(text)
                    event_name = _event_name(event)
                    if event_name in {"task-finished", "task-failed"}:
                        if event_name == "task-failed":
                            raise SpeechServiceError(f"ASR task failed: {event}")
                        break
        except SpeechServiceError:
            raise
        except Exception as exc:
            raise SpeechServiceError(f"ASR WebSocket request failed: {exc}") from exc

        text = _select_final_text(results)
        if not text:
            raise SpeechServiceError("ASR response did not include recognized text.")
        return text

    def _synthesize_with_websocket(self, text: str) -> bytes:
        audio_chunks: list[bytes] = []
        headers = self._websocket_headers()
        session_update = {
            "type": "session.update",
            "session": {
                "mode": "commit",
                "voice": self._config.tts_voice,
                "response_format": self._config.tts_response_format,
                "sample_rate": self._config.tts_sample_rate,
            },
        }
        append_event = {
            "type": "input_text_buffer.append",
            "text": text,
        }
        commit_event = {"type": "input_text_buffer.commit"}
        finish_event = {"type": "session.finish"}

        try:
            with websocket_connect(
                self._config.tts_url,
                additional_headers=headers,
                open_timeout=self._config.timeout,
                close_timeout=self._config.timeout,
            ) as websocket:
                self._wait_for_event(websocket, {"session.created"})
                websocket.send(json.dumps(session_update, ensure_ascii=False))
                websocket.send(json.dumps(append_event, ensure_ascii=False))
                websocket.send(json.dumps(commit_event, ensure_ascii=False))

                while True:
                    message = websocket.recv(timeout=self._config.timeout)
                    if isinstance(message, bytes):
                        audio_chunks.append(message)
                        continue
                    event = _load_json_event(message)
                    event_name = _event_name(event)
                    if event_name == "response.audio.delta":
                        audio_delta = event.get("delta") or event.get("audio")
                        if isinstance(audio_delta, str) and audio_delta.strip():
                            audio_chunks.append(base64.b64decode(audio_delta))
                    if event_name in {"response.audio.done", "response.done"}:
                        websocket.send(json.dumps(finish_event, ensure_ascii=False))
                    if event_name in {"session.finished", "error"}:
                        if event_name == "error":
                            raise SpeechServiceError(f"TTS task failed: {event}")
                        break
        except SpeechServiceError:
            raise
        except Exception as exc:
            raise SpeechServiceError(f"TTS WebSocket request failed: {exc}") from exc

        audio = b"".join(audio_chunks)
        if not audio:
            raise SpeechServiceError("TTS response did not include audio bytes.")
        return audio

    def _wait_for_event(self, websocket: Any, event_names: set[str]) -> dict[str, Any]:
        while True:
            message = websocket.recv(timeout=self._config.timeout)
            if isinstance(message, bytes):
                continue
            event = _load_json_event(message)
            event_name = _event_name(event)
            if event_name in event_names:
                return event
            if event_name in {"task-failed", "error"}:
                raise SpeechServiceError(f"Speech WebSocket task failed: {event}")

    def _websocket_headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "user-agent": "ai-man-guide/1.0",
        }
        if self._config.workspace_id:
            headers["X-DashScope-WorkSpace"] = self._config.workspace_id
        return headers

    @property
    def asr_url(self) -> str:
        return self._config.asr_url

    @property
    def timeout(self) -> int:
        return self._config.timeout

    def websocket_headers(self) -> dict[str, str]:
        self._ensure_asr_configured()
        return self._websocket_headers()

    def build_asr_start_event(
        self,
        task_id: str,
        audio_format: str = ASR_AUDIO_FORMAT,
        sample_rate: int = ASR_SAMPLE_RATE,
    ) -> dict[str, Any]:
        return {
            "header": {
                "action": "run-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": self._config.asr_model,
                "input": {},
                "parameters": {
                    "format": _normalize_audio_format(audio_format),
                    "sample_rate": sample_rate,
                    "semantic_punctuation_enabled": False,
                    "max_sentence_silence": ASR_MAX_SENTENCE_SILENCE_MS,
                },
            },
        }

    def build_asr_finish_event(self, task_id: str) -> dict[str, Any]:
        return {
            "header": {
                "action": "finish-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {
                "input": {},
            },
        }

    def ensure_asr_configured(self) -> None:
        self._ensure_asr_configured()

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
        payload.get("sentence", {}).get("text")
        if isinstance(payload.get("sentence"), dict)
        else None,
        payload.get("output", {}).get("text")
        if isinstance(payload.get("output"), dict)
        else None,
        payload.get("payload", {}).get("output", {}).get("text")
        if isinstance(payload.get("payload"), dict)
        and isinstance(payload.get("payload", {}).get("output"), dict)
        else None,
        payload.get("payload", {}).get("output", {}).get("sentence", {}).get("text")
        if isinstance(payload.get("payload"), dict)
        and isinstance(payload.get("payload", {}).get("output"), dict)
        and isinstance(payload.get("payload", {}).get("output", {}).get("sentence"), dict)
        else None,
        payload.get("payload", {}).get("sentence", {}).get("text")
        if isinstance(payload.get("payload"), dict)
        and isinstance(payload.get("payload", {}).get("sentence"), dict)
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
    normalized = _normalize_audio_format(audio_format)
    if normalized == "mp3":
        return "audio/mpeg"
    if normalized == "webm":
        return "audio/webm"
    if normalized == "ogg":
        return "audio/ogg"
    return "audio/wav"


def _normalize_audio_format(audio_format: str) -> str:
    normalized = audio_format.lower().strip(".")
    if normalized == "mpeg":
        return "mp3"
    return normalized or "wav"


def _load_json_event(message: str) -> dict[str, Any]:
    try:
        event = json.loads(message)
    except ValueError as exc:
        raise SpeechServiceError("Speech WebSocket response is not JSON.") from exc
    if not isinstance(event, dict):
        raise SpeechServiceError("Speech WebSocket response is not an object.")
    return event


def _event_name(event: dict[str, Any]) -> str:
    event_type = event.get("type")
    if isinstance(event_type, str):
        return event_type
    header = event.get("header")
    if isinstance(header, dict):
        event_name = header.get("event")
        if isinstance(event_name, str):
            return event_name
        action = header.get("action")
        if isinstance(action, str):
            return action
    event_name = event.get("event")
    return event_name if isinstance(event_name, str) else ""


def _select_final_text(results: list[str]) -> str:
    if not results:
        return ""
    return max(results, key=len).strip()
