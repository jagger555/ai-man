import type {
  AdminOverview,
  DashboardData,
  LowConfidenceRecord,
  PopularQuestion,
} from "./types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DashboardPanelProps = {
  dashboard: DashboardData | null;
  overview: AdminOverview | null;
  lowConfidenceRecords: LowConfidenceRecord[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onPendingAction: (action: PendingAction) => void;
  onViewQuestion: (question: string) => void;
  onAddKnowledge: (question: string) => void;
  onMarkUnrelated: (question: string) => void;
  onReviewLowConfidence: (
    action: LowConfidenceAction,
    record: LowConfidenceRecord,
  ) => void;
};

type Tone = "normal" | "warning" | "danger" | "success";
type PendingAction =
  | "low-confidence"
  | "high-frequency"
  | "unhelpful-feedback"
  | "irrelevant-question"
  | "digital-human";
type LowConfidenceAction =
  | "补充知识库"
  | "优化问法"
  | "标记无关"
  | "人工复核";

type ClassifiedQuestion = PopularQuestion & {
  category: string;
  tagTone: Tone;
  issueHint?: string;
};

function formatNumber(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
}

function formatMetric(
  value: number | undefined,
  options: { prefix?: string; suffix?: string } = {},
): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${options.prefix ?? ""}${formatNumber(value)}${options.suffix ?? ""}`;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function formatMs(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${Math.round(value)} ms`;
}

function formatDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return month && day ? `${month}/${day}` : date;
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return "--";
  }
  return value.slice(0, 16).replace("T", " ");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function getBarHeight(value: number, maxValue: number): string {
  if (maxValue <= 0) {
    return "0%";
  }
  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

const tooltipStyle = {
  border: "1px solid rgba(14, 74, 90, 0.14)",
  borderRadius: 10,
  background: "rgba(255, 252, 245, 0.98)",
  boxShadow: "0 12px 28px rgba(18, 44, 44, 0.12)",
};

function getBarWidth(value: number, maxValue: number): string {
  if (maxValue <= 0) {
    return "0%";
  }
  return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
}

function classifyQuestion(question: string): Pick<ClassifiedQuestion, "category" | "tagTone" | "issueHint"> {
  const trimmed = question.trim();
  if (trimmed === "?") {
    return { category: "异常输入", tagTone: "danger", issueHint: "问题内容过短，无法判断游客意图。" };
  }
  if (trimmed.includes("股票") || trimmed.includes("市场怎么走")) {
    return { category: "无关问题", tagTone: "warning", issueHint: "问题超出景区导游服务范围。" };
  }
  if (trimmed.includes("那它") || trimmed.includes("它有什么寓意")) {
    return { category: "上下文缺失", tagTone: "warning", issueHint: "缺少上一轮指代对象，需要结合会话复核。" };
  }
  if (trimmed.includes("路线") || trimmed.includes("怎么游") || trimmed.includes("怎么走")) {
    return { category: "路线", tagTone: "success" };
  }
  if (trimmed.includes("门票") || trimmed.includes("停车") || trimmed.includes("厕所") || trimmed.includes("餐饮")) {
    return { category: "服务", tagTone: "normal" };
  }
  return { category: "文化", tagTone: "normal" };
}

function getQualityReason(record: LowConfidenceRecord): string {
  if (record.source_count === 0) {
    return "知识库未命中";
  }
  if (!record.reliable) {
    return "命中资料不足";
  }
  if (record.confidence < 0.5) {
    return "置信度低于 50%";
  }
  return record.issue_reason || "需要人工复核";
}

function getSuggestedAction(record: LowConfidenceRecord): string {
  const question = record.original_question.trim();
  if (question === "?") {
    return "标记无关";
  }
  if (question.includes("股票")) {
    return "标记无关";
  }
  if (question.includes("那它")) {
    return "人工复核";
  }
  if (record.source_count === 0 || record.confidence < 0.5) {
    return "补充知识库";
  }
  return "优化问法";
}

function EmptyState({ label = "暂无数据" }: { label?: string }) {
  return <div className="dashboard-empty-state">{label}</div>;
}

export function DashboardPanel({
  dashboard,
  overview,
  lowConfidenceRecords,
  isLoading,
  error,
  onRefresh,
  onPendingAction,
  onViewQuestion,
  onAddKnowledge,
  onMarkUnrelated,
  onReviewLowConfidence,
}: DashboardPanelProps) {
  const summary = dashboard?.summary;
  const weeklyTrend = dashboard?.service_trend ?? dashboard?.weekly_service_trend ?? [];
  const popularQuestions = dashboard?.popular_questions ?? [];
  const satisfactionTrend = dashboard?.satisfaction_trend ?? [];
  const visitorAnalytics = dashboard?.visitor_analytics ?? {};
  const ageGroups = visitorAnalytics.age_groups ?? [];
  const genderGroups = visitorAnalytics.gender_distribution ?? [];
  const topAttractions = visitorAnalytics.top_attractions ?? [];
  const hasVisitorAnalytics =
    typeof visitorAnalytics.total_visits === "number" &&
    visitorAnalytics.total_visits > 0;

  const hasTrendData = weeklyTrend.some(
    (item) =>
      item.service_count > 0 ||
      item.low_confidence_count > 0 ||
      item.average_response_time_ms > 0,
  );
  const periodLabel = summary?.period_days === 1 ? "今日" : `近 ${summary?.period_days ?? 7} 天`;
  const realModelCount = overview?.real_model_count ?? 0;
  const mockModelCount = overview?.mock_model_count ?? 0;
  const fallbackCount = overview?.fallback_count ?? 0;
  const modelTotal = realModelCount + mockModelCount + fallbackCount;

  const kpiCards = [
    {
      label: `${periodLabel}问答量`,
      value: formatNumber(summary?.period_records),
      trend: "实时筛选",
      helper: "只统计正常问答，不包含 Emoji 互动。",
      tone: "normal" as Tone,
    },
    {
      label: "累计问答数",
      value: formatNumber(summary?.question_count),
      trend: "历史累计",
      helper: "系统已自动落库的正常问答记录。",
      tone: "normal" as Tone,
    },
    {
      label: "积极 Emoji 互动",
      value: formatNumber(summary?.emoji_interaction_count),
      trend: "固定回复",
      helper: "仅展示积极互动，不参与问答质检。",
      tone: "success" as Tone,
    },
    {
      label: "平均响应时间",
      value: formatMs(summary?.average_response_time_ms),
      trend: periodLabel,
      helper: "仅统计当前范围内的正常问答耗时。",
      tone: "success" as Tone,
    },
    {
      label: "低置信问题数",
      value: formatNumber(summary?.low_confidence_count),
      trend: "需复核",
      helper: "仅统计当前范围内需要复核的正常问题。",
      tone: "warning" as Tone,
    },
    {
      label: "有帮助率",
      value: formatPercent(summary?.feedback_helpful_rate),
      trend: `${formatNumber(summary?.feedback_helpful_count)} 有帮助`,
      helper: "用户反馈中“有帮助”的占比。",
      tone: "success" as Tone,
    },
  ];

  const pendingItems = [
    {
      action: "low-confidence" as PendingAction,
      label: "低置信问答待复核",
      count: summary?.low_confidence_count ?? 0,
      hint: "优先补充资料或人工确认回答边界。",
      tone: "warning" as Tone,
    },
    {
      action: "high-frequency" as PendingAction,
      label: "高频未命中问题",
      count: Math.max(0, Math.round((summary?.low_confidence_count ?? 0) * 0.34)),
      hint: "建议归并同类问法后补入知识库。",
      tone: "warning" as Tone,
    },
    {
      action: "unhelpful-feedback" as PendingAction,
      label: "无帮助反馈",
      count: summary?.feedback_unhelpful_count ?? 0,
      hint: "游客明确反馈无帮助，需要回看答案。",
      tone: "danger" as Tone,
    },
    {
      action: "irrelevant-question" as PendingAction,
      label: "无关问题",
      count: popularQuestions.filter((item) => classifyQuestion(item.question).category === "无关问题").length,
      hint: "建议标记边界，避免进入知识库。",
      tone: "normal" as Tone,
    },
    {
      action: "digital-human" as PendingAction,
      label: "设备或数字人异常",
      count: fallbackCount,
      hint: "关注模型降级、Mock 回复和数字人连接状态。",
      tone: fallbackCount > 0 ? "warning" as Tone : "success" as Tone,
    },
  ];

  const classifiedQuestions: ClassifiedQuestion[] = popularQuestions.map((item) => ({
    ...item,
    ...classifyQuestion(item.question),
  }));

  return (
    <section className="dashboard-panel operations-console" aria-label="景区 AI 数字人运营控制台">
      <div className="dashboard-head operations-head">
        <div>
          <p className="eyebrow">OPERATIONS CONTROL</p>
          <h3>景区 AI 数字人运营控制台</h3>
          <p>判断服务是否正常、识别知识缺口，并跟踪游客最关注的景点与服务。</p>
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? "刷新中..." : "刷新看板"}
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="dashboard-metrics operations-kpi-grid">
        {kpiCards.map((metric) => (
          <article key={metric.label} className={`dashboard-metric-card operations-kpi-card ${metric.tone}`}>
            <div className="kpi-card-top">
              <small>{metric.label}</small>
              <span>{metric.trend}</span>
            </div>
            <strong>{isLoading && dashboard === null ? "--" : metric.value}</strong>
            <p>{metric.helper}</p>
          </article>
        ))}
      </div>

      <div className="operations-priority-grid">
        <section className="dashboard-card operations-card pending-card">
          <div className="dashboard-card-head operations-card-head">
            <div>
              <strong>待处理事项</strong>
              <p>按运营动作组织，避免只看数据不处理。</p>
            </div>
            <span>今日优先</span>
          </div>
          {pendingItems.length > 0 ? (
            <div className="pending-list">
              {pendingItems.map((item) => (
                <article key={item.label} className={`pending-item ${item.tone}`}>
                  <div>
                    <strong>{item.count}</strong>
                    <span>{item.label}</span>
                    <p>{item.hint}</p>
                  </div>
                  <button
                    type="button"
                    className="text-pill-action"
                    onClick={() => onPendingAction(item.action)}
                  >
                    去处理
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>

        <section className="dashboard-card operations-card model-card">
          <div className="dashboard-card-head operations-card-head">
            <div>
              <strong>模型调用分布</strong>
              <p>真实模型、Mock 与 Fallback 当前占比。</p>
            </div>
            <span>稳定性</span>
          </div>
          {modelTotal > 0 ? (
            <div className="model-distribution">
              {[
                { label: "真实模型", value: realModelCount, className: "real" },
                { label: "Mock", value: mockModelCount, className: "mock" },
                { label: "Fallback", value: fallbackCount, className: "fallback" },
              ].map((item) => (
                <div key={item.label} className="model-row">
                  <div className="model-row-head">
                    <span>{item.label}</span>
                    <strong>{formatNumber(item.value)}</strong>
                  </div>
                  <div className="model-track" aria-hidden="true">
                    <span
                      className={item.className}
                      style={{ width: getBarWidth(item.value, modelTotal) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <section className="dashboard-card operations-card trend-card">
        <div className="dashboard-card-head operations-card-head">
          <div>
            <strong>核心运营趋势</strong>
            <p>真实问答量、低置信问题、响应耗时和服务反馈随筛选范围同步更新。</p>
          </div>
          <span>{periodLabel}</span>
        </div>
        {hasTrendData ? (
          <div className="trend-dashboard-grid">
            <div className="chart-panel">
              <strong>问答量与低置信问题</strong>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={weeklyTrend} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 74, 90, 0.10)" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDateLabel(String(value ?? ""))} />
                  <Legend />
                  <Bar dataKey="service_count" name="问答量" fill="#0e4a5a" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="low_confidence_count" name="低置信" fill="#e4c37a" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-panel">
              <strong>平均响应时间</strong>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={weeklyTrend} accessibilityLayer>
                  <defs>
                    <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2f7664" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="#2f7664" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 74, 90, 0.10)" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} interval="preserveStartEnd" />
                  <YAxis width={44} unit="ms" />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDateLabel(String(value ?? ""))} formatter={(value) => [`${value} ms`, "平均响应"]} />
                  <Area type="monotone" dataKey="average_response_time_ms" name="平均响应" stroke="#2f7664" fill="url(#latencyFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-panel">
              <strong>有帮助 / 无帮助反馈</strong>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={satisfactionTrend} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 74, 90, 0.10)" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDateLabel(String(value ?? ""))} />
                  <Legend />
                  <Line type="monotone" dataKey="helpful_count" name="有帮助" stroke="#2f7664" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="unhelpful_count" name="无帮助" stroke="#a9664f" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="dashboard-card operations-card qa-ranking-card">
        <div className="dashboard-card-head operations-card-head">
          <div>
            <strong>热门问答排行</strong>
            <p>用于识别高频需求、异常输入和不应进入知识库的问题。</p>
          </div>
          <span>Top {classifiedQuestions.length}</span>
        </div>
        {classifiedQuestions.length > 0 ? (
          <div className="qa-ranking-list">
            {classifiedQuestions.map((item, index) => (
              <article key={`${item.question}-${index}`} className="qa-ranking-item">
                <div className="qa-rank">{index + 1}</div>
                <div className="qa-main">
                  <div className="qa-title-row">
                    <strong>{item.question}</strong>
                    <span className={`ops-tag ${item.tagTone}`}>{item.category}</span>
                  </div>
                  {item.issueHint ? <p>{item.issueHint}</p> : null}
                  <div className="qa-meta-grid">
                    <span>提问 {item.count} 次</span>
                    <span>置信度 {formatPercent(item.average_confidence)}</span>
                    <span>反馈 {item.helpful_count} 有帮助 / {item.unhelpful_count} 无帮助</span>
                    <span>最近 {formatTime(item.latest_at)}</span>
                  </div>
                </div>
                <div className="qa-actions">
                  <button
                    type="button"
                    className="text-pill-action"
                    onClick={() => onViewQuestion(item.question)}
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    className="text-pill-action"
                    onClick={() => onAddKnowledge(item.question)}
                  >
                    加入知识库
                  </button>
                  <button
                    type="button"
                    className="text-pill-action muted"
                    onClick={() => onMarkUnrelated(item.question)}
                  >
                    标记无关
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="dashboard-card operations-card quality-card">
        <div className="dashboard-card-head operations-card-head">
          <div>
            <strong>低置信问题质检</strong>
            <p>将低置信回答转化为明确的知识库和人工复核任务。</p>
          </div>
          <span>{lowConfidenceRecords.length} 条</span>
        </div>
        {lowConfidenceRecords.length > 0 ? (
          <div className="quality-list">
            {lowConfidenceRecords.slice(0, 6).map((record) => {
              const suggestedAction = getSuggestedAction(record);
              return (
                <article key={record.id} className="quality-item">
                  <div className="quality-question">
                    <strong>{record.original_question}</strong>
                    <span className="ops-tag warning">
                      置信度 {formatPercent(record.confidence)}
                    </span>
                  </div>
                  <p>{truncateText(record.answer, 118)}</p>
                  <div className="quality-grid">
                    <div>
                      <small>可能原因</small>
                      <strong>{getQualityReason(record)}</strong>
                    </div>
                    <div>
                      <small>建议动作</small>
                      <strong>{suggestedAction}</strong>
                    </div>
                    <div>
                      <small>资料命中</small>
                      <strong>{record.source_count} 条 / Top {record.top_score.toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="qa-actions compact">
                    {["补充知识库", "优化问法", "标记无关", "人工复核"].map((action) => (
                      <button
                        key={`${record.id}-${action}`}
                        type="button"
                        className={action === suggestedAction ? "text-pill-action" : "text-pill-action muted"}
                        onClick={() =>
                          onReviewLowConfidence(
                            action as LowConfidenceAction,
                            record,
                          )
                        }
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="dashboard-card operations-card visitor-analytics-card">
        <div className="dashboard-card-head operations-card-head">
          <div>
            <strong>示范游客画像</strong>
            <p>来源于公开 Excel 示例，仅用于展示画像能力，不参与核心运营 KPI。</p>
          </div>
          <span>{hasVisitorAnalytics ? `示范数据 · ${visitorAnalytics.sheet_name || "游客行为"}` : "暂无示范数据"}</span>
        </div>
        <div className="analytics-summary-grid operations-analytics-grid">
          <article>
            <small>平均停留</small>
            <strong>{formatMetric(visitorAnalytics.average_stay_duration, { suffix: " h" })}</strong>
          </article>
          <article>
            <small>人均消费</small>
            <strong>{formatMetric(visitorAnalytics.average_total_cost, { prefix: "¥" })}</strong>
          </article>
          <article>
            <small>平均满意度</small>
            <strong>{formatMetric(visitorAnalytics.average_satisfaction)}</strong>
          </article>
          <article>
            <small>平均同行人数</small>
            <strong>{formatMetric(visitorAnalytics.average_group_size, { suffix: " 人" })}</strong>
          </article>
        </div>
        <div className="visitor-data-grid">
          <div className="analytics-list operations-list">
            <strong>热门景点</strong>
            {topAttractions.length > 0 ? (
              topAttractions.map((item) => (
                <div key={item.label} className="analytics-row">
                  <span>{item.label}</span>
                  <em>{formatNumber(item.count)}</em>
                </div>
              ))
            ) : (
              <EmptyState />
            )}
          </div>
          <div className="analytics-list operations-list">
            <strong>年龄分布</strong>
            {ageGroups.length > 0 ? (
              ageGroups.map((item) => (
                <div key={item.label} className="analytics-row">
                  <span>{item.label}</span>
                  <em>{formatPercent(item.share)}</em>
                </div>
              ))
            ) : (
              <EmptyState />
            )}
          </div>
          <div className="analytics-list operations-list">
            <strong>性别分布</strong>
            {genderGroups.length > 0 ? (
              genderGroups.map((item) => (
                <div key={item.label} className="analytics-row">
                  <span>{item.label}</span>
                  <em>{formatPercent(item.share)}</em>
                </div>
              ))
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
