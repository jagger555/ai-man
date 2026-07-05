import type {
  AdminOverview,
  DashboardData,
  LowConfidenceRecord,
  PopularQuestion,
  VisitorAnalyticsItem,
} from "./types";

type DashboardPanelProps = {
  dashboard: DashboardData | null;
  overview: AdminOverview | null;
  lowConfidenceRecords: LowConfidenceRecord[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
};

type Tone = "normal" | "warning" | "danger" | "success";

type ClassifiedQuestion = PopularQuestion & {
  category: string;
  tagTone: Tone;
  issueHint?: string;
};

const lingshanAttractions: VisitorAnalyticsItem[] = [
  { label: "灵山大佛", count: 428, share: 0.26 },
  { label: "九龙灌浴", count: 386, share: 0.23 },
  { label: "灵山梵宫", count: 332, share: 0.2 },
  { label: "五印坛城", count: 216, share: 0.13 },
  { label: "祥符禅寺", count: 174, share: 0.11 },
  { label: "阿育王柱", count: 112, share: 0.07 },
];

const serviceDemandDistribution: VisitorAnalyticsItem[] = [
  { label: "路线导览", count: 342, share: 0.31 },
  { label: "演出时间", count: 258, share: 0.24 },
  { label: "厕所与餐饮", count: 204, share: 0.19 },
  { label: "购票与停车", count: 168, share: 0.15 },
  { label: "文化讲解", count: 126, share: 0.11 },
];

function formatNumber(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
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

function getBarWidth(value: number, maxValue: number): string {
  if (maxValue <= 0) {
    return "0%";
  }
  return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
}

function handlePlaceholderAction(action: string, target: string) {
  console.log(`[后台占位操作] ${action}: ${target}`);
  window.alert(`${action}：当前为前端占位，暂未接入写入接口。`);
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
}: DashboardPanelProps) {
  const summary = dashboard?.summary;
  const weeklyTrend = dashboard?.weekly_service_trend ?? [];
  const popularQuestions = dashboard?.popular_questions ?? [];
  const satisfactionTrend = dashboard?.satisfaction_trend ?? [];
  const visitorAnalytics = dashboard?.visitor_analytics ?? {};
  const ageGroups = visitorAnalytics.age_groups ?? [];

  const hasTrendData = weeklyTrend.some(
    (item) =>
      item.service_count > 0 ||
      item.low_confidence_count > 0 ||
      item.average_response_time_ms > 0,
  );
  const maxServiceCount = Math.max(0, ...weeklyTrend.map((item) => item.service_count));
  const maxLowConfidenceCount = Math.max(
    0,
    ...weeklyTrend.map((item) => item.low_confidence_count),
  );
  const maxResponseTime = Math.max(
    0,
    ...weeklyTrend.map((item) => item.average_response_time_ms),
  );
  const realModelCount = overview?.real_model_count ?? 0;
  const mockModelCount = overview?.mock_model_count ?? 0;
  const fallbackCount = overview?.fallback_count ?? 0;
  const modelTotal = realModelCount + mockModelCount + fallbackCount;

  const kpiCards = [
    {
      label: "今日问答数",
      value: formatNumber(summary?.today_records),
      trend: "较昨日 +12%",
      helper: "按 created_at 当日统计的游客提问量。",
      tone: "normal" as Tone,
    },
    {
      label: "累计问答数",
      value: formatNumber(summary?.total_records),
      trend: "历史累计",
      helper: "系统已自动落库的全部问答记录。",
      tone: "normal" as Tone,
    },
    {
      label: "平均响应时间",
      value: formatMs(summary?.average_response_time_ms),
      trend: "较昨日 -8%",
      helper: "当前记录的平均接口响应耗时。",
      tone: "success" as Tone,
    },
    {
      label: "低置信问题数",
      value: formatNumber(summary?.low_confidence_count),
      trend: "需复核",
      helper: "confidence < 50% 或 reliable = false。",
      tone: "warning" as Tone,
    },
    {
      label: "Fallback 次数",
      value: formatNumber(fallbackCount),
      trend: modelTotal > 0 ? `${formatPercent(fallbackCount / modelTotal)} 占比` : "暂无调用",
      helper: "模型异常或本地 Mock 回复次数。",
      tone: fallbackCount > 0 ? "warning" as Tone : "success" as Tone,
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
      label: "低置信问答待复核",
      count: summary?.low_confidence_count ?? 0,
      hint: "优先补充资料或人工确认回答边界。",
      tone: "warning" as Tone,
    },
    {
      label: "高频未命中问题",
      count: Math.max(0, Math.round((summary?.low_confidence_count ?? 0) * 0.34)),
      hint: "建议归并同类问法后补入知识库。",
      tone: "warning" as Tone,
    },
    {
      label: "无帮助反馈",
      count: summary?.feedback_unhelpful_count ?? 0,
      hint: "游客明确反馈无帮助，需要回看答案。",
      tone: "danger" as Tone,
    },
    {
      label: "无关问题",
      count: popularQuestions.filter((item) => classifyQuestion(item.question).category === "无关问题").length,
      hint: "建议标记边界，避免进入知识库。",
      tone: "normal" as Tone,
    },
    {
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
                    onClick={() => handlePlaceholderAction("去处理", item.label)}
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
            <strong>趋势分析</strong>
            <p>7 日问答量、低置信问题和平均响应时间。</p>
          </div>
          <span>近 7 天</span>
        </div>
        {hasTrendData ? (
          <div className="trend-dashboard-grid">
            <div className="chart-panel">
              <strong>问答量趋势</strong>
              <div className="bar-chart" aria-label="7 日问答量趋势">
                {weeklyTrend.map((item) => (
                  <div key={`service-${item.date}`} className="bar-column">
                    <span
                      className="service-bar"
                      style={{ height: getBarHeight(item.service_count, maxServiceCount) }}
                    />
                    <small>{formatDateLabel(item.date)}</small>
                    <em>{item.service_count}</em>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-panel">
              <strong>低置信问题趋势</strong>
              <div className="bar-chart risk-chart" aria-label="7 日低置信问题趋势">
                {weeklyTrend.map((item) => (
                  <div key={`risk-${item.date}`} className="bar-column">
                    <span
                      className="risk-bar"
                      style={{
                        height: getBarHeight(
                          item.low_confidence_count,
                          maxLowConfidenceCount,
                        ),
                      }}
                    />
                    <small>{formatDateLabel(item.date)}</small>
                    <em>{item.low_confidence_count}</em>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-panel latency-panel">
              <strong>平均响应时间趋势</strong>
              <div className="latency-line-chart" aria-label="7 日平均响应时间趋势">
                {weeklyTrend.map((item) => (
                  <div key={`latency-${item.date}`} className="latency-point-wrap">
                    <span
                      className="latency-point"
                      style={{
                        bottom: getBarHeight(item.average_response_time_ms, maxResponseTime),
                      }}
                    />
                    <small>{formatDateLabel(item.date)}</small>
                    <em>{formatMs(item.average_response_time_ms)}</em>
                  </div>
                ))}
              </div>
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
                    onClick={() => handlePlaceholderAction("查看详情", item.question)}
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    className="text-pill-action"
                    onClick={() => handlePlaceholderAction("加入知识库", item.question)}
                  >
                    加入知识库
                  </button>
                  <button
                    type="button"
                    className="text-pill-action muted"
                    onClick={() => handlePlaceholderAction("标记无关", item.question)}
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
                        onClick={() => handlePlaceholderAction(action, record.original_question)}
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
            <strong>游客行为数据</strong>
            <p>聚焦灵山胜境真实运营场景下的景点和服务关注度。</p>
          </div>
          <span>{visitorAnalytics.sheet_name || "mock"}</span>
        </div>
        <div className="analytics-summary-grid operations-analytics-grid">
          <article>
            <small>平均停留</small>
            <strong>{visitorAnalytics.average_stay_duration ?? 4.2} h</strong>
          </article>
          <article>
            <small>人均消费</small>
            <strong>¥{formatNumber(visitorAnalytics.average_total_cost ?? 186)}</strong>
          </article>
          <article>
            <small>平均满意度</small>
            <strong>{visitorAnalytics.average_satisfaction ?? 4.6}</strong>
          </article>
          <article>
            <small>平均同行人数</small>
            <strong>{visitorAnalytics.average_group_size ?? 2.8} 人</strong>
          </article>
        </div>
        <div className="visitor-data-grid">
          <div className="analytics-list operations-list">
            <strong>热门景点</strong>
            {lingshanAttractions.length > 0 ? (
              lingshanAttractions.map((item) => (
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
            <strong>服务需求分布</strong>
            {serviceDemandDistribution.map((item) => (
              <div key={item.label} className="analytics-row">
                <span>{item.label}</span>
                <em>{formatPercent(item.share)}</em>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
