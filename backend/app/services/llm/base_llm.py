from __future__ import annotations

from abc import ABC, abstractmethod


class BaseGuideLLM(ABC):
    provider: str

    @abstractmethod
    def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        raise NotImplementedError
