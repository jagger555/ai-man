# AI Digital Human Scenic Guide MVP

AI 数字人景区导览系统 MVP，面向比赛交付场景，先建立游客问答、知识库、数字人展示和管理后台的项目雏形。

## 一键本地启动

Windows 下可以直接双击项目根目录的：

```text
start-local.bat
```

它会依次启动 LiveTalking、后端和前端，并打开游客端页面：

```text
http://127.0.0.1:5173
```

如果要在 PowerShell 里启动：

```powershell
cd D:\Projects\ai-man
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

常用参数：

```powershell
# 不启动 LiveTalking，只跑文本问答和前端
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -SkipLiveTalking

# LiveTalking 改用 8020 端口，后端 DIGITAL_HUMAN_BASE_URL 会自动同步
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingPort 8020

# 如果你本地用 quicktalk 模型
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingModel quicktalk

# 首次运行需要安装依赖时加这个参数
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -InstallDependencies
```

停止本次启动的本地服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

运行日志和 PID 文件默认写入系统临时目录：

```text
%TEMP%\ai-man-local-run
```

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

数字人接入配置：

```powershell
# 默认使用 LiveTalking 8010 端口；如果 LiveTalking 换端口，这里同步改为对应端口。
$env:DIGITAL_HUMAN_BASE_URL="http://127.0.0.1:8010"
$env:DIGITAL_HUMAN_AVATAR=""
$env:DIGITAL_HUMAN_VOICE="zh-CN-YunxiaNeural"
$env:DIGITAL_HUMAN_REF_AUDIO="zh-CN-YunxiaNeural"
$env:DIGITAL_HUMAN_REF_TEXT=""
```

数字人服务使用本地 LiveTalking 项目，可在该目录启动：

```powershell
cd D:\Projects\DH\LiveTalking
python app.py --transport webrtc --model wav2lip --avatar_id wav2lip256_avatar1 --listenport 8010
```

如需避开本地端口冲突，可以把 LiveTalking 和主项目配置同步改成任意空闲端口，例如：

```powershell
cd D:\Projects\DH\LiveTalking
python app.py --transport webrtc --model wav2lip --avatar_id wav2lip256_avatar1 --listenport 8020

$env:DIGITAL_HUMAN_BASE_URL="http://127.0.0.1:8020"
```

主项目前端会通过 `/api/digital-human/config` 读取配置，自动连接 LiveTalking 的 `/offer` 建立 WebRTC 视频流，并在问答完成后通过 `/human` 自动播报当前回答。未启动 LiveTalking 时，页面会显示重连状态，文本问答、资料来源和游客反馈仍可继续使用。

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
