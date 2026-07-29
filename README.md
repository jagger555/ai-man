# 灵山胜境景区导览 AI 数字人

面向灵山胜境景区的智能导览系统，提供游客问答、可信资料来源展示、语音与数字人讲解、地图导航，以及景区管理后台。

## 解压位置（文件资源管理器操作）

1. 右键名称以“主项目包-评委版”开头的主项目压缩包，选择“全部解压缩”。解压位置可自行选择，例如桌面或任意磁盘；解压后得到的、包含 `README.md` 的文件夹就是**项目根目录**。
2. 从第 4 节的 Google Drive 链接下载 `灵山胜境景区导览AI数字人-数字人形象素材包.zip`。
3. 右键素材包，选择“全部解压缩”，在“选择目标位置”时，选择刚才解压得到的**项目根目录**。不要选择 `LiveTalking\data\avatars` 文件夹。
4. 解压完成后，项目根目录内应出现如下结构：

```text
项目根目录
├─ README.md
├─ backend
├─ frontend
└─ LiveTalking
   └─ data
      └─ avatars
         ├─ 626
         └─ 708
```

如果看到 `LiveTalking\data\avatars\LiveTalking\data\avatars`，说明素材包解压到了错误位置；删除重复的 `LiveTalking` 文件夹后，重新将素材包解压到项目根目录。

## 1. 产品功能

### 游客端

- 景区知识问答：支持多轮提问，回答中展示资料来源、置信度和可靠状态；
- 数字人讲解：通过 LiveTalking 建立 WebRTC 视频流，并播报问答结果；
- 语音与导航：支持语音输入、语音播报和步行路线查询；
- 游客反馈：可对回答标记“有帮助 / 无帮助”并补充意见。

### 管理后台

- 查看问答记录、会话时间线、资料来源与模型状态；
- 按关键词、会话、置信度和可靠状态筛选记录；
- 查看低置信度问题，并区分资料缺口、无关问题、表达不清和服务异常；
- 查看并切换已生成的数字人形象。

## 2. 项目结构

```text
.
├─ frontend/                 React + Vite 前端
├─ backend/                  FastAPI 后端、知识库与测试
├─ LiveTalking/              数字人服务与模型代码
├─ data/sample_scenic/       景区知识库和官方资料
├─ data/runtime/             SQLite 运行数据
├─ start-local.bat            评委双击启动脚本
├─ scripts/start-local.ps1   一键启动脚本
├─ scripts/stop-local.ps1    停止脚本
└─ backend/.env              已配置的 API 参数
```

默认地址：

| 服务 | 地址 |
| --- | --- |
| 游客端与管理后台 | `http://127.0.0.1:5173` |
| 后端 API | `http://127.0.0.1:8000` |
| 数字人服务 | `http://127.0.0.1:8010` |

## 评委快速使用

完成以下前置条件后，直接双击项目根目录的 `start-local.bat`：

1. 已解压主项目包；
2. 已按顶部“解压位置”说明，把数字人素材包解压到项目根目录；
3. 已按第 3 节安装 Python、Node.js、Conda 及相关依赖；
4. 项目根目录中存在 `backend\.env`。

启动脚本会依次启动数字人、后端和前端服务。启动成功后访问 `http://127.0.0.1:5173`；若窗口提示缺少依赖或数字人素材，请按第 3、4 节完成对应步骤后重新启动。

## 3. 环境依赖与安装

请先解压主项目包，并在可看到 `README.md`、`backend`、`frontend`、`LiveTalking` 的**项目根目录**打开 PowerShell。以下命令均为相对路径，不依赖评委的解压位置。

需要安装：Python 3.12、Node.js 20 或更高版本、Conda。数字人建议使用 NVIDIA GPU；没有 GPU 仍可运行文字问答和管理后台。

```powershell
python --version
node --version
npm --version
conda --version
```

### 3.1 后端和前端依赖

```powershell
Set-Location .\backend
python -m pip install -r requirements.txt
Set-Location ..

Set-Location .\frontend
npm install
Set-Location ..
```

### 3.2 数字人依赖

若 PowerShell 无法识别 `conda activate`，先执行 `conda init powershell`，关闭并重新打开 PowerShell 后继续。

```powershell
conda create -n livetalking python=3.12 -y
conda activate livetalking

python -m pip install --upgrade pip
python -m pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cu130
python -m pip install -r .\LiveTalking\requirements.txt
```

检查 GPU：

```powershell
conda run -n livetalking python -c "import torch; print(torch.cuda.is_available())"
```

