---
title: "feat: 景区导览系统七项改进"
type: feat
status: active
date: 2026-06-07
origin: docs/brainstorms/2026-06-07-guide-improvements-requirements.md
---

## Summary

对 AI 数字人景区导览系统进行七项改进：jieba 分词替换单字匹配、规则+LLM 混合 query 分类、阿里百炼语音后端代理集成、知识库路线条目、LLM 自动测试集生成、行为数据 xlsx 大屏可视化、Prompt 追问引导。8 个实现单元，按依赖排序：检索基础 → 分类器；语音后端 → 语音前端；其余独立。

## Problem Frame

当前系统具备文本问答、数字人播报、管理后台的完整骨架，但检索精度受限于单字分词和拍脑袋的置信度阈值，语音交互完全缺失，路线推荐未实现，数据大屏内容为空。比赛交付需要证明 90% 准确率、展示多模态交互、提供可追溯的问答质量。本计划基于 `docs/brainstorms/2026-06-07-guide-improvements-requirements.md` 的 18 条需求，逐项落地。

## Requirements

### 检索增强

- R1. 引入 jieba 分词替换当前单字拆分，`_query_terms()` 返回 jieba 切分的词语集合而非逐字集合。 (see origin)
- R2. 支持自定义景区实体词典，至少覆盖知识库中出现的所有景点名、建筑名和专有名词。 (see origin)
- R3. 新增 `_classify_query()` 函数，规则覆盖位置、票价、时间、推荐四种 query 类型；规则无法确定时调用 LLM 分类。 (see origin)
- R4. 扩展 `_score()` 的领域加权逻辑，从当前仅 `_is_height_query()` 扩展到全部已支持的 query 类型。 (see origin)

### 语音集成

- R5. 新增 `POST /api/speech/recognize` 接口：接收音频，调用阿里百炼 ASR，返回文本。 (see origin)
- R6. 新增 `POST /api/speech/synthesize` 接口：接收文本，调用阿里百炼 TTS，返回音频。 (see origin)
- R7. 前端新增麦克风按钮：点击开始持续监听 → 静音检测（如 2 秒无声音）自动停止 → 调 `/api/speech/recognize` → 填入输入框。景区大屏触控场景，非按住说话。 (see origin)
- R8. 前端回答区新增播放按钮：点击 → 调 `/api/speech/synthesize` → 播放返回音频。 (see origin)
- R9. 语音服务不可用时前端给出明确状态提示，文本问答仍可正常使用。 (see origin)

### 路线推荐

- R10. 知识库新增 4-5 条路线文档（经典一日游、文化深度游、亲子休闲游、摄影打卡游、半日精华游）。 (see origin)
- R11. 新增 `_is_route_query()` 规则，对"路线/怎么玩/推荐/安排"类 query 在检索时对路线分类条目加权。 (see origin)
- R12. 路线推荐结果通过现有 `/api/chat` 返回，LLM 按导游语气展开。 (see origin)

### 评测体系

- R13. 用 DeepSeek 遍历知识库每条知识点生成 1-2 个标准问题+参考答案，产出 30-50 题测试集 JSON。 (see origin)
- R14. 新增评测脚本，逐题跑 `/api/chat`，统计准确率、可靠率、无资料来源率。 (see origin)
- R15. 评测结果接入管理后台数据大屏。 (see origin)

### 行为数据可视化

- R16. 解析 `示范景区公开资料包/景点景区旅游数据行为分析数据.xlsx`，提取可展示的汇总指标。 (see origin)
- R17. 汇总指标接入 `/api/admin/dashboard`，前端数据大屏新增对应卡片。 (see origin)

### 追问引导

- R18. `build_prompt()` 模板末尾追加追问引导指令。 (see origin)

## Key Technical Decisions

- **jieba 精确模式 (`jieba.cut`) 而非全模式或搜索引擎模式。** 景区问答以实体名匹配为主，精确模式不产生冗余子词，避免噪音。自定义词典通过 `jieba.add_word()` 批量注入。
- **Query 分类规则用关键词匹配实现，不发 API 调用。** `_classify_query()` 返回 `("rule", category)` 或 `("llm", None)`，仅后者触发 LLM 分类。避免每次问答额外增加延迟。
- **语音整段上传，非流式。** 前端持续监听 → 静音检测停止 → 发送完整音频 blob 给后端。阿里百炼 ASR 按整段音频设计，简化后端实现。
- **后端语音服务作为独立模块。** 新增 `app/services/speech_service.py` 封装百炼 API 调用，与现有 `llm/` 目录平行。语音不可用时抛出明确异常，由 API 层捕获并返回错误信息，不走 Mock 兜底（与 LLM 不同——语音没有 Mock 模式）。
- **测试集生成脚本独立于后端服务。** `backend/scripts/generate_test_set.py` 直接调 DeepSeek API（复用 `.env` 配置），遍历 `knowledge.md` 段落逐条生成问题。不依赖 FastAPI 启动。
- **路线条目以 `guide_script` 分类存入知识库。** 复用现有 `KnowledgeDocumentStore` 的 CRUD 和 `build_chunks_from_documents()` 的分块逻辑，检索时通过 `_is_route_query()` 加权命中。

