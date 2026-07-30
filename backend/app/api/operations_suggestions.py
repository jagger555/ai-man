from fastapi import APIRouter, HTTPException, Query

from app.services.operations_suggestion_service import OperationsSuggestionService


router = APIRouter(prefix="/api/admin", tags=["operations-suggestions"])


@router.get("/operations-suggestions")
def operations_suggestions(days: int = Query(default=7)):
    if days not in {1, 7, 30}:
        raise HTTPException(status_code=422, detail="days must be 1, 7, or 30")
    return OperationsSuggestionService().build(days=days)
