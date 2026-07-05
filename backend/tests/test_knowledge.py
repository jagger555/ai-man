from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.api.knowledge import _reset_knowledge_base_cache
from app.main import app
from app.services.knowledge_service import (
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeDocumentStore,
)


def _docx_bytes(paragraphs: list[str]) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>" for paragraph in paragraphs
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )
    buffer = BytesIO()
    with ZipFile(buffer, "w") as docx:
        docx.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def test_knowledge_document_store_uses_sqlite_and_reloads_chunks(tmp_path: Path):
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
    reloaded_document = reloaded.get_document(created.id)
    assert reloaded_document is not None
    assert reloaded_document.title == "KBSQL route"
    chunks = reloaded.list_chunks()
    assert chunks
    assert chunks[0].document_id == created.id
    assert "KBSQL-1030" in chunks[0].text
    assert database_path.read_bytes()[:16].startswith(b"SQLite format")


def test_search_prefers_schedule_chunk_over_route_chunk_for_time_question():
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


def test_search_prefers_route_chunk_for_route_question():
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


def test_public_package_zip_docx_content_is_searchable(tmp_path: Path):
    package_path = tmp_path / "public_scenic_package.zip"
    docx_content = _docx_bytes(
        [
            "灵山胜境位于江苏无锡，是国家5A级旅游景区。",
            "灵山大佛通高88米，是世界最高露天青铜释迦牟尼立像之一。",
        ]
    )
    with ZipFile(package_path, "w") as package:
        package.writestr("示范景区公开资料/灵山胜境资料.docx", docx_content)

    knowledge_base = KnowledgeBase.from_public_package(package_path)

    results = knowledge_base.search("灵山大佛 高度", limit=1)

    assert len(results) == 1
    assert "88米" in results[0]["text"]
    assert results[0]["source"] == "示范景区公开资料/灵山胜境资料.docx"


def test_knowledge_search_endpoint_uses_configured_public_package(
    tmp_path: Path, monkeypatch
):
    package_path = tmp_path / "public_scenic_package.zip"
    docx_content = _docx_bytes(
        [
            "灵山胜境位于江苏无锡，是国家5A级旅游景区。",
            "灵山大佛通高88米，是世界最高露天青铜释迦牟尼立像之一。",
        ]
    )
    with ZipFile(package_path, "w") as package:
        package.writestr("示范景区公开资料/灵山胜境资料.docx", docx_content)
    monkeypatch.setenv("AI_GUIDE_KNOWLEDGE_PACKAGE", str(package_path))
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge_documents.json"))
    _reset_knowledge_base_cache()

    client = TestClient(app)
    response = client.get("/api/admin/knowledge/search", params={"query": "灵山大佛 高度"})

    assert response.status_code == 200
    assert "charset=utf-8" in response.headers["content-type"]
    assert response.json()["chunk_count"] == 2
    assert response.json()["results"][0]["source"] == "示范景区公开资料/灵山胜境资料.docx"


def test_default_sample_knowledge_snapshot_is_searchable(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge_documents.json"))
    _reset_knowledge_base_cache()

    client = TestClient(app)
    response = client.get("/api/admin/knowledge/search", params={"query": "灵山大佛 高度"})

    assert response.status_code == 200
    assert response.json()["chunk_count"] > 0
    assert "灵山大佛" in response.json()["results"][0]["text"]


def test_admin_can_create_update_and_delete_managed_knowledge_document(
    monkeypatch, tmp_path
):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge_documents.json"))
    _reset_knowledge_base_cache()

    client = TestClient(app)
    create_response = client.post(
        "/api/admin/knowledge/documents",
        json={
            "title": "九龙灌浴讲解词",
            "category": "guide_script",
            "content": "KB-KYL-1030 对应九龙灌浴广场每天10:30开始喷泉表演。\n\n东侧栈道是最佳观赏点。",
            "source_name": "管理员手工录入",
            "status": "active",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["title"] == "九龙灌浴讲解词"
    assert created["category"] == "guide_script"
    assert created["status"] == "active"
    assert created["character_count"] > 0

    list_response = client.get("/api/admin/knowledge/documents")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body["count"] == 1
    assert list_body["summary"]["total_documents"] == 1
    assert list_body["summary"]["active_documents"] == 1
    assert list_body["summary"]["managed_searchable_chunk_count"] >= 2

    search_response = client.get(
        "/api/admin/knowledge/search",
        params={"query": "KB-KYL-1030", "limit": 2},
    )
    assert search_response.status_code == 200
    result = search_response.json()["results"][0]
    assert result["document_id"] == created["id"]
    assert result["title"] == "九龙灌浴讲解词"
    assert result["category"] == "guide_script"

    update_response = client.put(
        f"/api/admin/knowledge/documents/{created['id']}",
        json={
            "title": "九龙灌浴讲解词（已归档）",
            "category": "guide_script",
            "content": "KB-KYL-1030 对应九龙灌浴广场每天10:30开始喷泉表演。",
            "source_name": "管理员手工录入",
            "status": "archived",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "archived"

    archived_search_response = client.get(
        "/api/admin/knowledge/search",
        params={"query": "KB-KYL-1030", "limit": 2},
    )
    assert archived_search_response.status_code == 200
    assert archived_search_response.json()["results"] == []

    delete_response = client.delete(f"/api/admin/knowledge/documents/{created['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    final_list_response = client.get("/api/admin/knowledge/documents")
    assert final_list_response.status_code == 200
    assert final_list_response.json()["count"] == 0


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


def test_uploaded_docx_document_is_used_by_search_and_chat(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "chat_records.db"))
    monkeypatch.setenv("KNOWLEDGE_DOCUMENTS_PATH", str(tmp_path / "knowledge_documents.json"))
    _reset_knowledge_base_cache()

    client = TestClient(app)
    upload_response = client.post(
        "/api/admin/knowledge/documents/upload",
        data={
            "category": "faq",
            "title": "九龙灌浴开放时间答疑",
            "status": "active",
        },
        files={
            "file": (
                "九龙灌浴答疑.docx",
                _docx_bytes(
                    [
                        "KBDOCX1030 灵山大佛通高66米。 " + " ".join(["KBDOCX1030"] * 60),
                        "如果遇到大风暴雨天气，演出时间会临时调整。",
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert upload_response.status_code == 201
    document = upload_response.json()

    search_response = client.get(
        "/api/admin/knowledge/search",
        params={"query": "KBDOCX1030", "limit": 1},
    )
    assert search_response.status_code == 200
    search_result = search_response.json()["results"][0]
    assert search_result["document_id"] == document["id"]
    assert "66米" in search_result["text"]

    chat_response = client.post(
        "/api/chat",
        json={
            "session_id": "knowledge-doc-session",
            "question": "KBDOCX1030",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["reliable"] is True
    assert body["sources"]
    assert body["sources"][0]["document_id"] == document["id"]
    assert "66米" in body["answer"]
