# Knowledge Retrieval Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store knowledge documents and searchable chunks in SQLite, then improve retrieval accuracy for digital-human answers with structured chunk metadata, question classification, and stricter low-confidence behavior.

**Architecture:** Keep the public API surface stable: `get_knowledge_base()`, `KnowledgeDocumentStore`, and `KnowledgeBase.search()` remain the main integration points. Replace JSON document persistence with SQLite-backed document and chunk tables, rebuild chunks whenever managed documents change, and keep the default Markdown/package knowledge as in-memory base chunks. Use deterministic keyword/entity/category scoring first; leave vector search out of scope.

**Tech Stack:** FastAPI, Python stdlib `sqlite3`, pytest, jieba, existing mock LLM and TestClient tests.

## Global Constraints

- Do not introduce Chroma, FAISS, Qdrant, Milvus, embedding models, or new runtime services.
- Preserve existing admin knowledge APIs and chat API response shapes.
- Preserve `AI_GUIDE_KNOWLEDGE_PACKAGE` support for zip/docx public packages.
- Preserve `KNOWLEDGE_DOCUMENTS_PATH` as a test isolation/backward-compatibility override, even if the file is now a SQLite database.
- Default managed knowledge storage should move to `data/runtime/knowledge.db`.
- Keep `KnowledgeBase.search(query, limit, category=None)` as the retrieval entry point.
- Low-confidence answers must return no sources and should not ask the LLM to invent unsupported details.
- Tests must not depend on external network services.

---

## File Structure

- `backend/app/services/knowledge_service.py`: Owns SQLite document/chunk persistence, chunk building, question classification, entity extraction, scoring, upload parsing, and `KnowledgeBase`.
- `backend/app/api/knowledge.py`: Keeps the admin API stable, resets caches after writes, and reports document/chunk summary values from the SQLite-backed store.
- `backend/app/services/retriever_service.py`: Converts search scores into confidence and filters unreliable sources.
- `backend/app/services/answer_service.py`: Adds an early low-confidence fallback before calling an LLM.
- `backend/tests/test_knowledge.py`: Verifies SQLite persistence, chunk rebuilding, managed document lifecycle, and retrieval accuracy.
- `backend/tests/test_chat.py`: Verifies low-confidence chat does not invoke real LLM generation and still records results.
- `backend/tests/test_accuracy.py`: Keeps standard dataset regression working.

---

### Task 1: SQLite Knowledge Store

**Files:**
- Modify: `backend/app/services/knowledge_service.py`
- Modify: `backend/tests/test_knowledge.py`

**Interfaces:**
- Consumes: Existing `KnowledgeDocument`, `KnowledgeDocumentStore`, `build_chunks_from_documents()`.
- Produces:
  - `KnowledgeDocumentStore(path: str | Path | None = None)`
  - `KnowledgeDocumentStore.list_documents(keyword: str = "", category: str | None = None, status: str | None = None) -> list[KnowledgeDocument]`
  - `KnowledgeDocumentStore.get_document(document_id: int) -> KnowledgeDocument | None`
  - `KnowledgeDocumentStore.create_document(...) -> KnowledgeDocument`
  - `KnowledgeDocumentStore.update_document(document_id: int, ...) -> KnowledgeDocument`
  - `KnowledgeDocumentStore.delete_document(document_id: int) -> bool`
  - `KnowledgeDocumentStore.list_chunks(status: str = "active") -> list[KnowledgeChunk]`
  - `KnowledgeDocumentStore.summary() -> dict[str, int | dict[str, int]]`

- [ ] **Step 1: Write failing SQLite persistence tests**

Add tests to `backend/tests/test_knowledge.py`:

```python
def test_knowledge_document_store_uses_sqlite_and_reloads_chunks(tmp_path):
    database_path = tmp_path / "knowledge.db"
    store = KnowledgeDocumentStore(database_path)

    created = store.create_document(
        title="KBSQL route",
        category="faq",
        content="KBSQL-1030 九龙灌浴广场每天10:30开始喷泉表演。",
        source_name="manual",
        status="active",
    )

    reloaded = KnowledgeDocumentStore(database_path)
    assert reloaded.get_document(created.id).title == "KBSQL route"
    chunks = reloaded.list_chunks()
    assert chunks
    assert chunks[0].document_id == created.id
    assert "KBSQL-1030" in chunks[0].text
    assert database_path.read_bytes()[:16].startswith(b"SQLite format")
```

