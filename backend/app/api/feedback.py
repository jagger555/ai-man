from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.chat_record_service import ChatRecordService


router = APIRouter(prefix="/api", tags=["feedback"])


class FeedbackRequest(BaseModel):
    record_id: int = Field(ge=1)
    session_id: str = Field(min_length=1)
    rating: Literal["helpful", "unhelpful"]
    feedback_text: str = Field(default="", max_length=500)


@router.post("/feedback")
def submit_feedback(request: FeedbackRequest):
    service = ChatRecordService()
    feedback_id = service.save_feedback(
        record_id=request.record_id,
        session_id=request.session_id,
        rating=request.rating,
        feedback_text=request.feedback_text.strip(),
    )
    return JSONResponse(
        {
            "status": "saved",
            "feedback_id": feedback_id,
            "record_id": request.record_id,
            "rating": request.rating,
        },
        media_type="application/json; charset=utf-8",
    )


admin_router = APIRouter(prefix="/api/admin", tags=["feedback"])


@admin_router.get("/feedback")
def list_feedback(
    limit: int = Query(default=20, ge=1, le=100),
    rating: Literal["helpful", "unhelpful"] | None = None,
):
    service = ChatRecordService()
    records = service.list_feedback(limit=limit, rating=rating)
    return JSONResponse(
        {
            "count": len(records),
            "total_count": service.count_feedback(rating=rating),
            "records": records,
        },
        media_type="application/json; charset=utf-8",
    )
