import type { DashboardData } from "./types";

type DashboardPanelProps = {
  dashboard: DashboardData | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
};

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

function getBarWidth(value: number, maxValue: number): string {
  if (maxValue <= 0) {
    return "0%";
  }
  return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
}

export function DashboardPanel({
  dashboard,
  isLoading,
  error,
  onRefresh,
}: DashboardPanelProps) {
  const summary = dashboard?.summary;
  const weeklyTrend = dashboard?.weekly_service_trend ?? [];
  const popularQuestions = dashboard?.popular_questions ?? [];
  const satisfactionTrend = dashboard?.satisfaction_trend ?? [];
  const visitorAnalytics = dashboard?.visitor_analytics ?? {};
  const topAttractions = visitorAnalytics.top_attractions ?? [];
  const ageGroups = visitorAnalytics.age_groups ?? [];
  const genderDistribution = visitorAnalytics.gender_distribution ?? [];
  const maxServiceCount = Math.max(
    0,
    ...weeklyTrend.map((item) => item.service_count),
  );
  const maxPopularCount = Math.max(
    0,
    ...popularQuestions.map((item) => item.count),
  );

  const metrics = [
    {
      label: "本周服务人次",
      value: formatNumber(summary?.week_records),
      helper: "近 7 天问答服务总量",
    },
    {
      label: "今日 / 累计服务",
      value: `${formatNumber(summary?.today_records)} / ${formatNumber(
        summary?.total_records,
      )}`,
      helper: "当天服务与历史累计",
    },
    {
      label: "低置信问题",
      value: formatNumber(summary?.low_confidence_count),
      helper: "需要重点复核的回答",
    },
    {
      label: "满意度",
      value: formatPercent(summary?.feedback_helpful_rate),
      helper: `${formatNumber(summary?.feedback_helpful_count)} 有帮助 / ${formatNumber(
        summary?.feedback_total_count,
      )} 条反馈`,
    },
    {
      label: "平均响应",
      value: formatMs(summary?.average_response_time_ms),
      helper: "接口平均响应耗时",
    },
    {
      label: "评测准确率",
      value: formatPercent(summary?.accuracy_rate),
      helper: "最近一次标准测试集结果",
    },
    {
      label: "行为样本",
      value: formatNumber(visitorAnalytics.total_visits),
      helper: `${formatNumber(visitorAnalytics.unique_tourists)} 位游客 / 峰值 ${visitorAnalytics.peak_month || "--"}`,
    },
  ];

  return (
    <section className="dashboard-panel" aria-label="数据大屏">
      <div className="dashboard-head">
        <div>
          <p className="eyebrow">ADMIN DASHBOARD</p>
          <h3>数据大屏</h3>
          <p>汇总服务量、热门问题、低置信风险和满意度趋势。</p>
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? "刷新中..." : "刷新大屏"}
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="dashboard-metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className="dashboard-metric-card">
            <small>{metric.label}</small>
            <strong>{isLoading && dashboard === null ? "--" : metric.value}</strong>
            <p>{metric.helper}</p>
          </article>
        ))}
      </div>

      <div className="dashboard-workspace">
        <section className="dashboard-card service-trend-card">
          <div className="dashboard-card-head">
            <strong>7 天服务趋势</strong>
            <span>服务量 / 低置信 / 响应</span>
          </div>
          {weeklyTrend.length > 0 ? (
            <div className="service-trend-list">
              {weeklyTrend.map((item) => (
                <div key={item.date} className="service-trend-row">
                  <span className="trend-date">{formatDateLabel(item.date)}</span>
                  <div className="trend-bar-track" aria-hidden="true">
                    <span
                      className="trend-bar-fill"
                      style={{ width: getBarWidth(item.service_count, maxServiceCount) }}
                    />
                  </div>
                  <span className="trend-count">{item.service_count}</span>
                  <span className="trend-risk">{item.low_confidence_count} 低置信</span>
                  <span className="trend-latency">
                    {formatMs(item.average_response_time_ms)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {isLoading ? "正在加载服务趋势..." : "暂无 7 天服务趋势数据。"}
            </div>
          )}
        </section>

        <section className="dashboard-card popular-question-card">
          <div className="dashboard-card-head">
            <strong>热门问答排行</strong>
            <span>Top {popularQuestions.length}</span>
          </div>
          {popularQuestions.length > 0 ? (
            <div className="popular-question-list">
              {popularQuestions.map((item, index) => (
                <article key={`${item.question}-${index}`} className="popular-question-item">
                  <div className="popular-question-top">
                    <span>{index + 1}</span>
                    <strong>{item.question}</strong>
                    <em>{item.count} 次</em>
                  </div>
                  <div className="popular-bar-track" aria-hidden="true">
                    <span
                      className="popular-bar-fill"
                      style={{ width: getBarWidth(item.count, maxPopularCount) }}
                    />
                  </div>
                  <div className="popular-question-meta">
                    <span>置信 {formatPercent(item.average_confidence)}</span>
                    <span>有帮助 {item.helpful_count}</span>
                    <span>无帮助 {item.unhelpful_count}</span>
                    <span>最近 {item.latest_at.slice(0, 16).replace("T", " ")}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {isLoading ? "正在加载热门问答..." : "暂无热门问答数据。"}
            </div>
          )}
        </section>

        <section className="dashboard-card satisfaction-card">
          <div className="dashboard-card-head">
            <strong>满意度趋势</strong>
            <span>按天统计反馈</span>
          </div>
          {satisfactionTrend.length > 0 ? (
            <div className="satisfaction-trend-list">
              {satisfactionTrend.map((item) => (
                <div key={item.date} className="satisfaction-row">
                  <div className="satisfaction-row-head">
                    <strong>{formatDateLabel(item.date)}</strong>
                    <span>{formatPercent(item.helpful_rate)}</span>
                  </div>
                  <div className="satisfaction-stack" aria-hidden="true">
                    <span
                      className="satisfaction-helpful"
                      style={{
                        width:
                          item.feedback_count > 0
                            ? `${(item.helpful_count / item.feedback_count) * 100}%`
                            : "0%",
                      }}
                    />
                    <span
                      className="satisfaction-unhelpful"
                      style={{
                        width:
                          item.feedback_count > 0
                            ? `${(item.unhelpful_count / item.feedback_count) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <div className="satisfaction-meta">
                    <span>{item.feedback_count} 条反馈</span>
                    <span>{item.helpful_count} 有帮助</span>
                    <span>{item.unhelpful_count} 无帮助</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {isLoading ? "正在加载满意度趋势..." : "暂无满意度趋势数据。"}
            </div>
          )}
        </section>

        <section className="dashboard-card visitor-analytics-card">
          <div className="dashboard-card-head">
            <strong>行为数据概览</strong>
            <span>{visitorAnalytics.sheet_name || "xlsx"}</span>
          </div>
          {visitorAnalytics.total_visits ? (
            <>
              <div className="analytics-summary-grid">
                <article>
                  <small>平均停留</small>
                  <strong>{visitorAnalytics.average_stay_duration} h</strong>
                </article>
                <article>
                  <small>人均消费</small>
                  <strong>¥{formatNumber(visitorAnalytics.average_total_cost)}</strong>
                </article>
                <article>
                  <small>平均满意度</small>
                  <strong>{visitorAnalytics.average_satisfaction}</strong>
                </article>
                <article>
                  <small>平均同行</small>
                  <strong>{visitorAnalytics.average_group_size} 人</strong>
                </article>
              </div>
              <div className="analytics-list">
                <strong>热门景点</strong>
                {topAttractions.slice(0, 4).map((item) => (
                  <div key={item.label} className="analytics-row">
                    <span>{item.label}</span>
                    <em>{formatNumber(item.count)}</em>
                  </div>
                ))}
              </div>
              <div className="analytics-list">
                <strong>客群分布</strong>
                {[...ageGroups, ...genderDistribution].slice(0, 6).map((item) => (
                  <div key={item.label} className="analytics-row">
                    <span>{item.label}</span>
                    <em>{formatPercent(item.share)}</em>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              {isLoading ? "正在解析行为数据..." : "暂无可展示的行为数据。"}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
