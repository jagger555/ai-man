from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.knowledge_service import (
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeDocumentStore,
    VALID_KNOWLEDGE_CATEGORIES,
    VALID_KNOWLEDGE_STATUSES,
    load_chunks_from_markdown_file,
    load_chunks_from_public_package,
    parse_knowledge_upload,
)


KnowledgeCategory = Literal[
    "guide_script",
    "history_culture",
    "faq",
    "travel_notice",
    "other",
]
KnowledgeStatus = Literal["active", "draft", "archived"]

router = APIRouter(prefix="/api/admin/knowledge", tags=["knowledge"])

_knowledge_base: KnowledgeBase | None = None
_document_store: KnowledgeDocumentStore | None = None


class KnowledgeDocumentPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: KnowledgeCategory
    content: str = Field(min_length=1, max_length=20000)
    source_name: str | None = Field(default=None, max_length=180)
    status: KnowledgeStatus = "active"


def _reset_knowledge_base_cache() -> None:
    global _knowledge_base, _document_store
    _knowledge_base = None
    _document_store = None


def get_knowledge_document_store() -> KnowledgeDocumentStore:
    global _document_store
    if _document_store is None:
        _document_store = KnowledgeDocumentStore()
    return _document_store


def get_knowledge_base() -> KnowledgeBase:
    global _knowledge_base
    if _knowledge_base is not None:
        return _knowledge_base

    base_chunks = _load_base_chunks()
    managed_documents = get_knowledge_document_store().list_documents(status="active")
    _knowledge_base = KnowledgeBase.from_documents(
        managed_documents,
        base_chunks=base_chunks,
    )
    return _knowledge_base


@router.get("/search")
def search_knowledge(query: str = Query(..., min_length=1), limit: int = 3):
    knowledge_base = get_knowledge_base()
    return JSONResponse(
        {
            "chunk_count": knowledge_base.chunk_count,
            "results": knowledge_base.search(query, limit=limit),
        },
        media_type="application/json; charset=utf-8",
    )


@router.get("/documents")
def list_knowledge_documents(
    keyword: str = "",
    category: str | None = None,
    status: str | None = None,
):
    _validate_filter("category", category, VALID_KNOWLEDGE_CATEGORIES)
    _validate_filter("status", status, VALID_KNOWLEDGE_STATUSES)

    store = get_knowledge_document_store()
    documents = store.list_documents(keyword=keyword, category=category, status=status)
    summary = store.summary()
    summary["managed_searchable_chunk_count"] = len(store.list_chunks(status="active"))
    summary["searchable_chunk_count"] = get_knowledge_base().chunk_count

    return JSONResponse(
        {
            "count": len(documents),
            "documents": [_serialize_document(document) for document in documents],
            "summary": summary,
        },
        media_type="application/json; charset=utf-8",
    )


@router.get("/documents/{document_id}")
def get_knowledge_document(document_id: int):
    document = get_knowledge_document_store().get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Knowledge document not found")

    return JSONResponse(
        _serialize_document(document),
        media_type="application/json; charset=utf-8",
    )


@router.post("/documents")
def create_knowledge_document(payload: KnowledgeDocumentPayload):
    try:
        document = get_knowledge_document_store().create_document(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _reset_knowledge_base_cache()
    return JSONResponse(
        _serialize_document(document),
        status_code=201,
        media_type="application/json; charset=utf-8",
    )


@router.post("/documents/upload")
async def upload_knowledge_document(
    file: UploadFile = File(...),
    category: str = Form(...),
    title: str | None = Form(default=None),
    source_name: str | None = Form(default=None),
    status: str = Form(default="active"),
):
    _validate_filter("category", category, VALID_KNOWLEDGE_CATEGORIES)
    _validate_filter("status", status, VALID_KNOWLEDGE_STATUSES)

    filename = file.filename or "knowledge-upload.txt"
    try:
        content = parse_knowledge_upload(filename, await file.read())
        document = get_knowledge_document_store().create_document(
            title=(title or Path(filename).stem),
            category=category,
            content=content,
            source_name=source_name or filename,
            status=status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _reset_knowledge_base_cache()
    return JSONResponse(
        _serialize_document(document),
        status_code=201,
        media_type="application/json; charset=utf-8",
    )


@router.put("/documents/{document_id}")
def update_knowledge_document(document_id: int, payload: KnowledgeDocumentPayload):
    try:
        document = get_knowledge_document_store().update_document(
            document_id,
            **payload.model_dump(),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Knowledge document not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _reset_knowledge_base_cache()
    return JSONResponse(
        _serialize_document(document),
        media_type="application/json; charset=utf-8",
    )


@router.delete("/documents/{document_id}")
def delete_knowledge_document(document_id: int):
    deleted = get_knowledge_document_store().delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Knowledge document not found")

    _reset_knowledge_base_cache()
    return JSONResponse(
        {"deleted": True, "document_id": document_id},
        media_type="application/json; charset=utf-8",
    )


def _load_base_chunks():
    package_path = os.getenv("AI_GUIDE_KNOWLEDGE_PACKAGE")
    if package_path:
        path = Path(package_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Knowledge package not found")
        return load_chunks_from_public_package(path)

    markdown_path = Path(__file__).resolve().parents[3] / "data" / "sample_scenic" / "knowledge.md"
    return load_chunks_from_markdown_file(markdown_path)


def _serialize_document(document: KnowledgeDocument) -> dict[str, object]:
    return {
        "id": document.id,
        "title": document.title,
        "category": document.category,
        "content": document.content,
        "source_name": document.source_name,
        "status": document.status,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "character_count": document.character_count,
    }


def _validate_filter(name: str, value: str | None, candidates: set[str]) -> None:
    if value is None:
        return
    if value not in candidates:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
