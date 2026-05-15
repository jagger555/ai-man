from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Literal
from xml.etree import ElementTree
from zipfile import ZipFile


KnowledgeCategory = Literal[
    "guide_script",
    "history_culture",
    "faq",
    "travel_notice",
    "other",
]
KnowledgeStatus = Literal["active", "draft", "archived"]

VALID_KNOWLEDGE_CATEGORIES = {
    "guide_script",
    "history_culture",
    "faq",
    "travel_notice",
    "other",
}
VALID_KNOWLEDGE_STATUSES = {"active", "draft", "archived"}


@dataclass(frozen=True)
class KnowledgeChunk:
    source: str
    text: str
    document_id: int | None = None
    title: str | None = None
    category: str | None = None


@dataclass(frozen=True)
class KnowledgeDocument:
    id: int
    title: str
    category: str
    content: str
    source_name: str
    status: str
    created_at: str
    updated_at: str

    @property
    def character_count(self) -> int:
        return len(self.content.strip())


class KnowledgeDocumentStore:
    def __init__(self, path: str | Path | None = None):
        self._path = Path(path) if path else _default_documents_path()
        self._lock = Lock()

    def list_documents(
        self,
        *,
        keyword: str = "",
        category: str | None = None,
        status: str | None = None,
    ) -> list[KnowledgeDocument]:
        documents = self._load_documents()
        keyword_lower = keyword.strip().lower()
        filtered: list[KnowledgeDocument] = []

        for document in documents:
            if category and document.category != category:
                continue
            if status and document.status != status:
                continue
            if keyword_lower and keyword_lower not in " ".join(
                [
                    document.title,
                    document.category,
                    document.source_name,
                    document.content,
                ]
            ).lower():
                continue
            filtered.append(document)

        return sorted(filtered, key=lambda item: item.updated_at, reverse=True)

    def get_document(self, document_id: int) -> KnowledgeDocument | None:
        return next(
            (document for document in self._load_documents() if document.id == document_id),
            None,
        )

    def create_document(
        self,
        *,
        title: str,
        category: str,
        content: str,
        source_name: str | None = None,
        status: str = "active",
    ) -> KnowledgeDocument:
        normalized = _normalize_document_fields(
            title=title,
            category=category,
            content=content,
            source_name=source_name,
            status=status,
        )
        now = _now_iso()

        with self._lock:
            payload = self._read_payload()
            document = KnowledgeDocument(
                id=int(payload["next_id"]),
                title=normalized["title"],
                category=normalized["category"],
                content=normalized["content"],
                source_name=normalized["source_name"],
                status=normalized["status"],
                created_at=now,
                updated_at=now,
            )
            payload["next_id"] = document.id + 1
            payload["documents"].append(asdict(document))
            self._write_payload(payload)

        return document

    def update_document(
        self,
        document_id: int,
        *,
        title: str,
        category: str,
        content: str,
        source_name: str | None = None,
        status: str = "active",
    ) -> KnowledgeDocument:
        normalized = _normalize_document_fields(
            title=title,
            category=category,
            content=content,
            source_name=source_name,
            status=status,
        )

        with self._lock:
            payload = self._read_payload()
            for index, record in enumerate(payload["documents"]):
                if int(record["id"]) != document_id:
                    continue

                updated = KnowledgeDocument(
                    id=document_id,
                    title=normalized["title"],
                    category=normalized["category"],
                    content=normalized["content"],
                    source_name=normalized["source_name"],
                    status=normalized["status"],
                    created_at=record["created_at"],
                    updated_at=_now_iso(),
                )
                payload["documents"][index] = asdict(updated)
                self._write_payload(payload)
                return updated

        raise KeyError(document_id)

    def delete_document(self, document_id: int) -> bool:
        with self._lock:
            payload = self._read_payload()
            original_count = len(payload["documents"])
            payload["documents"] = [
                record
                for record in payload["documents"]
                if int(record["id"]) != document_id
            ]
            deleted = len(payload["documents"]) != original_count
            if deleted:
                self._write_payload(payload)
            return deleted

    def summary(self) -> dict[str, int | dict[str, int]]:
        documents = self._load_documents()
        by_category = {category: 0 for category in sorted(VALID_KNOWLEDGE_CATEGORIES)}

        for document in documents:
            by_category[document.category] = by_category.get(document.category, 0) + 1

        return {
            "total_documents": len(documents),
            "active_documents": sum(1 for item in documents if item.status == "active"),
            "draft_documents": sum(1 for item in documents if item.status == "draft"),
            "archived_documents": sum(
                1 for item in documents if item.status == "archived"
            ),
            "total_character_count": sum(item.character_count for item in documents),
            "category_counts": by_category,
        }

    def _load_documents(self) -> list[KnowledgeDocument]:
        payload = self._read_payload()
        return [
            KnowledgeDocument(
                id=int(record["id"]),
                title=str(record["title"]),
                category=str(record["category"]),
                content=str(record["content"]),
                source_name=str(record["source_name"]),
                status=str(record["status"]),
                created_at=str(record["created_at"]),
                updated_at=str(record["updated_at"]),
            )
            for record in payload["documents"]
        ]

    def _read_payload(self) -> dict[str, object]:
        if not self._path.exists():
            return {"next_id": 1, "documents": []}

        payload = json.loads(self._path.read_text(encoding="utf-8"))
        if "next_id" not in payload or "documents" not in payload:
            return {"next_id": 1, "documents": []}
        return payload

    def _write_payload(self, payload: dict[str, object]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


class KnowledgeBase:
    def __init__(self, chunks: list[KnowledgeChunk]):
        self._chunks = chunks

    @classmethod
    def from_public_package(cls, package_path: str | Path) -> "KnowledgeBase":
        return cls(load_chunks_from_public_package(package_path))

    @classmethod
    def from_markdown_file(cls, markdown_path: str | Path) -> "KnowledgeBase":
        return cls(load_chunks_from_markdown_file(markdown_path))

    @classmethod
    def from_documents(
        cls,
        documents: list[KnowledgeDocument],
        *,
        base_chunks: list[KnowledgeChunk] | None = None,
    ) -> "KnowledgeBase":
        chunks = list(base_chunks or [])
        chunks.extend(build_chunks_from_documents(documents))
        return cls(chunks)

    def search(self, query: str, limit: int = 3) -> list[dict[str, str | int | None]]:
        terms = _query_terms(query)
        scored: list[tuple[int, KnowledgeChunk]] = []

        for chunk in self._chunks:
            score = _score(chunk.text, terms, query)
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "source": chunk.source,
                "text": chunk.text,
                "score": score,
                "document_id": chunk.document_id,
                "title": chunk.title,
                "category": chunk.category,
            }
            for score, chunk in scored[:limit]
        ]

    @property
    def chunk_count(self) -> int:
        return len(self._chunks)


