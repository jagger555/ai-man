from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.knowledge import load_knowledge_base
from app.services.answer_service import AnswerService


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str = Field(default="default")
    question: str = Field(min_length=1)


@router.post("/chat")
def chat(request: ChatRequest):
    service = AnswerService(load_knowledge_base())
    answer = service.answer(
        session_id=request.session_id,
        question=request.question,
    )
    return JSONResponse(
        {
            "session_id": answer.session_id,
            "cleaned_question": answer.cleaned_question,
            "answer": answer.answer,
            "sources": answer.sources,
            "confidence": answer.confidence,
            "reliable": answer.reliable,
            "prompt": answer.prompt,
            "history_turns_used": answer.history_turns_used,
            "model_provider": answer.model_provider,
            "model_status": answer.model_status,
            "record_id": answer.record_id,
            "record_status": answer.record_status,
            "latency_ms": answer.latency_ms,
        },
        media_type="application/json; charset=utf-8",
    )
