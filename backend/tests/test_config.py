from pathlib import Path

from app.core.config import get_database_config


def test_empty_database_path_uses_default(monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", "")

    config = get_database_config()

    assert config.path == (
        Path(__file__).resolve().parents[2] / "data" / "runtime" / "chat_records.db"
    )
