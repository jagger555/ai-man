from __future__ import annotations

import re


def clean_question(question: str) -> str:
    cleaned = re.sub(r"\s+", " ", question).strip()
    cleaned = re.sub(r"[?？]{2,}$", "？", cleaned)
    return cleaned


def build_prompt(
    question: str,
    sources: list[dict[str, str | int | float]],
    history: list[dict[str, object]] | None = None,
) -> str:
    context = "\n\n".join(
        f"[资料{index + 1}]\n{source['text']}"
        for index, source in enumerate(sources)
    )
    history_text = format_history(history or [])
    return (
        "你是灵山胜境景区的 AI 数字人导游。"
        "请只根据给定知识片段生成自然、亲切、准确的导游式回答。"
        "如果资料不足，必须明确说明无法从景区知识库确认。"
        "回答风格要像现场导游，先直接回答，再补充一两句游览价值或背景信息。\n\n"
        f"{history_text}"
        f"用户问题：{question}\n\n"
        f"知识片段：\n{context if context else '无可靠知识片段'}"
    )


def format_history(history: list[dict[str, object]]) -> str:
    if not history:
        return ""

    lines = ["最近对话历史："]
    for item in history:
        lines.append(f"用户：{item['original_question']}")
        lines.append(f"AI：{item['answer']}")

    return "\n".join(lines) + "\n\n"
