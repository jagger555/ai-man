import type { VisitorReport, VisitorReportSuggestion } from "./types";

type VisitorReportPanelProps = {
  report: VisitorReport | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
};

const priorityLabels: Record<VisitorReportSuggestion["priority"], string> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

export function VisitorReportPanel({
  report,
  isLoading,
  error,
  onRefresh,
}: VisitorReportPanelProps) {
  const summary = report?.summary;
  const hasReportData = summary ? summary.total_records > 0 : false;
  const maxFocusCount = Math.max(
    1,
    ...(report?.focus_points.map((item) => item.count) ?? [0]),
  );

  return (
    <section className="visitor-report-panel" aria-label="游客互动与服务反馈">
      <div className="report-panel-head">
        <div>
          <strong>游客互动与服务反馈</strong>
          <p>按真实问答、积极 Emoji、服务反馈和低置信问题生成运营建议。</p>
        </div>
        <div className="report-head-actions">
          <span className="panel-note">
            {isLoading
              ? "分析中..."
              : hasReportData
                ? `样本 ${summary?.total_records ?? 0} 条`
                : "暂无样本"}
          </span>
          <button
            type="button"
            className="secondary-action"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? "刷新中..." : "刷新报告"}
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {report ? (
        <>
          <section className="report-summary-grid">
            <article className="report-metric-card">
              <small>问答样本</small>
              <strong>{summary?.question_count ?? 0}</strong>
              <p>当前筛选范围内的正常问答</p>
            </article>
            <article className="report-metric-card">
              <small>积极 Emoji 互动</small>
              <strong>{summary?.emoji_interaction_count ?? 0}</strong>
              <p>固定回复，不进入问答质检</p>
            </article>
            <article className="report-metric-card">
              <small>有帮助率</small>
              <strong>{formatPercent(summary?.helpful_rate ?? 0)}</strong>
              <p>{summary?.helpful_count ?? 0} 条有帮助反馈</p>
            </article>
            <article className="report-metric-card">
              <small>知识风险</small>
              <strong>{formatPercent(summary?.low_confidence_rate ?? 0)}</strong>
              <p>{summary?.low_confidence_count ?? 0} 条待复核</p>
            </article>
            <article className="report-metric-card">
              <small>平均置信度</small>
              <strong>{formatPercent(summary?.average_confidence ?? 0)}</strong>
              <p>{summary?.top_focus || "暂无集中关注点"}</p>
            </article>
          </section>

          <section className="report-workspace">
            <section className="report-card focus-report-card">
              <div className="report-card-head">
                <strong>游客关注点</strong>
                <span>{report.focus_points.length} 类</span>
              </div>
              {report.focus_points.length > 0 ? (
                <div className="focus-list">
                  {report.focus_points.slice(0, 6).map((focus) => (
                    <article key={focus.topic} className="focus-card">
                      <div className="focus-card-top">
                        <strong>{focus.topic}</strong>
                        <span>{focus.count} 次</span>
                      </div>
                      <div className="focus-bar-track">
                        <span
                          className="focus-bar-fill"
                          style={{
                            width: `${Math.max(8, (focus.count / maxFocusCount) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="record-row-meta">
                        <span>占比 {formatPercent(focus.share)}</span>
                        <span>有帮助 {focus.helpful_count}</span>
                        <span>无帮助 {focus.unhelpful_count}</span>
                        <span>低置信 {focus.low_confidence_count}</span>
                      </div>
                      {focus.keywords.length > 0 ? (
                        <div className="keyword-strip">
                          {focus.keywords.map((keyword) => (
                            <span key={`${focus.topic}-${keyword}`}>{keyword}</span>
                          ))}
                        </div>
                      ) : null}
                      {focus.sample_questions.length > 0 ? (
                        <p>{focus.sample_questions[0]}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">暂无可分析的关注点。</div>
              )}
            </section>

            <section className="report-card sentiment-report-card">
              <div className="report-card-head">
                <strong>服务反馈趋势</strong>
                <span>{report.feedback_trend.length} 天</span>
              </div>
              {report.feedback_trend.length > 0 ? (
                <div className="sentiment-list">
                  {report.feedback_trend.slice(-7).map((trend) => {
                    const helpfulWidth = trend.question_count
                      ? (trend.helpful_count / trend.question_count) * 100
                      : 0;
                    const unratedWidth = trend.question_count
                      ? (trend.unrated_count / trend.question_count) * 100
                      : 0;
                    const unhelpfulWidth = trend.question_count
                      ? (trend.unhelpful_count / trend.question_count) * 100
                      : 0;

                    return (
                      <article key={trend.date} className="sentiment-row">
                        <div className="sentiment-row-head">
                          <strong>{trend.date}</strong>
                          <span>{trend.question_count} 条</span>
                        </div>
                        <div className="sentiment-stack" aria-hidden="true">
                          <span
                            className="sentiment-positive"
                            style={{ width: `${helpfulWidth}%` }}
                          />
                          <span
                            className="sentiment-neutral"
                            style={{ width: `${unratedWidth}%` }}
                          />
                          <span
                            className="sentiment-negative"
                            style={{ width: `${unhelpfulWidth}%` }}
                          />
                        </div>
                        <div className="record-row-meta">
                          <span>有帮助 {trend.helpful_count}</span>
                          <span>未反馈 {trend.unrated_count}</span>
                          <span>无帮助 {trend.unhelpful_count}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">暂无服务反馈数据。</div>
              )}
              {report.emoji_distribution.length > 0 ? (
                <div className="keyword-strip positive-emoji-summary" aria-label="积极 Emoji 分布">
                  {report.emoji_distribution.map((item) => (
                    <span key={item.emoji}>{item.emoji} {item.count}</span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="report-card suggestion-report-card">
              <div className="report-card-head">
                <strong>服务建议</strong>
                <span>{report.suggestions.length} 条</span>
              </div>
              {report.suggestions.length > 0 ? (
                <div className="suggestion-list">
                  {report.suggestions.map((suggestion) => (
                    <article
                      key={`${suggestion.priority}-${suggestion.title}`}
                      className={`suggestion-card priority-${suggestion.priority}`}
                    >
                      <div className="suggestion-card-head">
                        <strong>{suggestion.title}</strong>
                        <span>{priorityLabels[suggestion.priority]}</span>
                      </div>
                      <p>{suggestion.reason}</p>
                      <p>{suggestion.action}</p>
                      {suggestion.related_focus ? (
                        <small>关联关注点：{suggestion.related_focus}</small>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">暂无服务建议。</div>
              )}
            </section>
          </section>
        </>
      ) : (
        <div className="empty-state">
          {isLoading ? "正在生成游客互动报告..." : "暂无游客互动报告。"}
        </div>
      )}
    </section>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