## Implementation Units

### U1. jieba 分词 + 景区实体词典

- **Goal:** 用 jieba 分词替换 `_query_terms()` 中的逐字拆分，并注入景区实体词典。
- **Requirements:** R1, R2
- **Dependencies:** none
- **Files:**
  - `backend/requirements.txt` — 新增 `jieba` 依赖
  - `backend/app/services/knowledge_service.py` — 重写 `_query_terms()`，新增实体词典加载逻辑
- **Approach:**
  1. `requirements.txt` 添加 `jieba` 一行
  2. 在 `knowledge_service.py` 顶部 `import jieba`
  3. 新增 `_load_scenic_dict()` 函数：从知识库 chunk 集合中提取所有连续的 2-4 字中文片段作为候选实体，`jieba.add_word()` 批量注入
  4. 重写 `_query_terms()`：返回 `set(jieba.lcut(query.lower())) | cjk_chars`，保留单字作为 fallback
- **Patterns to follow:** 现有 `_query_terms()` 的 `set[str]` 返回类型不变，函数签名不变，调用方 `_score()` 无需改动
- **Test scenarios:**
  - 输入"灵山大佛有多高" → jieba 切分结果包含"灵山大佛"作为完整词
  - 输入"九龙灌浴表演几点开始" → 切分结果包含"九龙灌浴"作为完整词
  - 输入纯英文"Lingshan Buddha height" → 正常工作
  - 输入空字符串 → 返回空集合
- **Verification:** 运行现有测试套件确认无回归。新分词下"灵山大佛有多高"的检索结果与旧版对比，Top-1 匹配分应不下降。

### U2. Query 分类器

- **Goal:** 新增 `_classify_query()` 和扩展 `_score()`，覆盖四种常见 query 类型。
- **Requirements:** R3, R4
- **Dependencies:** U1（使用 jieba 分词后的 term 集合）
- **Files:**
  - `backend/app/services/knowledge_service.py` — 新增 `_classify_query()`，扩展 `_score()`，新增分类加权规则
- **Approach:**
  1. 新增 `QUERY_CLASSIFIERS` 字典，每种类型定义触发词集合和加权目标字段：

     | 类型 | 触发词 | 加权策略 |
     |---|---|---|
     | `height` | 多高、高度、通高、总高 | 含"通高/总高/米/m"的 chunk +120 |
     | `location` | 在哪、怎么去、位置、从哪里 | 含"位于/位置/入口"的 chunk +60 |
     | `ticket` | 门票、多少钱、票价、价格 | 含"票价/门票/元/价格"的 chunk +60 |
     | `schedule` | 几点、时间、开放、什么时候 | 含"时间/开放/开始/结束"的 chunk +60 |
     | `recommend` | 推荐、好玩、特色、必看 | 含"亮点/特色/推荐"的 chunk +60 |

  2. 新增 `_classify_query(question: str) -> tuple[str, str | None]`：遍历分类器匹配触发词 → 命中则返回 `("rule", category)` → 都不命中返回 `("llm", None)`
  3. `_score()` 接受可选的 `category` 参数，命中时叠加分类器加权
  4. `KnowledgeBase.search()` 接受可选的 `category` 参数透传
- **Patterns to follow:** 现有 `_is_height_query()` 作为 height 分类器迁移进 `QUERY_CLASSIFIERS`，函数删除
- **Test scenarios:**
  - "灵山大佛多高" → 分类为 `("rule", "height")`，高度相关 chunk 加分
  - "梵宫在哪里" → 分类为 `("rule", "location")`，位置相关 chunk 加分
  - "门票多少钱" → 分类为 `("rule", "ticket")`
  - "灵山大佛的历史渊源是什么" → 无规则命中 → 分类为 `("llm", None)`，LLM 分类后再检索
- **Verification:** 构造 10 个覆盖五种类型 + 无匹配的 query，验证分类结果正确。

