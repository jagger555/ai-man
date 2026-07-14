from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.services.chat_record_service import ChatRecordService


router = APIRouter(prefix="/api/admin", tags=["chat-records"])


@router.get("/chat-records")
def list_chat_records(
    limit: int = Query(default=20, ge=1, le=100),
    session_id: str | None = None,
):
    service = ChatRecordService()
    records = (
        service.list_session_records(session_id=session_id, limit=limit)
        if session_id
        else service.list_recent_records(limit=limit)
    )
    return JSONResponse(
        {
            "count": len(records),
            "total_count": service.count_records(session_id=session_id),
            "records": records,
        },
        media_type="application/json; charset=utf-8",
    )


@router.get("/chat-records/low-confidence")
def list_low_confidence_records(limit: int = Query(default=20, ge=1, le=100)):
    service = ChatRecordService()
    records = service.list_low_confidence_records(limit=limit)
    return JSONResponse(
        {
            "count": len(records),
            "total_count": service.count_low_confidence_records(),
            "records": records,
        },
        media_type="application/json; charset=utf-8",
    )


@router.get("/overview")
def admin_overview():
    service = ChatRecordService()
    return JSONResponse(
        service.get_overview_metrics(),
        media_type="application/json; charset=utf-8",
    )


@router.get("/dashboard")
def admin_dashboard(
    limit: int = Query(default=8, ge=1, le=50),
    days: int = Query(default=7),
):
    if days not in {1, 7, 30}:
        raise HTTPException(status_code=422, detail="days must be 1, 7, or 30")
    service = ChatRecordService()
    return JSONResponse(
        service.get_dashboard_metrics(limit=limit, days=days),
        media_type="application/json; charset=utf-8",
    )
