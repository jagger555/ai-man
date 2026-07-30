import { Activity, Clock3, MousePointerClick, ShieldCheck, UsersRound } from "lucide-react";
import type { VisitorInsights, VisitorReport } from "./types";

export function VisitorInsightsPanel({
  insights,
  report,
  isLoading,
  error,
  onRefresh,
}: {
  insights: VisitorInsights | null;
  report: VisitorReport | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const summary = insights?.summary;
  const maxPageViews = Math.max(1, ...(insights?.page_engagement.map((item) => item.views) ?? [0]));
  const maxDailyEvents = Math.max(1, ...(insights?.daily_trend.map((item) => item.events) ?? [0]));
  const funnelBase = Math.max(1, insights?.journey_funnel[0]?.sessions ?? 0);

  return (
    <section className="visitor-insights-panel" aria-label="匿名游客行为洞察">
      <header className="insight-hero">
        <div>
          <p className="eyebrow">VISITOR INTELLIGENCE</p>
          <h2>游客洞察</h2>
          <p>从匿名访问、功能去向和服务动作中识别真实需求，不采集游客身份信息。</p>
        </div>
        <div className="insight-hero-actions">
          <span><ShieldCheck size={15} aria-hidden="true" /> 匿名会话 · 保留 {insights?.data_policy.retention_days ?? 90} 天</span>
          <button type="button" className="secondary-action" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? "分析中..." : "刷新洞察"}
          </button>
        </div>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="insight-metric-ribbon" aria-label="游客洞察关键指标">
        <article>
          <UsersRound size={19} aria-hidden="true" />
          <div><span>匿名访问会话</span><strong>{summary?.anonymous_sessions ?? 0}</strong></div>
          <small>{summary?.event_count ?? 0} 个行为事件</small>
        </article>
        <article>
          <Activity size={19} aria-hidden="true" />
          <div><span>功能页触达</span><strong>{formatPercent(summary?.feature_reach_rate ?? 0)}</strong></div>
          <small>{summary?.feature_sessions ?? 0} 个会话进入专页</small>
        </article>
        <article>
          <MousePointerClick size={19} aria-hidden="true" />
          <div><span>服务动作率</span><strong>{formatPercent(summary?.action_rate ?? 0)}</strong></div>
          <small>{summary?.action_sessions ?? 0} 个会话发起动作</small>
        </article>
        <article>
          <Clock3 size={19} aria-hidden="true" />
          <div><span>平均会话时长</span><strong>{summary?.average_session_minutes ?? 0}<i> 分钟</i></strong></div>
          <small>按匿名事件首尾时间计算</small>
        </article>
      </section>

      <div className="insight-workspace">
        <section className="insight-page-board">
          <div className="insight-section-head">
            <div><strong>页面吸引力</strong><span>访问次数、独立会话与停留时间放在同一视图比较</span></div>
            <em>近 {summary?.period_days ?? 7} 天</em>
          </div>
          <div className="page-engagement-list">
            {insights?.page_engagement.map((item) => (
              <article key={item.page}>
                <div className="page-engagement-name"><strong>{item.label}</strong><span>{item.unique_sessions} 个会话</span></div>
                <div className="page-engagement-track"><i style={{ width: `${Math.max(item.views ? 6 : 0, item.views / maxPageViews * 100)}%` }} /></div>
                <b>{item.views}</b>
                <small>{item.average_dwell_seconds > 0 ? formatDuration(item.average_dwell_seconds) : "尚无停留样本"}</small>
              </article>
            )) ?? null}
          </div>
        </section>

        <aside className="insight-funnel-board">
          <div className="insight-section-head"><div><strong>访问到行动</strong><span>判断产品是否真正推动游客下一步</span></div></div>
          <div className="journey-funnel">
            {insights?.journey_funnel.map((item, index) => (
              <article key={item.stage} style={{ width: `${Math.max(42, item.sessions / funnelBase * 100)}%` }}>
                <i>{String(index + 1).padStart(2, "0")}</i><span>{item.stage}</span><strong>{item.sessions}</strong>
              </article>
            )) ?? null}
          </div>
        </aside>

        <section className="insight-demand-board">
          <div className="insight-section-head">
            <div><strong>游客需求主题</strong><span>问答主题与功能行为互相印证</span></div>
            <em>{report?.summary.question_count ?? 0} 条问答</em>
          </div>
          <div className="demand-topic-list">
            {(report?.focus_points ?? []).slice(0, 6).map((item, index) => (
              <article key={item.topic}>
                <i>{index + 1}</i>
                <div><strong>{item.topic}</strong><span>{item.sample_questions[0] || "暂无示例问题"}</span></div>
                <b>{item.count}</b>
              </article>
            ))}
            {!report?.focus_points.length ? <div className="empty-state">问答样本积累后将在这里形成需求主题。</div> : null}
          </div>
        </section>

        <section className="insight-trend-board">
          <div className="insight-section-head"><div><strong>每日活跃走势</strong><span>金色为服务动作，绿色为全部行为</span></div></div>
          <div className="insight-daily-chart" aria-label="每日匿名行为走势">
            {insights?.daily_trend.map((item) => (
              <article key={item.date}>
                <div>
                  <i style={{ height: `${Math.max(item.events ? 8 : 0, item.events / maxDailyEvents * 100)}%` }} />
                  <b style={{ height: `${Math.max(item.actions ? 6 : 0, item.actions / maxDailyEvents * 100)}%` }} />
                </div>
                <span>{item.date.slice(5)}</span>
                <small>{item.sessions} 会话</small>
              </article>
            )) ?? null}
          </div>
        </section>

        <aside className="insight-service-board">
          <div className="insight-section-head"><div><strong>服务需求</strong><span>游客主动查找或咨询的服务类别</span></div></div>
          <div className="insight-chip-list">
            {(insights?.service_categories ?? []).map((item) => <span key={item.label}><strong>{item.label}</strong><b>{item.count}</b></span>)}
            {!insights?.service_categories.length ? <p>尚无服务分类行为，游客使用后自动形成排序。</p> : null}
          </div>
          <footer><ShieldCheck size={14} aria-hidden="true" /> 不保存姓名、手机号、原始语音或精确定位轨迹</footer>
        </aside>
      </div>
    </section>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
}
