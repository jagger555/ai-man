from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.services.knowledge_service import KnowledgeBase


router = APIRouter(prefix="/api/admin/knowledge", tags=["knowledge"])


@router.get("/search")
def search_knowledge(query: str = Query(..., min_length=1), limit: int = 3):
    knowledge_base = load_knowledge_base()
    return JSONResponse(
        {
            "chunk_count": knowledge_base.chunk_count,
            "results": knowledge_base.search(query, limit=limit),
        },
        media_type="application/json; charset=utf-8",
    )


def load_knowledge_base() -> KnowledgeBase:
    package_path = os.getenv("AI_GUIDE_KNOWLEDGE_PACKAGE")
    if package_path:
        path = Path(package_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Knowledge package not found")
        return KnowledgeBase.from_public_package(path)

    markdown_path = Path(__file__).resolve().parents[3] / "data" / "sample_scenic" / "knowledge.md"
    return KnowledgeBase.from_markdown_file(markdown_path)