### U3. 语音 API 后端接口

- **Goal:** 新增语音识别和语音合成两个后端接口。
- **Requirements:** R5, R6
- **Dependencies:** none
- **Files:**
  - `backend/app/services/speech_service.py` — 新建，封装阿里百炼 ASR/TTS API
  - `backend/app/api/speech.py` — 新建，路由定义
  - `backend/app/main.py` — 注册 speech router
  - `backend/app/core/config.py` — 新增 `SpeechConfig`
  - `backend/.env.example` — 新增语音配置项说明
  - `backend/tests/test_speech.py` — 新建，语音接口测试
  - `backend/requirements.txt` — 确认 `httpx` 已存在（复用）
- **Approach:**
  1. `SpeechConfig` dataclass：`api_key`、`asr_url`、`tts_url`、`tts_voice`、`timeout`
  2. `SpeechService` 类：
     - `recognize(audio_bytes: bytes, audio_format: str = "wav") -> str`：POST 百炼 ASR endpoint，返回识别文本
     - `synthesize(text: str) -> bytes`：POST 百炼 TTS endpoint，返回音频字节
     - 失败时抛出 `SpeechServiceError`（自定义异常），不静默降级
  3. API 路由：
     - `POST /api/speech/recognize`：接收 `multipart/form-data`（audio file），返回 `{"text": "..."}`
     - `POST /api/speech/synthesize`：接收 `{"text": "..."}`，返回 `audio/wav` 流
  4. `main.py` 注册 `speech_router`
- **Patterns to follow:** 参照 `app/services/llm/real_llm.py` 的 httpx 调用、重试、异常处理风格。参照 `app/core/config.py` 的 `get_*_config()` 模式
- **Test scenarios:**
  - `POST /api/speech/recognize` 上传有效 WAV 音频 → 返回识别文本
  - `POST /api/speech/recognize` 上传空文件 → 返回 400
  - `POST /api/speech/synthesize` 提交正常文本 → 返回音频二进制流
  - `POST /api/speech/synthesize` 提交空文本 → 返回 400
  - 百炼 API 不可达 → SpeechService 抛异常 → API 返回 502，前端收到明确错误信息
- **Verification:** 用 curl 上传一段语音测试 `/api/speech/recognize`，确认返回合理文本。用 curl 调 `/api/speech/synthesize`，确认返回可播放的音频文件。

### U4. 前端语音交互

- **Goal:** 游客问答区增加语音输入和语音播报按钮，景区大屏触控场景。
- **Requirements:** R7, R8, R9
- **Dependencies:** U3（后端语音接口可用）
- **Files:**
  - `frontend/src/App.tsx` — 新增语音交互状态和逻辑
  - `frontend/src/styles.css` — 新增录音/播放按钮样式
- **Approach:**
  1. 语音输入（大屏触控模式）：
     - 新增 `isListening` 状态和 `mediaRecorder` ref
     - 点击麦克风按钮 → `navigator.mediaDevices.getUserMedia({audio: true})` → MediaRecorder 开始录音
     - 使用 AudioContext + AnalyserNode 检测音量：连续 2 秒音量低于阈值 → 自动停止录音 → 得到 audio blob
     - 停止后自动调 `/api/speech/recognize` → 文本填入输入框
     - 用户也可手动点击停止按钮提前结束录音
  2. 语音播报：
     - 回答区新增播放按钮（response 非空时显示）
     - 点击 → 调 `/api/speech/synthesize` → 拿到 audio blob → `new Audio(URL.createObjectURL(blob)).play()`
     - 播放中显示暂停/停止状态
  3. 错误处理：语音服务不可用时（接口返回 502），显示"语音服务暂不可用"，文本问答不受影响
- **Patterns to follow:** 参照 `DigitalHumanPanel.tsx` 的 WebRTC stream 处理风格（useRef 管理媒体对象，useEffect cleanup 释放资源）
- **Test scenarios:**
  - 点击麦克风 → 浏览器请求麦克风权限 → 开始录音 → 说话 → 静音 2 秒 → 自动停止 → 文本填入输入框
  - 录音中途手动点击停止 → 已有音频发送识别
  - 浏览器拒绝麦克风权限 → 显示权限提示，不崩溃
  - 后端 `/api/speech/recognize` 返回 502 → 显示"语音服务暂不可用"
  - 点击播放按钮 → 调用 TTS → 播放返回音频
  - 无回答内容时播放按钮不显示
- **Verification:** 启动前端，在 Chrome 中完成"点击麦克风 → 说话 → 自动停止 → 文本填入 → 发送问题 → 收到回答 → 点击播放"完整链路。

