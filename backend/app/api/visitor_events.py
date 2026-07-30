from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.services.visitor_event_service import VisitorEventService


router = APIRouter(tags=["visitor-events"])

VisitorEventType = Literal[
    "page_view",
    "page_dwell",
    "preference_select",
    "route_generate",
    "route_adjust",
    "route_confirm",
    "map_search",
    "navigation_request",
    "navigation_success",
    "navigation_failure",
    "vr_load",
    "performance_view",
    "service_category",
    "chat_question",
    "chat_reliability",
    "feedback",
]


class VisitorEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=8, max_length=100)
    event_type: VisitorEventType
    page: str = Field(default="", max_length=40)
    entity_type: str = Field(default="", max_length=40)
    entity_id: str = Field(default="", max_length=100)
    metadata: dict[str, object] = Field(default_factory=dict)


@router.post("/api/visitor/events", status_code=202)
def record_visitor_event(payload: VisitorEventPayload):
    event_id = VisitorEventService().record_event(
        session_id=payload.session_id,
        event_type=payload.event_type,
        page=payload.page,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        metadata=payload.metadata,
    )
    return {"status": "accepted", "event_id": event_id}


@router.get("/api/admin/visitor-insights")
def visitor_insights(days: int = Query(default=7)):
    if days not in {1, 7, 30}:
        raise HTTPException(status_code=422, detail="days must be 1, 7, or 30")
    return JSONResponse(
        VisitorEventService().build_insights(days=days),
        media_type="application/json; charset=utf-8",
    )
