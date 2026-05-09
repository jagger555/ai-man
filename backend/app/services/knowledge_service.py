from __future__ import annotations

import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


@dataclass(frozen=True)
class KnowledgeChunk:
    source: str
    text: str


class KnowledgeBase:
    def __init__(self, chunks: list[KnowledgeChunk]):
        self._chunks = chunks

    @classmethod
    def from_public_package(cls, package_path: str | Path) -> "KnowledgeBase":
        path = Path(package_path)
        chunks: list[KnowledgeChunk] = []

        with ZipFile(path) as package:
            for entry in package.infolist():
                if entry.is_dir() or not entry.filename.lower().endswith(".docx"):
                    continue
                paragraphs = _extract_docx_paragraphs(package.read(entry))
                chunks.extend(
                    KnowledgeChunk(source=entry.filename, text=paragraph)
                    for paragraph in paragraphs
                    if paragraph
                )

        return cls(chunks)

    @classmethod
    def from_markdown_file(cls, markdown_path: str | Path) -> "KnowledgeBase":
        path = Path(markdown_path)
        if not path.exists():
            return cls([])

        paragraphs = [
            part.strip()
            for part in re.split(r"\n\s*\n", path.read_text(encoding="utf-8"))
            if part.strip()
        ]
        chunks = [KnowledgeChunk(source=str(path), text=part) for part in paragraphs]
        chunks.extend(_sliding_window_chunks(source=str(path), paragraphs=paragraphs))
        return cls(chunks)

    def search(self, query: str, limit: int = 3) -> list[dict[str, str | int]]:
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
            }
            for score, chunk in scored[:limit]
        ]

    @property
    def chunk_count(self) -> int:
        return len(self._chunks)


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
    source: str,
    paragraphs: list[str],
    window_size: int = 5,
) -> list[KnowledgeChunk]:
    if len(paragraphs) < window_size:
        return []

    return [
        KnowledgeChunk(
            source=f"{source}#window-{index + 1}",
            text="\n".join(paragraphs[index : index + window_size]),
        )
        for index in range(0, len(paragraphs) - window_size + 1)
    ]


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
