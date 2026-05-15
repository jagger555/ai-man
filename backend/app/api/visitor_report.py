from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.services.visitor_report_service import VisitorReportService


router = APIRouter(prefix="/api/admin", tags=["visitor-report"])


@router.get("/visitor-report")
def visitor_report(limit: int = Query(default=200, ge=1, le=1000)):
    report = VisitorReportService().build_report(limit=limit)
    return JSONResponse(
        report,
        media_type="application/json; charset=utf-8",
    )
