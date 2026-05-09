from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - fallback for partial environments
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv()


@dataclass(frozen=True)
class ChatConfig:
    top_k: int
    reliability_threshold: float
    history_turns: int


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    api_key: str
    base_url: str
    model: str
    timeout: int
    temperature: float
    max_tokens: int


@dataclass(frozen=True)
class DatabaseConfig:
    path: Path


def get_chat_config() -> ChatConfig:
    return ChatConfig(
        top_k=int(os.getenv("CHAT_TOP_K", "3")),
        reliability_threshold=float(os.getenv("CHAT_RELIABILITY_THRESHOLD", "0.5")),
        history_turns=int(os.getenv("CHAT_HISTORY_TURNS", "3")),
    )


def get_llm_config() -> LLMConfig:
    return LLMConfig(
        provider=os.getenv("LLM_PROVIDER", "mock").lower(),
        api_key=os.getenv("LLM_API_KEY", ""),
        base_url=os.getenv("LLM_BASE_URL", "").rstrip("/"),
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        timeout=int(os.getenv("LLM_TIMEOUT", "20")),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.3")),
        max_tokens=int(os.getenv("LLM_MAX_TOKENS", "800")),
    )


def get_database_config() -> DatabaseConfig:
    default_path = (
        Path(__file__).resolve().parents[3] / "data" / "runtime" / "chat_records.db"
    )
    raw_path = os.getenv("DATABASE_PATH", str(default_path))
    return DatabaseConfig(path=Path(raw_path))
