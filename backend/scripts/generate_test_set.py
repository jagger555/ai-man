from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.knowledge_service import KnowledgeBase

KNOWLEDGE_PATH = ROOT / "data" / "sample_scenic" / "knowledge.md"
OUTPUT_PATH = BACKEND_ROOT / "tests" / "fixtures" / "standard_test_set.json"

CURATED_QUESTIONS = [
    "灵山大佛有多高？",
    "灵山大佛总高是多少？",
    "灵山大佛有什么佛教意义？",
    "灵山大佛适合怎么体验？",
    "九龙灌浴几点表演？",
    "九龙灌浴有什么特色？",
    "九龙灌浴表演时长多久？",
    "灵山梵宫有哪些艺术特色？",
    "灵山梵宫的建筑规模是多少？",
    "吉祥颂演出时间是什么？",
    "五印坛城有什么特色？",
    "五印坛城适合体验什么？",
    "祥符禅寺有什么历史渊源？",
    "祥符禅寺有哪些历史遗存？",
    "灵山大照壁在哪里？",
    "灵山大照壁有什么亮点？",
    "五明桥代表什么含义？",
    "佛足坛有什么寓意？",
    "五智门有什么象征意义？",
    "菩提大道有什么特色？",
    "阿育王柱有什么文化意义？",
    "百子戏弥勒适合亲子游吗？",
    "佛手广场有什么体验？",
    "门票多少钱？",
    "观光车多少钱？",
    "灵山胜境最佳游览时间是什么？",
    "景区餐饮有什么推荐？",
    "灵山胜境住宿有什么推荐？",
    "文明游览要注意什么？",
    "经典一日游怎么安排？",
    "文化深度游怎么安排？",
    "亲子休闲游怎么安排？",
    "摄影打卡游怎么安排？",
    "半日精华游怎么安排？",
    "带老人玩半天怎么安排？",
    "哪里适合拍照打卡？",
    "带小孩怎么玩比较轻松？",
    "灵山胜境有什么历史渊源？",
    "世界佛教论坛和灵山胜境有什么关系？",
    "抱佛脚体验有什么寓意？",
]


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    if os.getenv("USE_LLM_TEST_SET") != "1":
        test_cases = _generate_curated_cases()
        _write_cases(test_cases)
        return

    knowledge_points = _load_knowledge_points(KNOWLEDGE_PATH)
    test_cases = []

    for index, point in enumerate(knowledge_points[:40], start=1):
        generated = _generate_with_llm(point)
        if generated is None:
            generated = _generate_deterministic_case(point, index)
        test_cases.append(generated)

    _write_cases(test_cases)


def _generate_curated_cases() -> list[dict[str, str]]:
    knowledge_base = KnowledgeBase.from_markdown_file(KNOWLEDGE_PATH)
    test_cases = []
    for index, question in enumerate(CURATED_QUESTIONS, start=1):
        results = knowledge_base.search(question, limit=1)
        answer = results[0]["text"] if results else ""
        test_cases.append(
            {
                "question": question,
                "answer": _compact_answer(str(answer)),
                "knowledge_ref": f"knowledge.md#search-{index}",
            }
        )
    return test_cases


def _write_cases(test_cases: list[dict[str, str]]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(test_cases, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Generated {len(test_cases)} cases at {OUTPUT_PATH}")


def _load_knowledge_points(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    paragraphs = [
        part.strip()
        for part in re.split(r"\n\s*\n", text)
        if len(part.strip()) >= 40 and not part.strip().startswith("#")
    ]
    route_points = _collect_route_points(paragraphs)
    factual_points = [
        part
        for part in paragraphs
        if any(keyword in part for keyword in ("灵山大佛", "九龙灌浴", "梵宫", "门票", "祥符禅寺"))
    ]
    selected = route_points + factual_points + paragraphs
    deduped: list[str] = []
    seen: set[str] = set()
    for point in selected:
        key = point[:120]
        if key not in seen:
            deduped.append(point)
            seen.add(key)
    return deduped


def _collect_route_points(paragraphs: list[str]) -> list[str]:
    route_points: list[str] = []
    index = 0
    while index < len(paragraphs):
        if not paragraphs[index].startswith("路线名称："):
            index += 1
            continue

        block = [paragraphs[index]]
        cursor = index + 1
        while cursor < len(paragraphs) and not paragraphs[cursor].startswith("路线名称："):
            block.append(paragraphs[cursor])
            if len(block) >= 6:
                break
            cursor += 1
        route_points.append("\n".join(block))
        index = cursor
    return route_points


def _generate_with_llm(point: str) -> dict[str, str] | None:
    api_key = os.getenv("LLM_API_KEY")
    base_url = os.getenv("LLM_BASE_URL", "").rstrip("/")
    model = os.getenv("LLM_MODEL", "deepseek-chat")
    if not api_key or not base_url:
        return None

    prompt = (
        "基于以下景区知识点，生成一个游客可能问的问题和准确的参考答案。"
        "只输出 JSON：{\"question\":\"...\",\"answer\":\"...\",\"knowledge_ref\":\"...\"}\n\n"
        f"知识点：{point[:2000]}"
    )
    try:
        response = httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 500,
            },
            timeout=30,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        match = re.search(r"\{.*\}", content, flags=re.S)
        if not match:
            return None
        payload = json.loads(match.group(0))
        return {
            "question": str(payload["question"]).strip(),
            "answer": str(payload["answer"]).strip(),
            "knowledge_ref": str(payload.get("knowledge_ref") or point[:120]).strip(),
        }
    except Exception:
        return None


def _generate_deterministic_case(point: str, index: int) -> dict[str, str]:
    entity = _pick_entity(point) or "灵山胜境"
    if "路线名称：" in point or "游览顺序：" in point:
        question = f"{entity}适合怎么游览？"
    elif "门票" in point or "票价" in point or "元" in point:
        question = "灵山胜境门票和优惠政策是怎样的？"
    elif "开放" in point or "时间" in point or "演出" in point:
        question = f"{entity}的开放或表演时间是什么？"
    elif "通高" in point or "总高" in point or "米" in point:
        question = f"{entity}有多高？"
    else:
        question = f"{entity}有什么特色？"

    return {
        "question": question,
        "answer": _compact_answer(point),
        "knowledge_ref": f"knowledge.md#{index}",
    }


def _pick_entity(text: str) -> str:
    known_entities = [
        "经典一日游",
        "文化深度游",
        "亲子休闲游",
        "摄影打卡游",
        "半日精华游",
        "灵山大佛",
        "九龙灌浴",
        "灵山梵宫",
        "梵宫",
        "祥符禅寺",
        "五印坛城",
        "灵山大照壁",
    ]
    return next((entity for entity in known_entities if entity in text), "")


def _compact_answer(point: str) -> str:
    text = re.sub(r"\s+", " ", point).strip()
    return text[:260]


if __name__ == "__main__":
    main()