### U5. 路线推荐条目 + 检索规则

- **Goal:** 知识库新增路线条目，检索侧新增路线 query 检测。
- **Requirements:** R10, R11, R12
- **Dependencies:** U1（jieba 分词提升检索质量）
- **Files:**
  - `data/sample_scenic/knowledge.md` — 新增路线条目章节
  - `backend/app/services/knowledge_service.py` — 新增 `_is_route_query()` 和分类器条目
- **Approach:**
  1. 在 `knowledge.md` 末尾追加 5 条路线条目，格式与现有景点条目一致：

     - 经典一日游：灵山大照壁 → 九龙灌浴 → 灵山大佛 → 梵宫 → 五印坛城
     - 文化深度游：灵山大佛 → 梵宫（重点讲解）→ 五印坛城 → 曼飞龙塔
     - 亲子休闲游：九龙灌浴（表演）→ 百子戏弥勒 → 大照壁合影 → 素食体验
     - 摄影打卡游：大照壁湖光壁影 → 灵山大佛全景 → 梵宫穹顶 → 五印坛城日落
     - 半日精华游：大照壁 → 灵山大佛 → 梵宫

     每条包含：路线名称、适用人群、游览顺序、各点讲解重点、预计用时、注意事项

  2. 新增 `_is_route_query()` 函数：独立于 U2 分类器体系，参照现有 `_is_height_query()` 模式直接在 `_score()` 中调用，触发词为"路线/怎么玩/安排/推荐/玩一天/玩半天/带老人/带小孩/拍照/半日/一日"，加权目标为含"路线/游/一日/半日"的 chunk +80
  3. U2 实现后，`_is_route_query()` 迁移为 `QUERY_CLASSIFIERS` 中的 `route` 条目，U5 的独立函数删除
- **Patterns to follow:** 知识条目格式参照 `knowledge.md` 现有景点条目（标题 + 详细描述 + 亮点）
- **Test scenarios:**
  - "我想带老人玩半天怎么安排" → 命中 route 分类器 → 检索加权 → Top-3 包含半日精华游
  - "哪里适合拍照" → 命中 route 分类器 → Top-3 包含摄影打卡游
  - "灵山大佛有多高" → 不命中 route 分类器 → 正常事实问答
- **Verification:** 新增路线条目后重启后端，用 5 种路线类问题测试 Top-3 检索结果是否包含对应路线。

### U6. Prompt 追问引导

- **Goal:** 回答末尾引导游客继续对话，提升交互自然度。
- **Requirements:** R18
- **Dependencies:** none
- **Files:**
  - `backend/app/services/prompt_service.py` — `build_prompt()` 模板追加一句
- **Approach:** 在 `build_prompt()` 的 return 语句中，模板末尾追加：
  ```
  回答结束后，提出一个游客可能感兴趣的追问，引导对话继续。
  ```
  全 Prompt 样式参照现有模板，不改变结构。
- **Patterns to follow:** 现有 Prompt 模板的导游人设和"先直接回答再补充"的风格
- **Test scenarios:**
  - 问"灵山大佛有多高" → 回答末尾包含一个追问（如"你想了解大佛的建造工艺吗？"）
  - 追问不应是固定模板句，而是与当前回答内容相关
- **Verification:** 调 `/api/chat` 问一个问题，检查回答末句是否为追问引导。

### U7. 测试集生成 + 评测脚本

- **Goal:** 自动生成 30-50 题标准测试集并建立评测流水线。
- **Requirements:** R13, R14, R15
- **Dependencies:** none（独立脚本，不依赖其他单元）
- **Files:**
  - `backend/scripts/generate_test_set.py` — 新建，自动生成测试集
  - `backend/tests/fixtures/standard_test_set.json` — 生成产物，测试集数据
  - `backend/tests/test_accuracy.py` — 新建，评测脚本
  - `backend/app/api/chat_records.py` — dashboard 接口新增准确率字段（如适用）
- **Approach:**
  1. `generate_test_set.py`：
     - 读取 `data/sample_scenic/knowledge.md`
     - 按段落/知识点拆分
     - 对每条知识点，调 DeepSeek API 生成 1-2 个问题+参考答案
     - Prompt 模板："基于以下景区知识点，生成一个游客可能问的问题和准确的参考答案。输出 JSON 格式：{question, answer, knowledge_ref}"
     - 输出写入 `tests/fixtures/standard_test_set.json`
  2. `test_accuracy.py`：
     - 加载标准测试集
     - 逐题调 `POST /api/chat`
     - 对每道题：比较实际回答与参考答案（用 LLM judge 或关键词匹配）
     - 统计指标：准确率、可靠率（reliable=true 的比例）、低置信度率、无资料来源率、平均响应时间
     - 输出 Markdown 格式的评测报告
  3. Dashboard 集成（轻量）：在 `get_dashboard_metrics()` 的 summary 中新增 `accuracy_rate` 字段，从最近一次评测运行结果读取