def load_chunks_from_public_package(package_path: str | Path) -> list[KnowledgeChunk]:
    path = Path(package_path)
    chunks: list[KnowledgeChunk] = []

    with ZipFile(path) as package:
        for entry in package.infolist():
            if entry.is_dir() or not entry.filename.lower().endswith(".docx"):
                continue
            paragraphs = _extract_docx_paragraphs(package.read(entry))
            chunks.extend(_build_chunks(source=entry.filename, text="\n\n".join(paragraphs)))

    return chunks


def load_chunks_from_markdown_file(markdown_path: str | Path) -> list[KnowledgeChunk]:
    path = Path(markdown_path)
    if not path.exists():
        return []
    return _build_chunks(source=str(path), text=path.read_text(encoding="utf-8"))


def build_chunks_from_documents(
    documents: list[KnowledgeDocument],
) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []

    for document in documents:
        if document.status != "active":
            continue
        chunks.extend(
            _build_chunks(
                source=document.source_name,
                text=document.content,
                document_id=document.id,
                title=document.title,
                category=document.category,
            )
        )

    return chunks


def parse_knowledge_upload(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md"}:
        return _decode_text_bytes(content)
    if suffix == ".docx":
        return "\n\n".join(_extract_docx_paragraphs(content))
    raise ValueError("Only .txt, .md, and .docx files are supported")


def _build_chunks(
    *,
    source: str,
    text: str,
    document_id: int | None = None,
    title: str | None = None,
    category: str | None = None,
) -> list[KnowledgeChunk]:
    paragraphs = _split_paragraphs(text)
    chunks = [
        KnowledgeChunk(
            source=source,
            text=paragraph,
            document_id=document_id,
            title=title,
            category=category,
        )
        for paragraph in paragraphs
    ]
    chunks.extend(
        _sliding_window_chunks(
            source=source,
            paragraphs=paragraphs,
            document_id=document_id,
            title=title,
            category=category,
        )
    )
    return chunks


def _split_paragraphs(text: str) -> list[str]:
    paragraphs = [
        part.strip() for part in re.split(r"\n\s*\n", text.strip()) if part.strip()
    ]
    return paragraphs or [text.strip()]


def _extract_docx_paragraphs(docx_bytes: bytes) -> list[str]:
    with ZipFile(BytesIO(docx_bytes)) as docx:
        document_xml = docx.read("word/document.xml")

    root = ElementTree.fromstring(document_xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []

    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(
            node.text or "" for node in paragraph.findall(".//w:t", namespace)
        ).strip()
        if text:
            paragraphs.append(text)

    return paragraphs


def _sliding_window_chunks(
    *,
    source: str,
    paragraphs: list[str],
    document_id: int | None = None,
    title: str | None = None,
    category: str | None = None,
    window_size: int = 5,
) -> list[KnowledgeChunk]:
    if len(paragraphs) < window_size:
        return []

    return [
        KnowledgeChunk(
            source=f"{source}#window-{index + 1}",
            text="\n".join(paragraphs[index : index + window_size]),
            document_id=document_id,
            title=title,
            category=category,
        )
        for index in range(0, len(paragraphs) - window_size + 1)
    ]


def _decode_text_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _normalize_document_fields(
    *,
    title: str,
    category: str,
    content: str,
    source_name: str | None,
    status: str,
) -> dict[str, str]:
    normalized_title = title.strip()
    normalized_content = content.strip()
    normalized_category = category.strip()
    normalized_status = status.strip()
    normalized_source_name = (source_name or normalized_title).strip()

    if not normalized_title:
        raise ValueError("title must not be empty")
    if not normalized_content:
        raise ValueError("content must not be empty")
    if normalized_category not in VALID_KNOWLEDGE_CATEGORIES:
        raise ValueError("invalid category")
    if normalized_status not in VALID_KNOWLEDGE_STATUSES:
        raise ValueError("invalid status")
    if not normalized_source_name:
        raise ValueError("source_name must not be empty")

    return {
        "title": normalized_title,
        "category": normalized_category,
        "content": normalized_content,
        "source_name": normalized_source_name,
        "status": normalized_status,
    }


def _default_documents_path() -> Path:
    default_path = (
        Path(__file__).resolve().parents[3]
        / "data"
        / "runtime"
        / "knowledge_documents.json"
    )
    return Path(os.getenv("KNOWLEDGE_DOCUMENTS_PATH", str(default_path)))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _query_terms(query: str) -> set[str]:
    words = set(re.findall(r"[A-Za-z0-9_\u4e00-\u9fff]+", query.lower()))
    cjk_chars = {char for char in query if "\u4e00" <= char <= "\u9fff"}
    return words | cjk_chars


def _score(text: str, terms: set[str], query: str) -> int:
    lowered = text.lower()
    score = sum(lowered.count(term) for term in terms if term)

    if _is_height_query(query):
        if "通高" in text:
            score += 120
        if "总高" in text:
            score += 80
        if re.search(r"\d+(?:\.\d+)?\s*(?:米|m)", text, re.IGNORECASE):
            score += 30
        for entity in ("灵山大佛", "大佛"):
            if entity in query and entity in text:
                score += 40

    return score


def _is_height_query(query: str) -> bool:
    return any(term in query for term in ("多高", "高度", "通高", "总高"))
