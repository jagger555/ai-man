import base64
import json

from fastapi.testclient import TestClient

from app.main import app
from app.services.speech_service import SpeechService


def test_speech_recognize_returns_text(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_ASR_URL", "https://example.com/asr")

    def fake_post(url, **kwargs):
        assert url == "https://example.com/asr"
        assert kwargs["headers"]["Authorization"] == "Bearer test-key"
        assert "audio" in kwargs["files"]

        class FakeResponse:
            headers = {"content-type": "application/json"}
            content = b""

            def raise_for_status(self):
                return None

            def json(self):
                return {"text": "灵山大佛有多高"}

        return FakeResponse()

    monkeypatch.setattr("app.services.speech_service.httpx.post", fake_post)

    client = TestClient(app)
    response = client.post(
        "/api/speech/recognize",
        files={"audio": ("speech.wav", b"RIFF....WAVE", "audio/wav")},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "灵山大佛有多高"}


def test_speech_recognize_rejects_empty_file(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_ASR_URL", "https://example.com/asr")

    client = TestClient(app)
    response = client.post(
        "/api/speech/recognize",
        files={"audio": ("speech.wav", b"", "audio/wav")},
    )

    assert response.status_code == 400


def test_speech_recognize_returns_502_when_not_configured(monkeypatch):
    monkeypatch.delenv("BAILIAN_API_KEY", raising=False)
    monkeypatch.delenv("SPEECH_API_KEY", raising=False)
    monkeypatch.setenv("BAILIAN_ASR_URL", "https://example.com/asr")

    client = TestClient(app)
    response = client.post(
        "/api/speech/recognize",
        files={"audio": ("speech.wav", b"RIFF....WAVE", "audio/wav")},
    )

    assert response.status_code == 502


def test_speech_synthesize_returns_audio(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_TTS_URL", "https://example.com/tts")

    def fake_post(url, **kwargs):
        assert url == "https://example.com/tts"
        assert kwargs["json"]["text"] == "欢迎来到灵山胜境"

        class FakeResponse:
            headers = {"content-type": "audio/wav"}
            content = b"RIFFaudio"

            def raise_for_status(self):
                return None

            def json(self):
                return {}

        return FakeResponse()

    monkeypatch.setattr("app.services.speech_service.httpx.post", fake_post)

    client = TestClient(app)
    response = client.post(
        "/api/speech/synthesize",
        json={"text": "欢迎来到灵山胜境"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content == b"RIFFaudio"


def test_speech_synthesize_accepts_base64_json(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_TTS_URL", "https://example.com/tts")

    def fake_post(url, **kwargs):
        class FakeResponse:
            headers = {"content-type": "application/json"}
            content = b""

            def raise_for_status(self):
                return None

            def json(self):
                return {"audio": base64.b64encode(b"RIFFjson").decode("ascii")}

        return FakeResponse()

    monkeypatch.setattr("app.services.speech_service.httpx.post", fake_post)

    client = TestClient(app)
    response = client.post("/api/speech/synthesize", json={"text": "测试"})

    assert response.status_code == 200
    assert response.content == b"RIFFjson"


def test_speech_recognize_supports_websocket(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_WORKSPACE_ID", "ws-test")
    monkeypatch.setenv("BAILIAN_ASR_URL", "wss://ws-test.example.com/api-ws/v1/inference")

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.messages = [
                '{"header":{"event":"task-started"}}',
                '{"header":{"event":"result-generated"},"payload":{"output":{"text":"灵山大佛"}}}',
                '{"header":{"event":"result-generated"},"payload":{"output":{"text":"灵山大佛有什么看点"}}}',
                '{"header":{"event":"task-finished"}}',
            ]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def send(self, message):
            self.sent.append(message)

        def recv(self, timeout=None):
            return self.messages.pop(0)

    fake_socket = FakeWebSocket()

    def fake_connect(url, **kwargs):
        assert url == "wss://ws-test.example.com/api-ws/v1/inference"
        assert kwargs["additional_headers"]["Authorization"] == "Bearer test-key"
        assert kwargs["additional_headers"]["X-DashScope-WorkSpace"] == "ws-test"
        return fake_socket

    monkeypatch.setattr("app.services.speech_service.websocket_connect", fake_connect)

    assert SpeechService().recognize(b"RIFFaudio", "wav") == "灵山大佛有什么看点"
    assert any(isinstance(message, bytes) for message in fake_socket.sent)
    start_event = json.loads(str(fake_socket.sent[0]))
    assert start_event["payload"]["input"] == {}


def test_speech_synthesize_supports_websocket(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "test-key")
    monkeypatch.setenv("BAILIAN_TTS_URL", "wss://ws-test.example.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime")
    monkeypatch.setenv("BAILIAN_TTS_RESPONSE_FORMAT", "pcm")

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.messages = [
                '{"type":"session.created"}',
                '{"type":"response.created"}',
                '{"type":"response.audio.delta","delta":"UklGRm9uZQ=="}',
                '{"type":"response.audio.delta","delta":"UklGRnR3bw=="}',
                '{"type":"response.audio.done"}',
                '{"type":"session.finished"}',
            ]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def send(self, message):
            self.sent.append(message)

        def recv(self, timeout=None):
            return self.messages.pop(0)

    fake_socket = FakeWebSocket()

    def fake_connect(url, **kwargs):
        assert url == "wss://ws-test.example.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime"
        assert kwargs["additional_headers"]["Authorization"] == "Bearer test-key"
        return fake_socket

    monkeypatch.setattr("app.services.speech_service.websocket_connect", fake_connect)

    audio = SpeechService().synthesize("欢迎来到灵山")
    assert audio.startswith(b"RIFF")
    assert b"RIFFoneRIFFtwo" in audio
    assert any('"type": "session.finish"' in message for message in fake_socket.sent)
