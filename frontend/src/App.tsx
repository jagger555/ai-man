import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ActiveView,
  AdminOverview,
  ChatRecord,
  ChatRecordListResponse,
  ChatResponse,
  ConfidenceFilter,
  FeedbackListResponse,
  FeedbackRating,
  FeedbackRecord,
  LowConfidenceListResponse,
  LowConfidenceRecord,
  ModelFilter,
  ReliableFilter,
} from "./types";
import {
  buildAdminStats,
  formatTimestamp,
  getConfidenceBand,
  getModelBucket,
  getModelLabel,
  truncate,
} from "./utils";
import { ErrorBoundary } from "./ErrorBoundary";
import { KnowledgeManager } from "./KnowledgeManager";

const sampleQuestions = [
  "灵山大佛有多高？",
  "灵山胜境有什么历史渊源？",
  "灵山梵宫有哪些特色体验？",
  "那它有什么寓意？",
];

export function App() {
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("chat");

  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [recordsTotalCount, setRecordsTotalCount] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  const [lowConfidenceRecords, setLowConfidenceRecords] = useState<
    LowConfidenceRecord[]
  >([]);
  const [lowConfidenceTotalCount, setLowConfidenceTotalCount] = useState(0);
  const [lowConfidenceLoading, setLowConfidenceLoading] = useState(false);
  const [lowConfidenceError, setLowConfidenceError] = useState("");

  const [feedbackRecords, setFeedbackRecords] = useState<FeedbackRecord[]>([]);
  const [feedbackTotalCount, setFeedbackTotalCount] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<{
    recordId: number;
    rating: FeedbackRating;
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const [currentSessionRecords, setCurrentSessionRecords] = useState<ChatRecord[]>([]);
  const [currentSessionRecordsLoading, setCurrentSessionRecordsLoading] =
    useState(false);

  const [selectedRecord, setSelectedRecord] = useState<ChatRecord | null>(null);
  const [selectedSessionRecords, setSelectedSessionRecords] = useState<ChatRecord[]>(
    [],
  );
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  const [keywordFilter, setKeywordFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] =
    useState<ConfidenceFilter>("all");
  const [reliableFilter, setReliableFilter] = useState<ReliableFilter>("all");
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");

  const sessionId = useMemo(() => `web-${Date.now()}`, []);

  const filteredRecords = records.filter((record) => {
    const keyword = keywordFilter.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      [
        record.original_question,
        record.cleaned_question,
        record.answer,
        record.model_status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesSession =
      !sessionFilter.trim() || record.session_id.includes(sessionFilter.trim());

    const matchesConfidence =
      confidenceFilter === "all" ||
      getConfidenceBand(record.confidence) === confidenceFilter;

    const matchesReliable =
      reliableFilter === "all" ||
      (reliableFilter === "reliable" && record.reliable) ||
      (reliableFilter === "unreliable" && !record.reliable);

    const matchesModel =
      modelFilter === "all" || getModelBucket(record) === modelFilter;

    return (
      matchesKeyword &&
      matchesSession &&
      matchesConfidence &&
      matchesReliable &&
      matchesModel
    );
  });

  const selectedDetailRecord =
    (selectedRecord
      ? filteredRecords.find((record) => record.id === selectedRecord.id)
      : null) ?? filteredRecords[0] ?? null;

  const stats = buildAdminStats(overview, overviewLoading);
  const adminErrors = [
    recordsError,
    overviewError,
    lowConfidenceError,
    feedbackError,
  ].filter(Boolean);

  useEffect(() => {
    if (activeView === "admin") {
      void loadAdminData();
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "admin") {
      return;
    }

    if (!filteredRecords.length) {
      if (selectedRecord !== null) {
        setSelectedRecord(null);
      }
      return;
    }

    if (
      selectedRecord === null ||
      !filteredRecords.some((record) => record.id === selectedRecord.id)
    ) {
      setSelectedRecord(filteredRecords[0]);
    }
  }, [activeView, filteredRecords, selectedRecord]);

  useEffect(() => {
    if (activeView !== "admin" || !selectedDetailRecord) {
      setSelectedSessionRecords([]);
      return;
    }

    setShowFullPrompt(false);
    void loadSelectedSessionRecords(selectedDetailRecord.session_id);
  }, [activeView, selectedDetailRecord?.session_id]);

  useEffect(() => {
    if (response?.record_id == null) {
      setFeedbackStatus(null);
      setFeedbackText("");
      return;
    }

    const existing = feedbackRecords.find(
      (record) => record.record_id === response.record_id,
    );
    if (existing) {
      setFeedbackStatus({
        recordId: existing.record_id,
        rating: existing.rating,
      });
      setFeedbackText(existing.feedback_text);
    } else {
      setFeedbackStatus(null);
      setFeedbackText("");
    }
  }, [response?.record_id, feedbackRecords]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          question: trimmedQuestion,
        }),
      });

      if (!result.ok) {
        throw new Error(`问答接口返回 ${result.status}`);
      }

      setResponse((await result.json()) as ChatResponse);
      await Promise.all([loadAdminData(), loadCurrentSessionRecords()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "问答请求失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitFeedback(rating: FeedbackRating) {
    if (response?.record_id == null) {
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackError("");

    try {
      const result = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          record_id: response.record_id,
          session_id: response.session_id,
          rating,
          feedback_text: feedbackText.trim(),
        }),
      });

      if (!result.ok) {
        throw new Error(`反馈接口返回 ${result.status}`);
      }

      setFeedbackStatus({
        recordId: response.record_id,
        rating,
      });
      await Promise.all([loadFeedbackRecords(), loadAdminData()]);
    } catch (caught) {
      setFeedbackError(caught instanceof Error ? caught.message : "提交反馈失败");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function loadAdminData() {
    await Promise.all([
      loadRecords(),
      loadOverview(),
      loadLowConfidenceRecords(),
      loadFeedbackRecords(),
    ]);
  }

  async function loadRecords() {
    setRecordsLoading(true);
    setRecordsError("");

    try {
      const result = await fetch("/api/admin/chat-records?limit=100");
      if (!result.ok) {
        throw new Error(`记录接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as ChatRecordListResponse;
      setRecords(payload.records);
      setRecordsTotalCount(payload.total_count);
    } catch (caught) {
      setRecordsError(caught instanceof Error ? caught.message : "读取记录失败");
    } finally {
      setRecordsLoading(false);
    }
  }

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewError("");

    try {
      const result = await fetch("/api/admin/overview");
      if (!result.ok) {
        throw new Error(`统计接口返回 ${result.status}`);
      }

      setOverview((await result.json()) as AdminOverview);
    } catch (caught) {
      setOverviewError(caught instanceof Error ? caught.message : "读取统计信息失败");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadLowConfidenceRecords() {
    setLowConfidenceLoading(true);
    setLowConfidenceError("");

    try {
      const result = await fetch("/api/admin/chat-records/low-confidence?limit=12");
      if (!result.ok) {
        throw new Error(`低置信度接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as LowConfidenceListResponse;
      setLowConfidenceRecords(payload.records);
      setLowConfidenceTotalCount(payload.total_count);
    } catch (caught) {
      setLowConfidenceError(
        caught instanceof Error ? caught.message : "读取低置信度问题失败",
      );
    } finally {
      setLowConfidenceLoading(false);
    }
  }

  async function loadFeedbackRecords() {
    setFeedbackLoading(true);
    setFeedbackError("");

    try {
      const result = await fetch("/api/admin/feedback?limit=12");
      if (!result.ok) {
        throw new Error(`反馈列表接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as FeedbackListResponse;
      setFeedbackRecords(payload.records);
      setFeedbackTotalCount(payload.total_count);
    } catch (caught) {
      setFeedbackError(
        caught instanceof Error ? caught.message : "读取反馈列表失败",
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadCurrentSessionRecords() {
    setCurrentSessionRecordsLoading(true);

    try {
      const result = await fetch(
        `/api/admin/chat-records?limit=12&session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!result.ok) {
        throw new Error(`会话记录接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as ChatRecordListResponse;
      setCurrentSessionRecords([...payload.records].reverse());
    } catch {
      setCurrentSessionRecords([]);
    } finally {
      setCurrentSessionRecordsLoading(false);
    }
  }

  async function loadSelectedSessionRecords(targetSessionId: string) {
    setSelectedSessionLoading(true);

    try {
      const result = await fetch(
        `/api/admin/chat-records?limit=20&session_id=${encodeURIComponent(targetSessionId)}`,
      );
      if (!result.ok) {
        throw new Error(`会话详情接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as ChatRecordListResponse;
      setSelectedSessionRecords([...payload.records].reverse());
    } catch {
      setSelectedSessionRecords([]);
    } finally {
      setSelectedSessionLoading(false);
    }
  }

  function focusRecordFromPool(recordId: number) {
    resetFilters();
    const matchedRecord = records.find((record) => record.id === recordId);
    if (matchedRecord) {
      setSelectedRecord(matchedRecord);
    }
  }

  function resetFilters() {
    setKeywordFilter("");
    setSessionFilter("");
    setConfidenceFilter("all");
    setReliableFilter("all");
    setModelFilter("all");
  }

  return (
    <main className="app-shell">
      <section className="guide-layout">
        <aside className="digital-human-panel" aria-label="AI 数字人">
          <div className={isLoading ? "avatar speaking" : "avatar"}>
            <div className="avatar-face">
              <span />
              <span />
            </div>
          </div>
          <p className="eyebrow">AI GUIDE</p>
          <h1>灵山胜境数字人导览</h1>
          <p className="summary">
            基于示范景区公开资料包构建知识库，前台提供游客问答，后台追踪问答质量、
            会话上下文、游客反馈和模型运行状态。
          </p>
        </aside>

        <section className="chat-panel" aria-label="景区问答">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">系统视图</p>
              <h2>{activeView === "chat" ? "游客问答" : "管理后台"}</h2>
            </div>
            <div className="view-toggle" role="tablist" aria-label="视图切换">
              <button
                type="button"
                className={activeView === "chat" ? "active" : ""}
                onClick={() => setActiveView("chat")}
              >
                游客问答
              </button>
              <button
                type="button"
                className={activeView === "admin" ? "active" : ""}
                onClick={() => setActiveView("admin")}
              >
                管理后台
              </button>
            </div>
          </div>

          {activeView === "chat" ? (
            <>
              <form onSubmit={submitQuestion} className="question-form">
                <label htmlFor="question">游客问题</label>
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                />
                <div className="quick-questions">
                  {sampleQuestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setQuestion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button className="primary-action" type="submit" disabled={isLoading}>
                  {isLoading ? "检索中..." : "发送问题"}
                </button>
              </form>

              {error ? <p className="error-message">{error}</p> : null}
              {feedbackError && activeView === "chat" ? (
                <p className="error-message">{feedbackError}</p>
              ) : null}

              {response ? (
                <article className="answer-panel">
                  <div className="answer-meta">
                    <span>响应 {response.latency_ms} ms</span>
                    <span>来源 {response.sources.length} 条</span>
                    <span>置信度 {(response.confidence * 100).toFixed(0)}%</span>
                    <span>历史 {response.history_turns_used} 轮</span>
                    <span className={response.reliable ? "reliable" : "unreliable"}>
                      {response.reliable ? "检索可靠" : "资料不足"}
                    </span>
                    <span>模型 {response.model_provider}</span>
                  </div>

                  <section className="pipeline-panel" aria-label="RAG 问答流程">
                    <div>
                      <strong>用户问题</strong>
                      <p>{question}</p>
                    </div>
                    <div>
                      <strong>问题预处理</strong>
                      <p>{response.cleaned_question}</p>
                    </div>
                    <div>
                      <strong>检索与阈值</strong>
                      <p>
                        Top-K {response.sources.length} 条，阈值判断：
                        {response.reliable ? "通过" : "未通过"}
                      </p>
                    </div>
                    <div>
                      <strong>Prompt 构造</strong>
                      <p>{truncate(response.prompt, 180)}</p>
                    </div>
                    <div>
                      <strong>模型执行</strong>
                      <p>{response.model_status}</p>
                    </div>
                    <div>
                      <strong>记录落库</strong>
                      <p>
                        {response.record_status}
                        {response.record_id ? ` / ID ${response.record_id}` : ""}
                      </p>
                    </div>
                  </section>

                  <p>{response.answer}</p>

                  <section className="feedback-panel" aria-label="游客反馈">
                    <div className="feedback-header">
                      <strong>这次回答对你有帮助吗？</strong>
                      {feedbackStatus?.recordId === response.record_id ? (
                        <span className="panel-note">
                          已反馈：{feedbackStatus.rating === "helpful" ? "有帮助" : "没有帮助"}
                        </span>
                      ) : null}
                    </div>
                    <div className="feedback-actions">
                      <button
                        type="button"
                        className={
                          feedbackStatus?.rating === "helpful"
                            ? "feedback-button active"
                            : "feedback-button"
                        }
                        onClick={() => void submitFeedback("helpful")}
                        disabled={isSubmittingFeedback}
                      >
                        有帮助
                      </button>
                      <button
                        type="button"
                        className={
                          feedbackStatus?.rating === "unhelpful"
                            ? "feedback-button active"
                            : "feedback-button"
                        }
                        onClick={() => void submitFeedback("unhelpful")}
                        disabled={isSubmittingFeedback}
                      >
                        没有帮助
                      </button>
                    </div>
                    <label className="feedback-note" htmlFor="feedback-note">
                      补充说明
                    </label>
                    <textarea
                      id="feedback-note"
                      value={feedbackText}
                      onChange={(event) => setFeedbackText(event.target.value)}
                      rows={3}
                      placeholder="可选：补充你觉得还缺什么信息"
                    />
                  </section>

                  <h3>当前会话记录</h3>
                  {currentSessionRecordsLoading ? (
                    <div className="empty-state">正在读取当前会话记录...</div>
                  ) : currentSessionRecords.length > 0 ? (
                    <div className="conversation-list">
                      {currentSessionRecords.map((record) => (
                        <section key={record.id} className="conversation-turn">
                          <div className="conversation-bubble user">
                            <strong>游客</strong>
                            <p>{record.original_question}</p>
                          </div>
                          <div className="conversation-bubble ai">
                            <strong>数字人</strong>
                            <p>{record.answer}</p>
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">本轮还没有更多会话历史。</div>
                  )}

                  <h3>参考资料</h3>
                  <div className="source-list">
                    {response.sources.length > 0 ? (
                      response.sources.map((source, index) => (
                        <section key={`${source.source}-${index}`} className="source-item">
                          <strong>
                            资料 {index + 1} / 匹配分 {source.score} / 置信度{" "}
                            {(source.confidence * 100).toFixed(0)}%
                          </strong>
                          <p>{source.text}</p>
                          <small>{source.source}</small>
                        </section>
                      ))
                    ) : (
                      <div className="empty-state">本次回答没有可展示的参考片段。</div>
                    )}
                  </div>
                </article>
              ) : (
                <div className="empty-state">
                  选择一个示例问题，或输入你想了解的景区内容。
                </div>
              )}
            </>
          ) : (
            <section className="admin-panel" aria-label="管理后台">
              <section className="stats-grid">
                {stats.map((stat) => (
                  <article key={stat.label} className="stat-card">
                    <small>{stat.label}</small>
                    <strong>{stat.value}</strong>
                    <p>{stat.helper}</p>
                  </article>
                ))}
              </section>

              <section className="feedback-stream-panel" aria-label="最近反馈">
                <div className="low-confidence-header">
                  <div>
                    <strong>最近反馈</strong>
                    <p>展示游客对回答的即时评价，方便判断哪些内容需要补充或优化。</p>
                  </div>
                  <span className="panel-note">
                    {feedbackLoading
                      ? "加载中..."
                      : `当前 ${feedbackRecords.length} 条 / 累计 ${feedbackTotalCount} 条`}
                  </span>
                </div>
                {feedbackRecords.length > 0 ? (
                  <div className="feedback-stream">
                    {feedbackRecords.map((record) => (
                      <article key={`feedback-${record.id}`} className="feedback-card">
                        <div className="record-row-top">
                          <strong>{record.original_question}</strong>
                          <span>{formatTimestamp(record.updated_at)}</span>
                        </div>
                        <div className="record-row-meta">
                          <span>{record.rating === "helpful" ? "有帮助" : "没有帮助"}</span>
                          <span>{record.session_id}</span>
                        </div>
                        <p>{truncate(record.answer, 90)}</p>
                        {record.feedback_text ? (
                          <small>备注：{record.feedback_text}</small>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    {feedbackLoading ? "正在读取反馈..." : "暂时还没有游客反馈。"}
                  </div>
                )}
              </section>

              <section className="low-confidence-panel" aria-label="低置信度问题池">
                <div className="low-confidence-header">
                  <div>
                    <strong>低置信度问题池</strong>
                    <p>
                      聚合展示 reliable=false、confidence 偏低或没有命中资料的提问，
                      方便继续补充知识库。
                    </p>
                  </div>
                  <span className="panel-note">
                    {lowConfidenceLoading
                      ? "加载中..."
                      : `当前 ${lowConfidenceRecords.length} 条 / 累计 ${lowConfidenceTotalCount} 条`}
                  </span>
                </div>

                {lowConfidenceRecords.length > 0 ? (
                  <div className="low-confidence-grid">
                    {lowConfidenceRecords.map((record) => (
                      <button
                        key={`low-confidence-${record.id}`}
                        type="button"
                        className="low-confidence-card"
                        onClick={() => focusRecordFromPool(record.id)}
                      >
                        <div className="record-row-top">
                          <strong>{record.original_question}</strong>
                          <span>{formatTimestamp(record.created_at)}</span>
                        </div>
                        <div className="record-row-meta">
                          <span>{record.issue_reason}</span>
                          <span>Top score {record.top_score.toFixed(2)}</span>
                          <span>{record.response_time_ms} ms</span>
                        </div>
                        <p>{truncate(record.answer, 88)}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    {lowConfidenceLoading
                      ? "正在加载低置信度问题..."
                      : "暂未发现低置信度问题，当前知识库命中情况比较稳定。"}
                  </div>
                )}
              </section>

              <KnowledgeManager />

              <section className="filters-panel" aria-label="问答记录筛选">
                <div className="filter-field filter-span-2">
                  <label htmlFor="keyword-filter">关键词</label>
                  <input
                    id="keyword-filter"
                    value={keywordFilter}
                    onChange={(event) => setKeywordFilter(event.target.value)}
                    placeholder="搜索问题、回答、模型状态"
                  />
                </div>
                <div className="filter-field">
                  <label htmlFor="session-filter">会话 ID</label>
                  <input
                    id="session-filter"
                    value={sessionFilter}
                    onChange={(event) => setSessionFilter(event.target.value)}
                    placeholder="按 session_id 筛选"
                  />
                </div>
                <div className="filter-field">
                  <label htmlFor="confidence-filter">置信度</label>
                  <select
                    id="confidence-filter"
                    value={confidenceFilter}
                    onChange={(event) =>
                      setConfidenceFilter(event.target.value as ConfidenceFilter)
                    }
                  >
                    <option value="all">全部</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="reliable-filter">可靠性</label>
                  <select
                    id="reliable-filter"
                    value={reliableFilter}
                    onChange={(event) =>
                      setReliableFilter(event.target.value as ReliableFilter)
                    }
                  >
                    <option value="all">全部</option>
                    <option value="reliable">可靠</option>
                    <option value="unreliable">资料不足</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="model-filter">模型状态</label>
                  <select
                    id="model-filter"
                    value={modelFilter}
                    onChange={(event) =>
                      setModelFilter(event.target.value as ModelFilter)
                    }
                  >
                    <option value="all">全部</option>
                    <option value="real">真实模型</option>
                    <option value="mock">Mock</option>
                    <option value="fallback">Fallback</option>
                  </select>
                </div>
                <div className="filter-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => void loadAdminData()}
                    disabled={
                      recordsLoading ||
                      overviewLoading ||
                      lowConfidenceLoading ||
                      feedbackLoading
                    }
                  >
                    {recordsLoading ||
                    overviewLoading ||
                    lowConfidenceLoading ||
                    feedbackLoading
                      ? "刷新中..."
                      : "刷新数据"}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={resetFilters}
                  >
                    重置筛选
                  </button>
                </div>
              </section>

              {adminErrors.map((message, index) => (
                <p key={`admin-error-${index}`} className="error-message">
                  {message}
                </p>
              ))}

              <section className="admin-workspace">
                <section className="records-table-panel" aria-label="问答记录列表">
                  <div className="records-table-header">
                    <strong>问答记录</strong>
                    <span>
                      当前筛选 {filteredRecords.length} 条 / 累计 {recordsTotalCount} 条
                    </span>
                  </div>

                  {filteredRecords.length > 0 ? (
                    <div className="records-table">
                      {filteredRecords.map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          className={
                            selectedDetailRecord?.id === record.id
                              ? "record-row active"
                              : "record-row"
                          }
                          onClick={() => setSelectedRecord(record)}
                        >
                          <div className="record-row-top">
                            <strong>{record.original_question}</strong>
                            <span>{formatTimestamp(record.created_at)}</span>
                          </div>
                          <div className="record-row-meta">
                            <span>{record.session_id}</span>
                            <span>{getModelLabel(record)}</span>
                            <span>{(record.confidence * 100).toFixed(0)}%</span>
                            <span>{record.response_time_ms} ms</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">当前筛选条件下没有记录。</div>
                  )}
                </section>

                <aside className="detail-panel" aria-label="记录详情">
                  {selectedDetailRecord ? (
                    <>
                      <div className="detail-heading">
                        <div>
                          <small>记录详情</small>
                          <h3>{selectedDetailRecord.original_question}</h3>
                        </div>
                        <div className="answer-meta">
                          <span>{selectedDetailRecord.session_id}</span>
                          <span>{getModelLabel(selectedDetailRecord)}</span>
                        </div>
                      </div>

                      <div className="detail-grid">
                        <div>
                          <strong>清洗后问题</strong>
                          <p>{selectedDetailRecord.cleaned_question}</p>
                        </div>
                        <div>
                          <strong>置信度 / 可靠性</strong>
                          <p>
                            {(selectedDetailRecord.confidence * 100).toFixed(0)}% /{" "}
                            {selectedDetailRecord.reliable ? "可靠" : "资料不足"}
                          </p>
                        </div>
                        <div>
                          <strong>来源数量 / 历史轮次</strong>
                          <p>
                            {selectedDetailRecord.source_count} 条 /{" "}
                            {selectedDetailRecord.history_turns_used} 轮
                          </p>
                        </div>
                        <div>
                          <strong>响应耗时</strong>
                          <p>{selectedDetailRecord.response_time_ms} ms</p>
                        </div>
                      </div>

                      <section className="detail-section">
                        <strong>导游式回答</strong>
                        <p>{selectedDetailRecord.answer}</p>
                      </section>

                      <section className="detail-section">
                        <div className="detail-section-head">
                          <strong>Prompt 摘要</strong>
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => setShowFullPrompt((value) => !value)}
                          >
                            {showFullPrompt ? "收起 Prompt" : "展开 Prompt"}
                          </button>
                        </div>
                        <p>
                          {showFullPrompt
                            ? selectedDetailRecord.prompt_text
                            : truncate(selectedDetailRecord.prompt_text, 220)}
                        </p>
                      </section>

                      <section className="detail-section">
                        <strong>参考资料</strong>
                        {selectedDetailRecord.sources.length > 0 ? (
                          <div className="source-list">
                            {selectedDetailRecord.sources.map((source, index) => (
                              <section
                                key={`${selectedDetailRecord.id}-${index}`}
                                className="source-item"
                              >
                                <strong>
                                  资料 {index + 1} / 匹配分 {source.score} / 置信度{" "}
                                  {(source.confidence * 100).toFixed(0)}%
                                </strong>
                                <p>{source.text}</p>
                                <small>{source.source}</small>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">
                            本条记录没有可展示的可靠资料片段。
                          </div>
                        )}
                      </section>

                      <section className="detail-section">
                        <strong>会话时间线</strong>
                        {selectedSessionLoading ? (
                          <div className="empty-state">正在读取该会话的完整对话...</div>
                        ) : selectedSessionRecords.length > 0 ? (
                          <div className="conversation-list">
                            {selectedSessionRecords.map((record) => (
                              <section key={record.id} className="conversation-turn">
                                <div className="conversation-bubble user">
                                  <strong>游客</strong>
                                  <p>{record.original_question}</p>
                                </div>
                                <div className="conversation-bubble ai">
                                  <strong>数字人</strong>
                                  <p>{record.answer}</p>
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">
                            该会话暂时没有可展示的时间线。
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <div className="empty-state">
                      选择左侧记录后，这里会显示完整详情。
                    </div>
                  )}
                </aside>
              </section>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