输出 `True` 表示可使用 GPU。若目标设备 CUDA 环境不同，请按 [PyTorch 官方安装说明](https://pytorch.org/get-started/locally/) 选择匹配的 PyTorch 安装命令，再执行 `LiveTalking\requirements.txt` 的安装。

## 4. 数字人形象素材

主项目包不包含预生成的数字人帧素材，以控制体积。启用数字人前，请下载素材包：

[下载数字人形象素材包（Google Drive）](https://drive.google.com/file/d/1wVJz3y8268m7qeyfnCLIacdOtWP8XbdK/view?usp=drive_link)

按顶部“解压位置”中的文件资源管理器步骤，将素材包解压到项目根目录即可。以下命令仅供需要用 PowerShell 操作时使用：

```powershell
Expand-Archive `
  -LiteralPath .\灵山胜境景区导览AI数字人-数字人形象素材包.zip `
  -DestinationPath . `
  -Force
```

解压后应存在以下目录：

```text
.\LiveTalking\data\avatars\626\
.\LiveTalking\data\avatars\708\
```

检查当前演示形象 `708`：

```powershell
Test-Path .\LiveTalking\data\avatars\708\coords.pkl
Test-Path .\LiveTalking\data\avatars\708\full_imgs
Test-Path .\LiveTalking\data\avatars\708\face_imgs
```

三个结果均为 `True` 即表示素材安装完成。请直接解压到项目根目录，不要解压到 `LiveTalking\data\avatars` 内部，以免出现重复目录。

## 5. 配置说明

主项目包已保留 `backend\.env`，其中包含大模型、语音、地图和数字人服务的配置，评委无需重新填写。

若 `backend\.env` 缺失，可从模板创建：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

常用配置项：

| 配置 | 用途 |
| --- | --- |
| `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` | 大模型问答 |
| `BAILIAN_*` | 百炼语音识别与合成 |
| `AMAP_WEB_SERVICE_KEY` | 高德步行导航与实时天气 |
| `SCENIC_NAME`、`SCENIC_ADCODE` | 首页景区名称与高德天气行政区代码，默认灵山胜境/滨湖区 `320211` |
| `SCENIC_WEATHER_TIMEOUT` | 天气接口独立超时，默认 2 秒，避免阻塞本地客流状态 |
| `SCENIC_WEATHER_CACHE_SECONDS`、`SCENIC_WEATHER_MAX_STALE_SECONDS` | 实时天气缓存与最大陈旧时长，默认 600/3600 秒 |
| `DIGITAL_HUMAN_BASE_URL`、`DIGITAL_HUMAN_AVATAR` | 数字人服务地址和形象 |

默认知识库位于 `data/sample_scenic/knowledge.md` 与 `data/sample_scenic/official_facts.md`。问答记录数据库会自动创建在 `data/runtime/chat_records.db`。

## 6. 一键启动

完成依赖安装和素材解压后，在项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingPath .\LiveTalking -LiveTalkingAvatarId 708
```

浏览器打开：

```text
http://127.0.0.1:5173
```

首次尚未安装后端和前端依赖时，可增加 `-InstallDependencies`。该参数不安装 Conda 和 PyTorch：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -InstallDependencies -LiveTalkingPath .\LiveTalking -LiveTalkingAvatarId 708
```

不启用数字人时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -SkipLiveTalking
```

常用参数：

```powershell
# 切换为形象 626
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingAvatarId 626

# 数字人改用 8020 端口
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingPort 8020 -LiveTalkingAvatarId 708

# 限制数字人并发会话数（默认 2）
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -LiveTalkingMaxSession 2
```

停止本次启动的服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

日志与 PID 文件位于 `%TEMP%\ai-man-local-run`。

## 7. 手动启动与接口验证

一键启动异常时，可在三个 PowerShell 窗口中分别启动服务；每个窗口均从项目根目录开始。

### 7.1 LiveTalking

```powershell
conda activate livetalking
Set-Location .\LiveTalking
python app.py --transport webrtc --model wav2lip --avatar_id 708 --listenport 8010 --max_session 2
```

### 7.2 后端

```powershell
$env:LIVETALKING_ROOT=(Join-Path (Get-Location) 'LiveTalking')
$env:DIGITAL_HUMAN_BASE_URL="http://127.0.0.1:8010"
$env:DIGITAL_HUMAN_AVATAR="708"

Set-Location .\backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 7.3 前端

```powershell
Set-Location .\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod "http://127.0.0.1:8000/api/admin/knowledge/search?query=灵山大佛"
```

游客问答接口：

```text
POST http://127.0.0.1:8000/api/chat
```

```json
{
  "session_id": "demo-session",
  "question": "灵山大佛有多高？"
}
```

响应包含回答内容、资料来源、置信度、可靠状态、模型状态和问答记录编号。

## 8. 测试与常见问题

执行后端测试与前端构建：

```powershell
Push-Location .\backend
python -m pytest -q
Pop-Location

Push-Location .\frontend
npm run build
Pop-Location
```

| 现象 | 处理方法 |
| --- | --- |
| `frontend\node_modules not found` | 在根目录执行 `Set-Location .\frontend; npm install; Set-Location ..` |
| 数字人持续重连 | 确认第 4 节素材已解压，再访问 `http://127.0.0.1:8010/index.html` |
| 没有 GPU | 使用 `-SkipLiveTalking`，文字问答和管理后台仍可正常使用 |
| 大模型调用失败 | 检查 `backend\.env` 中的 `LLM_*` 配置 |

## 9. 压缩包说明

主项目包保留 API 配置、知识库、运行数据和产品文档；已排除 `tmp`、Git 历史、`node_modules`、构建缓存、日志和数字人形象帧素材。数字人素材请按第 4 节下载并解压。
