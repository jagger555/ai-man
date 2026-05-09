from __future__ import annotations

from dataclasses import dataclass

from app.core.config import ChatConfig, get_chat_config
from app.services.knowledge_service import KnowledgeBase


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
        reliable = confidence >= self._config.reliability_threshold
        reliable_sources = _with_confidence_scores(sources) if reliable else []
        return RetrievalResult(
            sources=reliable_sources,
            confidence=confidence if reliable else min(confidence, 0.49),
            reliable=reliable,
        )


def _calculate_confidence(sources: list[dict[str, str | int]]) -> float:
    if not sources:
        return 0.0

    best_score = float(sources[0].get("score", 0))
    return round(min(best_score / 100.0, 0.98), 2)


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
