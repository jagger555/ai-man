from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.navigation_service import NavigationServiceError, plan_walking_route


router = APIRouter(prefix="/api/navigation", tags=["navigation"])


class Coordinate(BaseModel):
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class WalkingRoutePayload(BaseModel):
    origin: Coordinate
    destination: Coordinate


@router.post("/walking")
async def walking_route(payload: WalkingRoutePayload):
    try:
        return await plan_walking_route(
            (payload.origin.lng, payload.origin.lat),
            (payload.destination.lng, payload.destination.lat),
        )
    except NavigationServiceError as exc:
        status_code = 503 if "not configured" in str(exc) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
