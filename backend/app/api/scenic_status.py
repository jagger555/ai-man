from fastapi import APIRouter

from app.services.scenic_status_service import get_scenic_status


router = APIRouter(prefix="/api/scenic", tags=["scenic-status"])


@router.get("/status")
async def scenic_status():
    return await get_scenic_status()
