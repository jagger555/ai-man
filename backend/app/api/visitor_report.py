from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.services.visitor_report_service import VisitorReportService


router = APIRouter(prefix="/api/admin", tags=["visitor-report"])


@router.get("/visitor-report")
def visitor_report(
    limit: int = Query(default=200, ge=1, le=1000),
    days: int = Query(default=7),
):
    if days not in {1, 7, 30}:
        raise HTTPException(status_code=422, detail="days must be 1, 7, or 30")
    report = VisitorReportService().build_report(limit=limit, days=days)
    return JSONResponse(
        report,
        media_type="application/json; charset=utf-8",
    )
