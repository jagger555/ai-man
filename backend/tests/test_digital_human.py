from fastapi.testclient import TestClient

from app.main import app


def test_digital_human_config_uses_defaults(monkeypatch):
    monkeypatch.delenv("DIGITAL_HUMAN_BASE_URL", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_AVATAR", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_VOICE", raising=False)

    response = TestClient(app).get("/api/digital-human/config")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "enabled": True,
        "base_url": "http://127.0.0.1:8010",
        "avatar": "",
        "voice": "",
    }


def test_digital_human_config_reads_environment(monkeypatch):
    monkeypatch.setenv("DIGITAL_HUMAN_BASE_URL", "http://localhost:19010/")
    monkeypatch.setenv("DIGITAL_HUMAN_AVATAR", "lingshan-guide")
    monkeypatch.setenv("DIGITAL_HUMAN_VOICE", "zh-CN-YunxiaNeural")

    response = TestClient(app).get("/api/digital-human/config")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["base_url"] == "http://localhost:19010"
    assert body["avatar"] == "lingshan-guide"
    assert body["voice"] == "zh-CN-YunxiaNeural"
