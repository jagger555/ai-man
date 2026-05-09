from __future__ import annotations

from app.core.config import LLMConfig, get_llm_config
from app.services.llm.base_llm import BaseGuideLLM
from app.services.llm.mock_llm import MockGuideLLM
from app.services.llm.real_llm import RealGuideLLM


REAL_LLM_PROVIDERS = {"openai", "deepseek", "qwen", "zhipu", "real"}


def get_guide_llm(config: LLMConfig | None = None) -> BaseGuideLLM:
    llm_config = config or get_llm_config()

    if llm_config.provider in REAL_LLM_PROVIDERS:
        return RealGuideLLM(llm_config)

    return MockGuideLLM()
