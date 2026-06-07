import base64

from fastapi.testclient import TestClient

from app.main import app


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
