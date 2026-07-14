from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "standard_test_set.json"
METRICS_PATH = Path(__file__).resolve().parents[2] / "data" / "runtime" / "accuracy_metrics.json"


def test_standard_knowledge_comparison(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "accuracy_chat_records.db"))

    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert len(cases) >= 30

    client = TestClient(app)
    results = []
    started = time.perf_counter()
    for case in cases:
        response = client.post(
            "/api/chat",
            json={
                "session_id": "accuracy-suite",
                "question": case["question"],
            },
        )
        assert response.status_code == 200
        body = response.json()
        results.append(
            {
                "question": case["question"],
                "official_references": [source["text"] for source in body["sources"]],
                "digital_human_answer": body["answer"],
                "reliable": bool(body["reliable"]),
                "source_count": len(body["sources"]),
                "latency_ms": int(body["latency_ms"]),
            }
        )

    total = len(results)
    reliable_count = sum(1 for item in results if item["reliable"])
    no_source_count = sum(1 for item in results if item["source_count"] == 0)
    metrics = {
        "case_count": total,
        "reliable_rate": round(reliable_count / total, 2),
        "no_source_rate": round(no_source_count / total, 2),
        "average_latency_ms": round(
            sum(item["latency_ms"] for item in results) / total
        ),
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "results": results,
    }
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    assert no_source_count == 0
