# AI Digital Human Scenic Guide MVP

AI 数字人景区导览系统 MVP，面向比赛交付场景，先建立游客问答、知识库、数字人展示和管理后台的项目雏形。

## Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m pytest -v
python -m uvicorn app.main:app --reload
```

健康检查：

```text
GET http://127.0.0.1:8000/api/health
```

知识库检索：

```text
GET http://127.0.0.1:8000/api/admin/knowledge/search?query=灵山大佛
```

游客问答：

```text
POST http://127.0.0.1:8000/api/chat
```

请求示例：

```json
{
  "session_id": "demo-session",
  "question": "灵山大佛有多高？"
}
```

响应会包含：

```json
{
  "cleaned_question": "灵山大佛有多高？",
  "answer": "导游式回答",
  "sources": [],
  "confidence": 0.85,
  "reliable": true,
  "prompt": "发送给大模型的 Prompt",
  "history_turns_used": 1,
  "model_provider": "mock",
  "model_status": "mock_response",
  "record_id": 1,
  "record_status": "saved",
  "latency_ms": 12
}
```

默认知识库快照来自 `D:\Download\20260323113204906.zip` 中的示范景区公开资料包，已提取到 `data/sample_scenic/knowledge.md`。如需直接读取原始资料包 zip，可在启动前设置：

```powershell
$env:AI_GUIDE_KNOWLEDGE_PACKAGE="D:\Download\20260323113204906.zip"
```

真实大模型配置：

```powershell
$env:LLM_PROVIDER="openai"
$env:LLM_API_KEY="your_api_key"
$env:LLM_BASE_URL="https://api.openai.com/v1"
$env:LLM_MODEL="gpt-4o-mini"
```

如果真实模型调用失败，后端会自动回退到 `MockGuideLLM`，并在 `/api/chat` 响应里返回 `model_provider=mock` 与 `model_status=fallback_to_mock: ...`。

问答记录数据库会自动初始化，不需要手动创建数据库或建表。默认路径：

```text
data/runtime/chat_records.db
```

如果需要自定义路径：

```powershell
$env:DATABASE_PATH="C:\path\to\chat_records.db"
```

最近问答记录查询接口：

```text
GET http://127.0.0.1:8000/api/admin/chat-records?limit=20
```

按会话筛选最近记录：

```text
GET http://127.0.0.1:8000/api/admin/chat-records?limit=20&session_id=web-123
```

## Frontend

```powershell
cd frontend
npm install
npm run build
npm run dev
```

前端当前包含两个视图：

```text
游客问答
管理后台
```

管理后台第一版支持：

```text
统计卡片
关键词 / session_id / 置信度 / 可靠性 / 模型状态筛选
问答记录列表
记录详情（回答、Prompt、参考资料）
按 session_id 展示会话时间线
```