- **Patterns to follow:** 参照 `backend/tests/test_chat.py` 的测试风格（pytest + requests/httpx）。LLM 调用复用 `.env` 中的 DeepSeek 配置
- **Test scenarios:**
  - 生成脚本运行后产出 30+ 条测试用例
  - 每条测试用例包含 question、answer、knowledge_ref 三个字段
  - 评测脚本运行后输出准确率、可靠率等统计值
  - 知识库中有明确答案的问题准确率 ≥ 85%
- **Verification:** 运行 `python scripts/generate_test_set.py` 生成测试集，再运行 `pytest tests/test_accuracy.py -v` 输出评测报告。

### U8. 行为数据可视化

- **Goal:** 解析 16MB 行为数据 xlsx，将汇总指标接入数据大屏。
- **Requirements:** R16, R17
- **Dependencies:** none
- **Files:**
  - `backend/app/services/visitor_analytics_service.py` — 新建，解析 xlsx
  - `backend/app/api/chat_records.py` — dashboard 接口新增 analytics 字段
  - `frontend/src/DashboardPanel.tsx` — 新增行为数据卡片
  - `frontend/src/types.ts` — 新增类型定义
  - `backend/requirements.txt` — 新增 `openpyxl` 依赖
- **Approach:**
  1. `requirements.txt` 添加 `openpyxl`
  2. `visitor_analytics_service.py`：
     - 读取 xlsx，探测 sheet 名称和列结构
     - 提取可汇总字段（如游客量、停留时长、热门时段、人群分布等——取决于实际内容）
     - 若 xlsx 不存在或不可解析，返回空汇总（不抛异常，不影响 dashboard 其他卡片）
  3. Dashboard API：`get_dashboard_metrics()` 调用 `VisitorAnalyticsService.get_summary()`，返回体新增 `visitor_analytics` 字段
  4. 前端：`DashboardPanel.tsx` 在 dashboard metrics 区新增 2-3 张行为数据卡片，内容由实际 xlsx 数据决定
- **Patterns to follow:** 参照 `chat_record_service.py` 的 `get_dashboard_metrics()` 结构。参照 `DashboardPanel.tsx` 的 metric card 渲染模式
- **Test scenarios:**
  - xlsx 存在且格式正常 → dashboard 返回行为数据汇总
  - xlsx 不存在 → analytics 字段为空对象 `{}`，不影响其他卡片
  - xlsx 存在但 sheet/列结构异常 → 日志 warning，analytics 字段为空
- **Verification:** 启动后端，调 `/api/admin/dashboard`，确认返回体中 `visitor_analytics` 字段存在且前端渲染正常。

---

## Scope Boundaries

### Deferred for later

- 向量/语义检索——等测试集基线建立后，若关键词检索达不到 90% 再评估
- 多模态图片识别（拍照识景）
- 语音流式 ASR（当前按整段上传设计）
- 置信度阈值校准——等测试集跑出数据后有依据地调整

### Deferred to Follow-Up Work

- 行为数据 xlsx 深度分析——本计划只做汇总指标提取，不做趋势分析或预测模型
- 前端语音权限引导 UI 优化——当前用浏览器原生权限弹窗

---

## Risks & Dependencies

- **阿里百炼 API 可用性。** 百炼 ASR/TTS endpoint 格式、认证方式、速率限制尚未实际验证。计划假设其兼容标准 REST API（Bearer token + JSON/FormData）。若格式差异大，U3 需要额外适配工作。
- **行为数据 xlsx 内容未知。** 若文件是原始明细日志而非汇总统计，U8 的可视化范围将缩小为元数据展示（行数、列数、时间段）。
- **jieba 自定义词典覆盖率。** `_load_scenic_dict()` 自动提取的实体可能漏掉简称或别名。若测试集跑完后发现因分词导致的准确率不足，需手动补词典。

## Open Questions

- 阿里百炼 ASR endpoint 的具体 URL 和认证方式——需根据百炼官方文档确认后填入 `SpeechConfig`
- 行为数据 xlsx 的表结构——需实际读取后确定可视化内容
