from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.main import app
from app.services.knowledge_service import KnowledgeBase


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


def test_public_package_zip_docx_content_is_searchable(tmp_path: Path):
    package_path = tmp_path / "public_scenic_package.zip"
    docx_content = _docx_bytes(
        [
            "灵山胜境位于江苏无锡，是国家5A级旅游景区。",
            "灵山大佛通高88米，是世界最高露天青铜释迦牟尼立像之一。",
        ]
    )
    with ZipFile(package_path, "w") as package:
        package.writestr("示范景区公开资料包/灵山胜境资料.docx", docx_content)

    knowledge_base = KnowledgeBase.from_public_package(package_path)

    results = knowledge_base.search("灵山大佛 高度", limit=1)

    assert len(results) == 1
    assert "88米" in results[0]["text"]
    assert results[0]["source"] == "示范景区公开资料包/灵山胜境资料.docx"


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
        package.writestr("示范景区公开资料包/灵山胜境资料.docx", docx_content)
    monkeypatch.setenv("AI_GUIDE_KNOWLEDGE_PACKAGE", str(package_path))

    client = TestClient(app)
    response = client.get("/api/admin/knowledge/search", params={"query": "灵山大佛 高度"})

    assert response.status_code == 200
    assert "charset=utf-8" in response.headers["content-type"]
    assert response.json()["chunk_count"] == 2
    assert response.json()["results"][0]["source"] == "示范景区公开资料包/灵山胜境资料.docx"


def test_default_sample_knowledge_snapshot_is_searchable(monkeypatch):
    monkeypatch.delenv("AI_GUIDE_KNOWLEDGE_PACKAGE", raising=False)

    client = TestClient(app)
    response = client.get("/api/admin/knowledge/search", params={"query": "灵山大佛 高度"})

    assert response.status_code == 200
    assert response.json()["chunk_count"] > 0
    assert "灵山大佛" in response.json()["results"][0]["text"]
