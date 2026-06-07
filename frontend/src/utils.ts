import type { AdminOverview, ChatRecord, ConfidenceFilter, ModelFilter } from "./types";

export function formatTimestamp(createdAt: string): string {
  return createdAt.slice(0, 16).replace("T", " ");
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export function getConfidenceBand(confidence: number): ConfidenceFilter {
  if (confidence >= 0.75) {
    return "high";
  }
  if (confidence >= 0.5) {
    return "medium";
  }
  return "low";
}

export function getModelBucket(record: ChatRecord): Exclude<ModelFilter, "all"> {
  if (record.model_status.startsWith("fallback_to_mock:")) {
    return "fallback";
  }
  if (record.model_provider === "mock") {
    return "mock";
  }
  return "real";
}

export function getModelLabel(record: ChatRecord): string {
  const bucket = getModelBucket(record);
  if (bucket === "fallback") {
    return "fallback";
  }
  return record.model_provider;
}

export function buildAdminStats(overview: AdminOverview | null, isLoading: boolean) {
  if (isLoading && overview === null) {
    return [
      { label: "累计问答数", value: "--", helper: "系统已自动落库的问答记录" },
      { label: "今日问答数", value: "--", helper: "基于 created_at 的当日提问量" },
      { label: "平均响应时间", value: "--", helper: "当前记录的平均响应耗时" },
      { label: "低置信度数量", value: "--", helper: "reliable=false 或 confidence<50%" },
      { label: "真实模型调用数", value: "--", helper: "真实 LLM 成功返回的次数" },
      { label: "Mock / Fallback", value: "-- / --", helper: "本地 Mock 与异常降级次数" },
    ];
  }

  const metrics = overview ?? {
    total_records: 0,
    today_records: 0,
    average_response_time_ms: 0,
    low_confidence_count: 0,
    real_model_count: 0,
    mock_model_count: 0,
    fallback_count: 0,
  };

  return [
    { label: "累计问答数", value: String(metrics.total_records), helper: "系统已自动落库的问答记录" },
    { label: "今日问答数", value: String(metrics.today_records), helper: "基于 created_at 的当日提问量" },
    { label: "平均响应时间", value: `${metrics.average_response_time_ms} ms`, helper: "当前记录的平均响应耗时" },
    { label: "低置信度数量", value: String(metrics.low_confidence_count), helper: "reliable=false 或 confidence<50%" },
    { label: "真实模型调用数", value: String(metrics.real_model_count), helper: "真实 LLM 成功返回的次数" },
    { label: "Mock / Fallback", value: `${metrics.mock_model_count} / ${metrics.fallback_count}`, helper: "本地 Mock 与异常降级次数" },
  ];
}
