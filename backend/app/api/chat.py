from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.knowledge import get_knowledge_base
from app.services.answer_service import AnswerService


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str = Field(default="default")
    question: str = Field(min_length=1, max_length=500)
    current_location: str = Field(default="未提供", max_length=200)
    visitor_type: str = Field(default="未提供", max_length=100)
    available_time: str = Field(default="未提供", max_length=100)
    route_context: str = Field(default="未提供", max_length=2000)


@router.post("/chat")
def chat(request: ChatRequest):
    service = AnswerService(get_knowledge_base())
    answer = service.answer(
        session_id=request.session_id,
        question=request.question,
        current_location=request.current_location,
        visitor_type=request.visitor_type,
        available_time=request.available_time,
        route_context=request.route_context,
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
            "interaction_type": answer.interaction_type,
            "emoji_value": answer.emoji_value,
        },
        media_type="application/json; charset=utf-8",
    )
