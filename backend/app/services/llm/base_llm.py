from __future__ import annotations

from abc import ABC, abstractmethod


class BaseGuideLLM(ABC):
    provider: str

    @abstractmethod
    def generate(self, prompt: str) -> str:
        raise NotImplementedError
