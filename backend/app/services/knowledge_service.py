from __future__ import annotations

import json
import os
import re
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Literal
from xml.etree import ElementTree
from zipfile import ZipFile

try:
    import jieba
except ImportError:  # pragma: no cover - keeps local tests usable before deps install
    jieba = None


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

DOCUMENTS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

CHUNKS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    text TEXT NOT NULL,
    title TEXT,
    category TEXT,
    chunk_type TEXT NOT NULL DEFAULT 'fact',
    entities_json TEXT NOT NULL DEFAULT '[]',
    keywords_json TEXT NOT NULL DEFAULT '[]',
    question_categories_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
)
"""

BASE_SCENIC_TERMS = {
    "灵山胜境",
    "灵山大照壁",
    "五明桥",
    "佛足坛",
    "五智门",
    "菩提大道",
    "九龙灌浴",
    "降魔浮雕",
    "阿育王柱",
    "百子戏弥勒",
    "祥符禅寺",
    "灵山大佛",
    "佛教文化博览馆",
    "梵宫",
    "灵山梵宫",
    "五印坛城",
    "曼飞龙塔",
    "佛手广场",
    "天下第一掌",
    "抱佛脚",
    "拈花湾",
    "拈花堂",
    "香月花街",
    "五灯湖",
    "鹿鸣谷",
    "吉祥颂",
}

QUERY_CLASSIFIERS = {
    "height": {
        "triggers": {"多高", "高度", "通高", "总高"},
        "evidence": {"通高", "总高", "高度", "米", "m"},
        "boost": 120,
    },
    "route": {
        "triggers": {
            "路线",
            "怎么玩",
            "安排",
            "推荐",
            "玩一天",
            "玩半天",
            "带老人",
            "带小孩",
            "亲子",
            "拍照",
            "半日",
            "一日",
        },
        "evidence": {"路线", "游", "一日", "半日", "适用人群", "游览顺序"},
        "boost": 80,
    },
    "location": {
        "triggers": {"在哪", "在哪里", "怎么去", "位置", "从哪里", "入口"},
        "evidence": {"位于", "位置", "入口", "具体位置", "坐落于"},
        "boost": 60,
    },
    "ticket": {
        "triggers": {"门票", "多少钱", "票价", "价格", "优惠"},
        "evidence": {"票价", "门票", "元", "价格", "免票", "半价票"},
        "boost": 60,
    },
    "schedule": {
        "triggers": {"几点", "时间", "开放", "什么时候", "开始", "结束", "表演"},
        "evidence": {"时间", "开放", "开始", "结束", "演出", "表演"},
        "boost": 60,
    },
    "recommend": {
        "triggers": {"好玩", "特色", "必看", "亮点", "值得看"},
        "evidence": {"亮点", "特色", "推荐", "最佳体验", "游玩亮点"},
        "boost": 60,
    },
    "culture": {
        "triggers": {"历史", "渊源", "寓意", "含义", "意义", "象征", "文化"},
        "evidence": {"历史", "渊源", "寓意", "象征", "代表", "文化内涵", "佛教意义"},
        "boost": 70,
    },
}

_SCENIC_TERMS: set[str] = set(BASE_SCENIC_TERMS)
_JIEBA_LOADED_TERMS: set[str] = set()
SCENIC_CONTEXT_MARKERS = {
    "景区",
    "景点",
    "游客",
    "游玩",
    "游览",
    "导游",
    "导览",
    "门票",
    "入园",
    "停车",
    "缆车",
    "观光车",
    "摆渡车",
    "卫生间",
    "厕所",
    "演出",
    "表演",
    "路线",
    "怎么走",
}


@dataclass(frozen=True)
class KnowledgeChunk:
    source: str
    text: str
    document_id: int | None = None
    title: str | None = None
    category: str | None = None
    chunk_type: str = "fact"
    entities: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    question_categories: tuple[str, ...] = ()


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
        self._migrate_legacy_json_if_needed()
        clauses: list[str] = []
        values: list[str] = []

        if category:
            clauses.append("category = ?")
            values.append(category)
        if status:
            clauses.append("status = ?")
            values.append(status)
        keyword_lower = keyword.strip().lower()
        if keyword_lower:
            clauses.append(
                "lower(title || ' ' || category || ' ' || source_name || ' ' || content) LIKE ?"
            )
            values.append(f"%{keyword_lower}%")

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT id, title, category, content, source_name, status,
                       created_at, updated_at
                FROM knowledge_documents
                {where_sql}
                ORDER BY updated_at DESC
                """,
                values,
            ).fetchall()
        return [self._row_to_document(row) for row in rows]

    def get_document(self, document_id: int) -> KnowledgeDocument | None:
        self._migrate_legacy_json_if_needed()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, title, category, content, source_name, status,
                       created_at, updated_at
                FROM knowledge_documents
                WHERE id = ?
                """,
                (document_id,),
            ).fetchone()
        return self._row_to_document(row) if row else None

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
            self._migrate_legacy_json_if_needed()
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO knowledge_documents (
                        title, category, content, source_name, status,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        normalized["title"],
                        normalized["category"],
                        normalized["content"],
                        normalized["source_name"],
                        normalized["status"],
                        now,
                        now,
                    ),
                )
                document = KnowledgeDocument(
                    id=int(cursor.lastrowid),
                    title=normalized["title"],
                    category=normalized["category"],
                    content=normalized["content"],
                    source_name=normalized["source_name"],
                    status=normalized["status"],
                    created_at=now,
                    updated_at=now,
                )
                self._replace_document_chunks(connection, document)
                connection.commit()

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
            self._migrate_legacy_json_if_needed()
            with self._connect() as connection:
                existing = connection.execute(
                    """
                    SELECT id, title, category, content, source_name, status,
                           created_at, updated_at
                    FROM knowledge_documents
                    WHERE id = ?
                    """,
                    (document_id,),
                ).fetchone()
                if existing is None:
                    raise KeyError(document_id)

                updated = KnowledgeDocument(
                    id=document_id,
                    title=normalized["title"],
                    category=normalized["category"],
                    content=normalized["content"],
                    source_name=normalized["source_name"],
                    status=normalized["status"],
                    created_at=str(existing["created_at"]),
                    updated_at=_now_iso(),
                )
                connection.execute(
                    """
                    UPDATE knowledge_documents
                    SET title = ?, category = ?, content = ?, source_name = ?,
                        status = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        updated.title,
                        updated.category,
                        updated.content,
                        updated.source_name,
                        updated.status,
                        updated.updated_at,
                        updated.id,
                    ),
                )
                self._replace_document_chunks(connection, updated)
                connection.commit()
                return updated

    def delete_document(self, document_id: int) -> bool:
        with self._lock:
            self._migrate_legacy_json_if_needed()
            with self._connect() as connection:
                cursor = connection.execute(
                    "DELETE FROM knowledge_documents WHERE id = ?",
                    (document_id,),
                )
                deleted = cursor.rowcount > 0
                connection.commit()
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

    def list_chunks(self, *, status: str = "active") -> list[KnowledgeChunk]:
        self._migrate_legacy_json_if_needed()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT source, text, document_id, title, category, chunk_type,
                       entities_json, keywords_json, question_categories_json
                FROM knowledge_chunks
                WHERE status = ?
                ORDER BY id ASC
                """,
                (status,),
            ).fetchall()

        return [
            KnowledgeChunk(
                source=str(row["source"]),
                text=str(row["text"]),
                document_id=int(row["document_id"]),
                title=str(row["title"]) if row["title"] is not None else None,
                category=str(row["category"]) if row["category"] is not None else None,
                chunk_type=str(row["chunk_type"]),
                entities=tuple(json.loads(str(row["entities_json"]))),
                keywords=tuple(json.loads(str(row["keywords_json"]))),
                question_categories=tuple(
                    json.loads(str(row["question_categories_json"]))
                ),
            )
            for row in rows
        ]

    def _load_documents(self) -> list[KnowledgeDocument]:
        return self.list_documents()

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        self._ensure_schema(connection)
        return connection

    def _ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(DOCUMENTS_SCHEMA_SQL)
        connection.execute(CHUNKS_SCHEMA_SQL)
        connection.commit()

    def _replace_document_chunks(
        self,
        connection: sqlite3.Connection,
        document: KnowledgeDocument,
    ) -> None:
        connection.execute(
            "DELETE FROM knowledge_chunks WHERE document_id = ?",
            (document.id,),
        )
        if document.status != "active":
            return

        now = _now_iso()
        for chunk in build_chunks_from_documents([document]):
            connection.execute(
                """
                INSERT INTO knowledge_chunks (
                    document_id, source, text, title, category, chunk_type,
                    entities_json, keywords_json, question_categories_json,
                    status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document.id,
                    chunk.source,
                    chunk.text,
                    chunk.title,
                    chunk.category,
                    chunk.chunk_type,
                    json.dumps(list(chunk.entities), ensure_ascii=False),
                    json.dumps(list(chunk.keywords), ensure_ascii=False),
                    json.dumps(list(chunk.question_categories), ensure_ascii=False),
                    document.status,
                    now,
                    now,
                ),
            )

    def _row_to_document(self, row: sqlite3.Row) -> KnowledgeDocument:
        return KnowledgeDocument(
            id=int(row["id"]),
            title=str(row["title"]),
            category=str(row["category"]),
            content=str(row["content"]),
            source_name=str(row["source_name"]),
            status=str(row["status"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def _migrate_legacy_json_if_needed(self) -> None:
        if not self._path.exists():
            return
        try:
            with self._connect() as connection:
                connection.execute("SELECT 1 FROM knowledge_documents LIMIT 1")
            return
        except sqlite3.DatabaseError:
            pass

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        records = payload.get("documents")
        if not isinstance(records, list):
            return

        legacy_path = self._path.with_suffix(self._path.suffix + ".legacy-json")
        self._path.replace(legacy_path)
        with self._connect() as connection:
            for record in records:
                document = KnowledgeDocument(
                    id=int(record["id"]),
                    title=str(record["title"]),
                    category=str(record["category"]),
                    content=str(record["content"]),
                    source_name=str(record["source_name"]),
                    status=str(record["status"]),
                    created_at=str(record["created_at"]),
                    updated_at=str(record["updated_at"]),
                )
                connection.execute(
                    """
                    INSERT INTO knowledge_documents (
                        id, title, category, content, source_name, status,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        document.id,
                        document.title,
                        document.category,
                        document.content,
                        document.source_name,
                        document.status,
                        document.created_at,
                        document.updated_at,
                    ),
                )
                self._replace_document_chunks(connection, document)
            connection.commit()


class KnowledgeBase:
    def __init__(self, chunks: list[KnowledgeChunk]):
        self._chunks = chunks
        _load_scenic_dict(chunks)

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

    def search(
        self,
        query: str,
        limit: int = 3,
        category: str | None = None,
    ) -> list[dict[str, str | int | None]]:
        terms = _query_terms(query)
        _, detected_category = _classify_query(query)
        category = category or detected_category
        scored: list[tuple[int, KnowledgeChunk]] = []

        for chunk in self._chunks:
            score = _score(chunk, terms, query, category=category)
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
                "chunk_type": chunk.chunk_type,
                "entities": list(chunk.entities),
                "keywords": list(chunk.keywords),
                "question_categories": list(chunk.question_categories),
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


def load_chunks_from_markdown_file(
    markdown_path: str | Path,
    *,
    include_sliding_windows: bool = True,
) -> list[KnowledgeChunk]:
    path = Path(markdown_path)
    if not path.exists():
        return []
    return _build_chunks(
        source=str(path),
        text=path.read_text(encoding="utf-8"),
        include_sliding_windows=include_sliding_windows,
    )


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
    include_sliding_windows: bool = True,
) -> list[KnowledgeChunk]:
    paragraphs = _split_paragraphs(text)
    chunks = [
        _make_chunk(
            source=source,
            text=paragraph,
            document_id=document_id,
            title=title,
            category=category,
        )
        for paragraph in paragraphs
    ]
    if include_sliding_windows:
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


def _make_chunk(
    *,
    source: str,
    text: str,
    document_id: int | None = None,
    title: str | None = None,
    category: str | None = None,
) -> KnowledgeChunk:
    chunk_type = _infer_chunk_type(text, category)
    entities = tuple(sorted(_extract_scenic_terms(" ".join([title or "", text]))))
    keywords = tuple(sorted(_query_terms(text)))
    question_categories = _infer_question_categories(text, chunk_type)
    return KnowledgeChunk(
        source=source,
        text=text,
        document_id=document_id,
        title=title,
        category=category,
        chunk_type=chunk_type,
        entities=entities,
        keywords=keywords,
        question_categories=question_categories,
    )


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
        _make_chunk(
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
        / "knowledge.db"
    )
    return Path(
        os.getenv(
            "KNOWLEDGE_DOCUMENTS_PATH",
            os.getenv("KNOWLEDGE_DATABASE_PATH", str(default_path)),
        )
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _query_terms(query: str) -> set[str]:
    normalized_query = query.lower().strip()
    if not normalized_query:
        return set()
    if (
        re.fullmatch(r"[a-z0-9_\-\s]+", normalized_query)
        and re.search(r"[a-z]", normalized_query)
        and re.search(r"\d", normalized_query)
    ):
        return {re.sub(r"\s+", "", normalized_query)}
    raw_alnum_tokens = re.findall(r"[A-Za-z0-9_]+", normalized_query)
    if raw_alnum_tokens and any(
        re.search(r"[a-z]", token) and re.search(r"\d", token)
        for token in raw_alnum_tokens
    ):
        return set(raw_alnum_tokens)
    words = {
        word.strip()
        for word in _cut_query(normalized_query)
        if word.strip() and not word.isspace()
    }
    words.update(raw_alnum_tokens)
    # Single CJK characters such as "天" and "写" occur in many unrelated
    # documents. Including them turns incidental character overlap into a
    # high-confidence retrieval result for out-of-domain questions.
    return {word for word in words if len(word) > 1 or word.isascii()}


def is_scenic_question(question: str) -> bool:
    """Return whether a question is explicitly framed around the scenic area."""
    normalized_question = question.lower()
    return any(
        marker in normalized_question for marker in SCENIC_CONTEXT_MARKERS
    ) or any(
        len(term) >= 2 and term.lower() in normalized_question
        for term in _SCENIC_TERMS
    )


def _score(
    chunk: KnowledgeChunk,
    terms: set[str],
    query: str,
    *,
    category: str | None = None,
) -> int:
    text = chunk.text
    lowered = text.lower()
    score = sum(lowered.count(term) for term in terms if term)

    if category and category in chunk.question_categories:
        score += 90
    query_entity_matches = {
        entity
        for entity in chunk.entities
        if len(entity) >= 2 and entity in query
    }
    score += 45 * len(query_entity_matches)

    if category:
        score += _category_boost(text, query, category)
    if category is not None and category != "route" and chunk.chunk_type == "route":
        score -= 160
    if category == "route" and chunk.chunk_type == "route":
        score += 80
    if category == "height":
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


def _infer_chunk_type(text: str, category: str | None = None) -> str:
    if _looks_like_route_text(text) or "路线" in text or category == "guide_script":
        return "route"
    if any(term in text for term in ("几点", "时间", "开放", "开始", "结束", "演出", "表演")):
        return "schedule"
    if any(term in text for term in ("门票", "票价", "价格", "优惠", "免票", "半价")):
        return "ticket"
    if category == "faq":
        return "faq"
    if category == "history_culture":
        return "history"
    return "fact"


def _infer_question_categories(text: str, chunk_type: str) -> tuple[str, ...]:
    categories: set[str] = set()
    for name, config in QUERY_CLASSIFIERS.items():
        evidence = config["evidence"]
        if any(term in text for term in evidence):
            categories.add(name)
    if chunk_type == "route":
        categories.add("route")
    if chunk_type == "schedule":
        categories.add("schedule")
    if chunk_type == "ticket":
        categories.add("ticket")
    if chunk_type == "history":
        categories.add("culture")
    return tuple(sorted(categories or {"general"}))


def _classify_query(question: str) -> tuple[str, str | None]:
    normalized_question = question.lower()
    terms = _query_terms(normalized_question)
    for category, config in QUERY_CLASSIFIERS.items():
        triggers = config["triggers"]
        if any(trigger in normalized_question for trigger in triggers):
            return "rule", category
        if terms & triggers:
            return "rule", category
    return "llm", None


def _category_boost(text: str, query: str, category: str) -> int:
    config = QUERY_CLASSIFIERS.get(category)
    if not config:
        return 0

    evidence_terms = config["evidence"]
    boost = int(config["boost"])
    score = 0
    if any(term in text for term in evidence_terms):
        score += boost
    if category == "route" and (
        "路线" in text or "游览顺序" in text or "适用人群" in text
    ):
        score += 40
    for entity in _SCENIC_TERMS:
        if len(entity) >= 2 and entity in query and entity in text:
            score += 40
    return score


def _looks_like_route_text(text: str) -> bool:
    return any(
        term in text
        for term in (
            "路线名称：",
            "路线规划：",
            "游览顺序：",
            "适用人群：",
            "预计用时：",
            "讲解重点：",
        )
    )


def _load_scenic_dict(chunks: list[KnowledgeChunk]) -> None:
    candidates = set(BASE_SCENIC_TERMS)
    for chunk in chunks:
        if chunk.title:
            candidates.add(chunk.title)
        candidates.update(_extract_scenic_terms(chunk.text))

    useful_terms = {
        term
        for term in candidates
        if 2 <= len(term) <= 12 and re.search(r"[\u4e00-\u9fff]", term)
    }
    _SCENIC_TERMS.update(useful_terms)
    _register_jieba_words(useful_terms)


def _extract_scenic_terms(text: str) -> set[str]:
    terms: set[str] = set()
    for match in re.finditer(r"[\u4e00-\u9fff]{2,12}", text):
        phrase = match.group(0)
        for length in range(2, min(6, len(phrase)) + 1):
            for start in range(0, len(phrase) - length + 1):
                terms.add(phrase[start : start + length])
    return terms


def _register_jieba_words(terms: set[str]) -> None:
    if jieba is None:
        return
    for term in terms - _JIEBA_LOADED_TERMS:
        jieba.add_word(term)
    _JIEBA_LOADED_TERMS.update(terms)


def _cut_query(query: str) -> list[str]:
    if jieba is not None:
        return list(jieba.lcut(query))
    return _fallback_cut_query(query)


def _fallback_cut_query(query: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]+", query)
    result: list[str] = []
    scenic_terms = sorted(_SCENIC_TERMS, key=len, reverse=True)
    for token in tokens:
        if not re.fullmatch(r"[\u4e00-\u9fff]+", token):
            result.append(token)
            continue

        cursor = 0
        while cursor < len(token):
            matched = next(
                (
                    term
                    for term in scenic_terms
                    if token.startswith(term, cursor)
                ),
                None,
            )
            if matched:
                result.append(matched)
                cursor += len(matched)
            else:
                result.append(token[cursor])
                cursor += 1
    return result
