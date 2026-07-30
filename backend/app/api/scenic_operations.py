from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.services.crowd_simulation_service import (
    get_crowd_history,
    get_operational_crowd_snapshot,
    update_crowd_simulation,
)
from app.services.scenic_content_service import get_scenic_content, update_scenic_content


router = APIRouter(tags=["scenic-operations"])


class CrowdSimulationPayload(BaseModel):
    action: str = Field(pattern="^(play|pause|reset)$")
    scenario: str | None = Field(default=None, pattern="^(steady|entry_peak|exit_peak)$")


class ScenicContentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=50)
    summary: str | None = Field(default=None, max_length=500)
    helper: str | None = Field(default=None, max_length=120)
    duration: str | None = Field(default=None, max_length=50)
    duration_minutes: int | None = Field(default=None, ge=30, le=720)
    audience: str | None = Field(default=None, max_length=80)
    pace: str | None = Field(default=None, max_length=80)
    stops: list[str] | None = None
    notes: list[str] | None = None
    audience_tags: list[str] | None = None
    interest_tags: list[str] | None = None
    tags: list[str] | None = None
    subtitle: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    map_destination: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    arrival_notice: str | None = Field(default=None, max_length=200)
    valid_from: str | None = Field(default=None, max_length=40)
    valid_until: str | None = Field(default=None, max_length=40)
    schedules: list[dict[str, object]] | None = None
    enabled: bool | None = None
    featured: bool | None = None
    order: int | None = Field(default=None, ge=0, le=999)


@router.get("/api/crowd/history")
def crowd_history():
    return get_crowd_history()


@router.get("/api/admin/crowd/simulation")
def crowd_simulation_status():
    return get_operational_crowd_snapshot()


@router.post("/api/admin/crowd/simulation")
def control_crowd_simulation(payload: CrowdSimulationPayload):
    return update_crowd_simulation(
        action=payload.action,  # type: ignore[arg-type]
        scenario=payload.scenario,  # type: ignore[arg-type]
    )


@router.get("/api/scenic/content")
def scenic_content():
    return get_scenic_content()


@router.patch("/api/admin/scenic/content/{kind}/{item_id}")
def patch_scenic_content(kind: str, item_id: str, payload: ScenicContentPatch):
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no changes supplied")
    try:
        return update_scenic_content(kind, item_id, changes)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
