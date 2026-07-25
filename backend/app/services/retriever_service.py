from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.config import ChatConfig, get_chat_config
from app.services.knowledge_service import KnowledgeBase, is_scenic_question


@dataclass(frozen=True)
class RetrievalResult:
    sources: list[dict[str, str | int | float]]
    confidence: float
    reliable: bool


class RetrieverService:
    def __init__(
        self,
        knowledge_base: KnowledgeBase,
        config: ChatConfig | None = None,
    ):
        self._knowledge_base = knowledge_base
        self._config = config or get_chat_config()

    def retrieve(self, question: str) -> RetrievalResult:
        sources = self._knowledge_base.search(question, limit=self._config.top_k)
        confidence = _calculate_confidence(sources)
        has_scenic_context = _has_scenic_context(question)
        requires_live_data = _requires_live_data(question)
        reliable = (
            confidence >= self._config.reliability_threshold
            and has_scenic_context
            and not requires_live_data
        )
        reliable_sources = _with_confidence_scores(sources) if reliable else []
        return RetrievalResult(
            sources=reliable_sources,
            confidence=confidence if reliable else 0.0,
            reliable=reliable,
        )


def _calculate_confidence(sources: list[dict[str, str | int]]) -> float:
    if not sources:
        return 0.0

    best_score = float(sources[0].get("score", 0))
    return round(min(best_score / 100.0, 0.98), 2)


def _requires_live_data(question: str) -> bool:
    """Return whether the request needs a live operational data source.

    The bundled knowledge base contains static material only.  A textual
    match therefore cannot make a request about the current state of the
    scenic area reliable.
    """
    live_data_markers = (
        "今天",
        "现在",
        "当前",
        "实时",
        "临时",
        "停运",
        "排队",
        "客流",
        "空位",
        "余位",
        "天气",
    )
    return any(marker in question for marker in live_data_markers)


def _has_scenic_context(question: str) -> bool:
    """Return whether a question is explicitly framed as a scenic-area query.

    Retrieval runs against a scenic-area-only corpus.  Without one of these
    anchors, a lexical match is not evidence that the corpus can answer the
    user's question.
    """
    if re.search(r"[A-Za-z]\d|\d[A-Za-z]", question):
        # Knowledge-base document identifiers are valid explicit lookups even
        # when their text does not include a scenic-area name.
        return True

    return is_scenic_question(question)


def _with_confidence_scores(
    sources: list[dict[str, str | int]],
) -> list[dict[str, str | int | float]]:
    return [
        {
            **source,
            "confidence": round(min(float(source.get("score", 0)) / 100.0, 0.98), 2),
        }
        for source in sources
    ]
