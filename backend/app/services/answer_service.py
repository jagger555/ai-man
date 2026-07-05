from __future__ import annotations

import time
from dataclasses import dataclass

from app.core.config import get_chat_config, get_llm_config
from app.services.chat_record_service import ChatRecord, ChatRecordService
from app.services.knowledge_service import KnowledgeBase
from app.services.llm.llm_factory import get_guide_llm
from app.services.llm.mock_llm import MockGuideLLM
from app.services.prompt_service import build_prompt, clean_question
from app.services.retriever_service import RetrieverService

LOW_CONFIDENCE_ANSWER = (
    "当前景区知识库中暂未提供足够可靠的信息。"
    "建议换一个与景区历史、景点特色、游览路线、开放时间或票务服务相关的问题。"
)


@dataclass(frozen=True)
class ChatAnswer:
    session_id: str
    cleaned_question: str
    answer: str
    sources: list[dict[str, str | int | float]]
    confidence: float
    reliable: bool
    prompt: str
    history_turns_used: int
    model_provider: str
    model_status: str
    record_id: int | None
    record_status: str
    latency_ms: int


class AnswerService:
    def __init__(self, knowledge_base: KnowledgeBase):
        self._knowledge_base = knowledge_base
        self._chat_record_service = ChatRecordService()

    def answer(self, session_id: str, question: str) -> ChatAnswer:
        start = time.perf_counter()
        cleaned_question = clean_question(question)
        chat_config = get_chat_config()
        recent_history = list(
            reversed(
                self._chat_record_service.list_session_records(
                    session_id=session_id,
                    limit=chat_config.history_turns,
                )
            )
        )
        retrieval = RetrieverService(self._knowledge_base).retrieve(cleaned_question)
        prompt = build_prompt(cleaned_question, retrieval.sources, recent_history)

        if retrieval.reliable:
            answer, model_provider, model_status = self._generate_answer(prompt)
        else:
            answer = LOW_CONFIDENCE_ANSWER
            model_provider = "retrieval_guard"
            model_status = "low_confidence_no_llm"
        latency_ms = int((time.perf_counter() - start) * 1000)
        record_id, record_status = self._persist_record(
            session_id=session_id,
            original_question=question.strip(),
            cleaned_question=cleaned_question,
            answer=answer,
            prompt=prompt,
            confidence=retrieval.confidence,
            reliable=retrieval.reliable,
            history_turns_used=len(recent_history),
            sources=retrieval.sources,
            model_provider=model_provider,
            model_status=model_status,
            latency_ms=latency_ms,
        )

        return ChatAnswer(
            session_id=session_id,
            cleaned_question=cleaned_question,
            answer=answer,
            sources=retrieval.sources,
            confidence=retrieval.confidence,
            reliable=retrieval.reliable,
            prompt=prompt,
            history_turns_used=len(recent_history),
            model_provider=model_provider,
            model_status=model_status,
            record_id=record_id,
            record_status=record_status,
            latency_ms=latency_ms,
        )

    def _generate_answer(self, prompt: str) -> tuple[str, str, str]:
        llm_config = get_llm_config()
        llm = get_guide_llm(llm_config)

        try:
            return llm.generate(prompt), llm.provider, _success_status(llm.provider)
        except Exception as exc:
            fallback = MockGuideLLM()
            return (
                fallback.generate(prompt),
                fallback.provider,
                f"fallback_to_mock: {exc}",
            )

    def _persist_record(
        self,
        *,
        session_id: str,
        original_question: str,
        cleaned_question: str,
        answer: str,
        prompt: str,
        confidence: float,
        reliable: bool,
        history_turns_used: int,
        sources: list[dict[str, str | int | float]],
        model_provider: str,
        model_status: str,
        latency_ms: int,
    ) -> tuple[int | None, str]:
        try:
            record_id = self._chat_record_service.save_record(
                ChatRecord(
                    session_id=session_id,
                    original_question=original_question,
                    cleaned_question=cleaned_question,
                    answer=answer,
                    prompt_text=prompt,
                    confidence=confidence,
                    reliable=reliable,
                    history_turns_used=history_turns_used,
                    source_count=len(sources),
                    sources=sources,
                    model_provider=model_provider,
                    model_status=model_status,
                    response_time_ms=latency_ms,
                )
            )
            return record_id, "saved"
        except Exception as exc:
            return None, f"save_failed: {exc}"


def _success_status(provider: str) -> str:
    if provider == "mock":
        return "mock_response"
    return "real_llm_success"