Also update existing tests that instantiate only through API to import `KnowledgeDocumentStore`.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py::test_knowledge_document_store_uses_sqlite_and_reloads_chunks -q
```

Expected: FAIL because `KnowledgeDocumentStore` still reads/writes JSON and has no `list_chunks()`.

- [ ] **Step 3: Implement SQLite schema and document CRUD**

In `backend/app/services/knowledge_service.py`, replace JSON payload read/write internals with `sqlite3`:

```python
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
```

Add private helpers:

```python
def _connect(self) -> sqlite3.Connection:
    self._path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(self._path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    self._ensure_schema(connection)
    return connection
```

Implement `_ensure_schema()`, `_row_to_document()`, and `_replace_document_chunks(connection, document)` so create/update write both document and chunks in one transaction.

- [ ] **Step 4: Preserve path behavior**

Update `_default_documents_path()` so default storage is `data/runtime/knowledge.db`, while `KNOWLEDGE_DOCUMENTS_PATH` still overrides the path:

```python
def _default_documents_path() -> Path:
    default_path = (
        Path(__file__).resolve().parents[3]
        / "data"
        / "runtime"
        / "knowledge.db"
    )
    return Path(os.getenv("KNOWLEDGE_DOCUMENTS_PATH", os.getenv("KNOWLEDGE_DATABASE_PATH", str(default_path))))
```

- [ ] **Step 5: Run knowledge tests**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py -q
```

Expected: all tests in `test_knowledge.py` PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add backend/app/services/knowledge_service.py backend/tests/test_knowledge.py
git commit -m "feat: persist knowledge documents in sqlite"
```

---

### Task 2: Chunk Metadata and Retrieval Ranking

**Files:**
- Modify: `backend/app/services/knowledge_service.py`
- Modify: `backend/tests/test_knowledge.py`

**Interfaces:**
- Consumes: SQLite-backed store from Task 1.
- Produces:
  - `KnowledgeChunk` with `chunk_type`, `entities`, `keywords`, `question_categories`.
  - `build_chunks_from_documents(documents: list[KnowledgeDocument]) -> list[KnowledgeChunk]`
  - `KnowledgeBase.from_documents(...)` continues to accept active managed docs.
  - `KnowledgeBase.search(...)` returns existing fields plus metadata fields without removing existing fields.

- [ ] **Step 1: Write failing ranking tests**

Add tests to `backend/tests/test_knowledge.py`:

```python
def test_search_prefers_schedule_chunk_over_route_chunk_for_time_question(tmp_path):
    route = KnowledgeDocument(
        id=1,
        title="路线",
        category="guide_script",
        content="九龙灌浴路线适合亲子游客，游览顺序为入口、广场、佛手广场。",
        source_name="route",
        status="active",
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )
    schedule = KnowledgeDocument(
        id=2,
        title="演出时间",
        category="faq",
        content="九龙灌浴广场每天10:30开始喷泉表演，恶劣天气可能临时调整。",
        source_name="schedule",
        status="active",
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )

    knowledge_base = KnowledgeBase.from_documents([route, schedule])
    results = knowledge_base.search("九龙灌浴几点开始表演", limit=2)

    assert results[0]["document_id"] == 2
    assert results[0]["chunk_type"] in {"schedule", "faq", "fact"}
    assert "schedule" in results[0]["question_categories"]
```

```python
def test_search_prefers_route_chunk_for_route_question(tmp_path):
    route = KnowledgeDocument(
        id=1,
        title="亲子路线",
        category="guide_script",
        content="路线名称：亲子休闲游\n游览顺序：入口、九龙灌浴、佛手广场\n适用人群：亲子游客。",
        source_name="route",
        status="active",
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )
    fact = KnowledgeDocument(
        id=2,
        title="九龙灌浴介绍",
        category="history_culture",
        content="九龙灌浴体现佛教文化典故，是景区重要文化景观。",
        source_name="culture",
        status="active",
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )

    knowledge_base = KnowledgeBase.from_documents([route, fact])
    results = knowledge_base.search("带孩子怎么玩九龙灌浴路线", limit=2)

    assert results[0]["document_id"] == 1
    assert "route" in results[0]["question_categories"]
```

- [ ] **Step 2: Run the new ranking tests and verify they fail**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py::test_search_prefers_schedule_chunk_over_route_chunk_for_time_question tests/test_knowledge.py::test_search_prefers_route_chunk_for_route_question -q
```

Expected: FAIL because chunk metadata is not returned and category ranking is incomplete.

- [ ] **Step 3: Extend `KnowledgeChunk` metadata**

Update the dataclass:

```python
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
```

Ensure all chunk construction sites pass metadata or rely on defaults.

- [ ] **Step 4: Add metadata extraction helpers**

Add helpers:

```python
def _infer_chunk_type(text: str, category: str | None = None) -> str:
    if _looks_like_route_text(text) or "路线" in text or category == "guide_script":
        return "route"
    if any(term in text for term in ("几点", "时间", "开放", "开始", "表演")):
        return "schedule"
    if any(term in text for term in ("门票", "票价", "优惠")):
        return "ticket"
    if category == "faq":
        return "faq"
    if category == "history_culture":
        return "history"
    return "fact"
```

```python
def _infer_question_categories(text: str, chunk_type: str) -> tuple[str, ...]:
    categories = set()
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
    return tuple(sorted(categories or {"general"}))
```

Use existing `_extract_scenic_terms()` and `_query_terms()` to populate `entities` and `keywords`.

- [ ] **Step 5: Update scoring and returned payload**

Update `KnowledgeBase.search()` result items to include:

```python
"chunk_type": chunk.chunk_type,
"entities": list(chunk.entities),
"keywords": list(chunk.keywords),
"question_categories": list(chunk.question_categories),
```

Update `_score()` to add:

- `+90` if detected query category is in `chunk.question_categories`.
- `+45` for each entity overlap between query text and `chunk.entities`.
- `-120` when a non-route query hits a route chunk.
- `+80` for route queries hitting route chunks.

- [ ] **Step 6: Run ranking and knowledge tests**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add backend/app/services/knowledge_service.py backend/tests/test_knowledge.py
git commit -m "feat: rank knowledge chunks by metadata"
```

---

### Task 3: API Summary and Managed Chunk Rebuild

**Files:**
- Modify: `backend/app/api/knowledge.py`
- Modify: `backend/tests/test_knowledge.py`

**Interfaces:**
- Consumes: `KnowledgeDocumentStore.list_chunks()` from Task 1 and metadata from Task 2.
- Produces: Existing `/api/admin/knowledge/documents` response with accurate `managed_searchable_chunk_count` and `searchable_chunk_count`.

- [ ] **Step 1: Write failing API summary test**

Add to `backend/tests/test_knowledge.py`:

```python
def test_admin_summary_reports_sqlite_chunk_count(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge.db"))
    _reset_knowledge_base_cache()

    client = TestClient(app)
    create_response = client.post(
        "/api/admin/knowledge/documents",
        json={
            "title": "KBSUM schedule",
            "category": "faq",
            "content": "KBSUM-1030 九龙灌浴每天10:30开始表演。",
            "source_name": "manual",
            "status": "active",
        },
    )
    assert create_response.status_code == 201

    response = client.get("/api/admin/knowledge/documents")
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["total_documents"] == 1
    assert summary["managed_searchable_chunk_count"] >= 1
    assert summary["searchable_chunk_count"] >= summary["managed_searchable_chunk_count"]
```

- [ ] **Step 2: Run the summary test and verify it fails if API still recomputes from documents only**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py::test_admin_summary_reports_sqlite_chunk_count -q
```

Expected before implementation: FAIL or pass for the wrong reason; after implementation it must use persisted chunk count.

- [ ] **Step 3: Update API summary**

In `backend/app/api/knowledge.py`, replace:

```python
active_documents = store.list_documents(status="active")
summary["managed_searchable_chunk_count"] = len(
    build_chunks_from_documents(active_documents)
)
```

with:

```python
summary["managed_searchable_chunk_count"] = len(store.list_chunks(status="active"))
```

Remove the unused `build_chunks_from_documents` import if no longer used.

- [ ] **Step 4: Run knowledge API tests**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add backend/app/api/knowledge.py backend/tests/test_knowledge.py
git commit -m "feat: report persisted knowledge chunk counts"
```

---

### Task 4: Low-Confidence Answer Guard

**Files:**
- Modify: `backend/app/services/answer_service.py`
- Modify: `backend/tests/test_chat.py`

**Interfaces:**
- Consumes: `RetrieverService.retrieve()` result with `reliable` and `sources`.
- Produces: Chat responses that skip LLM generation when retrieval is unreliable, while still persisting records.

- [ ] **Step 1: Write failing low-confidence test**

Add to `backend/tests/test_chat.py`:

```python
def test_unreliable_retrieval_skips_real_llm_generation(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.com/v1")

    def fail_post(*args, **kwargs):
        raise AssertionError("real LLM should not be called for unreliable retrieval")

    monkeypatch.setattr("app.services.llm.real_llm.httpx.post", fail_post)

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "session_id": "low-confidence-session",
            "question": "今天股票市场怎么走？",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reliable"] is False
    assert body["sources"] == []
    assert body["model_provider"] == "retrieval_guard"
    assert body["model_status"] == "low_confidence_no_llm"
    assert body["record_status"] == "saved"
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
cd backend
python -m pytest tests/test_chat.py::test_unreliable_retrieval_skips_real_llm_generation -q
```

Expected: FAIL because `AnswerService` currently calls `_generate_answer()` even when retrieval is unreliable.

- [ ] **Step 3: Add deterministic fallback answer**

In `backend/app/services/answer_service.py`, add:

```python
LOW_CONFIDENCE_ANSWER = (
    "当前景区知识库中暂未提供足够可靠的信息。"
    "建议换一个与景区历史、景点特色、游览路线、开放时间或票务服务相关的问题。"
)
```

Then in `answer()`, after building the prompt and before `_generate_answer(prompt)`:

```python
if not retrieval.reliable:
    answer = LOW_CONFIDENCE_ANSWER
    model_provider = "retrieval_guard"
    model_status = "low_confidence_no_llm"
else:
    answer, model_provider, model_status = self._generate_answer(prompt)
```

- [ ] **Step 4: Run chat tests**

Run:

```powershell
cd backend
python -m pytest tests/test_chat.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add backend/app/services/answer_service.py backend/tests/test_chat.py
git commit -m "feat: guard low confidence answers"
```

---

### Task 5: Accuracy Regression and Final Verification

**Files:**
- Modify only if tests expose a real gap:
  - `backend/app/services/knowledge_service.py`
  - `backend/app/services/retriever_service.py`
  - `backend/tests/test_accuracy.py`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: Passing knowledge, chat, and accuracy test suite without new services.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
cd backend
python -m pytest tests/test_knowledge.py tests/test_chat.py tests/test_accuracy.py -q
```

Expected: PASS. If `test_accuracy.py` fails because retrieval is too strict, adjust scoring thresholds in `knowledge_service.py` or confidence calculation in `retriever_service.py`, then rerun the same command.

- [ ] **Step 2: Run full backend tests**

Run:

```powershell
cd backend
python -m pytest -q
```

Expected: PASS. If unrelated speech tests fail because of existing uncommitted speech changes in the current workspace, report that separately and rerun the focused tests to verify this feature.

- [ ] **Step 3: Inspect git diff**

Run:

```powershell
git diff --stat
git diff -- backend/app/services/knowledge_service.py backend/app/api/knowledge.py backend/app/services/answer_service.py backend/app/services/retriever_service.py backend/tests/test_knowledge.py backend/tests/test_chat.py backend/tests/test_accuracy.py
```

Expected: Diff only contains retrieval accuracy and knowledge storage work.

- [ ] **Step 4: Commit any final adjustment**

If Step 1 or Step 2 required fixes:

```powershell
git add backend/app/services/knowledge_service.py backend/app/services/retriever_service.py backend/tests/test_accuracy.py
git commit -m "test: verify knowledge retrieval accuracy"
```

If no fixes were needed, do not create an empty commit.

