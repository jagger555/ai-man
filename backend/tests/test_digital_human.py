from fastapi.testclient import TestClient

from app.main import app


def test_digital_human_config_uses_defaults(monkeypatch):
    monkeypatch.delenv("DIGITAL_HUMAN_BASE_URL", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_AVATAR", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_VOICE", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_REF_AUDIO", raising=False)
    monkeypatch.delenv("DIGITAL_HUMAN_REF_TEXT", raising=False)
    monkeypatch.setenv("DIGITAL_HUMAN_STATE_PATH", "__missing_state__.json")

    response = TestClient(app).get("/api/digital-human/config")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "enabled": True,
        "base_url": "http://127.0.0.1:8010",
        "avatar": "",
        "voice": "",
        "ref_audio": "",
        "ref_text": "",
    }


def test_digital_human_config_reads_environment(monkeypatch):
    monkeypatch.setenv("DIGITAL_HUMAN_BASE_URL", "http://localhost:19010/")
    monkeypatch.setenv("DIGITAL_HUMAN_AVATAR", "lingshan-guide")
    monkeypatch.setenv("DIGITAL_HUMAN_VOICE", "zh-CN-YunxiaNeural")
    monkeypatch.setenv("DIGITAL_HUMAN_REF_AUDIO", "custom-ref.wav")
    monkeypatch.setenv("DIGITAL_HUMAN_REF_TEXT", "欢迎来到灵山胜境")
    monkeypatch.setenv("DIGITAL_HUMAN_STATE_PATH", "__missing_state__.json")

    response = TestClient(app).get("/api/digital-human/config")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["base_url"] == "http://localhost:19010"
    assert body["avatar"] == "lingshan-guide"
    assert body["voice"] == "zh-CN-YunxiaNeural"
    assert body["ref_audio"] == "custom-ref.wav"
    assert body["ref_text"] == "欢迎来到灵山胜境"


def test_avatar_list_and_select_updates_runtime_config(monkeypatch, tmp_path):
    avatar_dir = tmp_path / "avatars"
    avatar_626 = avatar_dir / "626"
    avatar_626.mkdir(parents=True)
    (avatar_626 / "full_imgs").mkdir()
    (avatar_626 / "face_imgs").mkdir()
    (avatar_626 / "coords.pkl").write_bytes(b"coords")
    (avatar_626 / "full_imgs" / "000001.png").write_bytes(b"full")
    (avatar_626 / "face_imgs" / "000001.png").write_bytes(b"face")
    (avatar_dir / "wav2lip256_avatar1").mkdir()

    monkeypatch.setenv("DIGITAL_HUMAN_AVATAR_DIR", str(avatar_dir))
    monkeypatch.setenv("DIGITAL_HUMAN_STATE_PATH", str(tmp_path / "state.json"))
    monkeypatch.setenv("DIGITAL_HUMAN_BASE_URL", "http://localhost:19010")
    monkeypatch.setenv("DIGITAL_HUMAN_AVATAR", "")

    client = TestClient(app)

    avatars_response = client.get("/api/digital-human/avatars")
    assert avatars_response.status_code == 200
    avatars_body = avatars_response.json()
    assert avatars_body["current_avatar"] == ""
    assert [avatar["avatar_id"] for avatar in avatars_body["avatars"]] == [
        "626",
        "wav2lip256_avatar1",
    ]
    assert avatars_body["avatars"][0]["ready"] is True

    select_response = client.post(
        "/api/digital-human/avatars/select",
        json={"avatar_id": "626"},
    )
    assert select_response.status_code == 200
    assert select_response.json()["selected_avatar"] == "626"

    config_response = client.get("/api/digital-human/config")
    assert config_response.status_code == 200
    assert config_response.json()["avatar"] == "626"
