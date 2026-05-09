from __future__ import annotations

import re

from app.services.llm.base_llm import BaseGuideLLM


class MockGuideLLM(BaseGuideLLM):
    provider = "mock"

    def generate(self, prompt: str) -> str:
        context = _extract_primary_context(prompt)
        if not context:
            return (
                "当前景区知识库中暂未提供足够可靠的信息。"
                "建议换一个与景区历史、景点特色、游览体验相关的问题。"
            )

        if len(context) > 320:
            context = context[:320].rstrip() + "..."

        return (
            "根据景区知识库，我为你整理到以下导览信息："
            f"{context}"
        )


def _extract_primary_context(prompt: str) -> str:
    match = re.search(
        r"\[资料1\]\s*(.+?)(?:\n\s*\[资料2\]|\Z)",
        prompt,
        re.DOTALL,
    )
    if not match:
        return ""
    return match.group(1).strip()
