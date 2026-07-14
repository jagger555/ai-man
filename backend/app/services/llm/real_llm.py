from __future__ import annotations

import httpx

from app.core.config import LLMConfig
from app.services.llm.base_llm import BaseGuideLLM


class RealGuideLLM(BaseGuideLLM):
    def __init__(self, config: LLMConfig):
        self._config = config
        self.provider = config.provider

    def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        if not self._config.api_key or not self._config.base_url:
            raise RuntimeError("LLM_API_KEY or LLM_BASE_URL is not configured.")

        payload = {
            "model": self._config.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt or "你是一个专业、准确、自然的景区AI数字人导游。",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": self._config.temperature,
            "max_tokens": self._config.max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }

        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                response = httpx.post(
                    f"{self._config.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=self._config.timeout,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except (KeyError, IndexError, TypeError, AttributeError) as exc:
                raise RuntimeError("Unexpected LLM response payload.") from exc
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    import time
                    time.sleep(0.5 * (2 ** attempt))
        raise RuntimeError(f"LLM request failed after 3 attempts: {last_exc}") from last_exc
