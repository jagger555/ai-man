export type ChatSource = {
  source: string;
  text: string;
  score: number;
  confidence: number;
  document_id?: number | null;
  title?: string | null;
  category?: string | null;
};

export type ChatResponse = {
  session_id: string;
  cleaned_question: string;
  answer: string;
  sources: ChatSource[];
  confidence: number;
  reliable: boolean;
  prompt: string;
  history_turns_used: number;
  model_provider: string;
  model_status: string;
  record_id: number | null;
  record_status: string;
  latency_ms: number;
};

export type DigitalHumanConfig = {
  enabled: boolean;
  base_url: string;
  avatar: string;
  voice: string;
  ref_audio: string;
  ref_text: string;
};

export type ChatRecord = {
  id: number;
  session_id: string;
  original_question: string;
  cleaned_question: string;
  answer: string;
  prompt_text: string;
  confidence: number;
  reliable: boolean;
  history_turns_used: number;
  source_count: number;
  sources: ChatSource[];
  model_provider: string;
  model_status: string;
  response_time_ms: number;
  created_at: string;
};

export type LowConfidenceRecord = ChatRecord & {
  issue_reason: string;
  top_score: number;
};

export type FeedbackRecord = {
  id: number;
  record_id: number;
  session_id: string;
  rating: "helpful" | "unhelpful";
  feedback_text: string;
  created_at: string;
  updated_at: string;
  original_question: string;
  answer: string;
};

export type ChatRecordListResponse = {
  count: number;
  total_count: number;
  records: ChatRecord[];
};

export type LowConfidenceListResponse = {
  count: number;
  total_count: number;
  records: LowConfidenceRecord[];
};

export type FeedbackListResponse = {
  count: number;
  total_count: number;
  records: FeedbackRecord[];
};

export type VisitorReportSummary = {
  total_records: number;
  feedback_count: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  positive_rate: number;
  negative_rate: number;
  low_confidence_count: number;
  low_confidence_rate: number;
  average_confidence: number;
  top_focus: string;
};

export type VisitorFocusPoint = {
  topic: string;
  count: number;
  share: number;
  positive_count: number;
  negative_count: number;
  low_confidence_count: number;
  average_confidence: number;
  sample_questions: string[];
  keywords: string[];
};

export type VisitorSentimentTrend = {
  date: string;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
  positive_rate: number;
  negative_rate: number;
};

export type VisitorReportSuggestion = {
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  action: string;
  related_focus: string;
};

export type VisitorReport = {
  summary: VisitorReportSummary;
  focus_points: VisitorFocusPoint[];
  sentiment_trend: VisitorSentimentTrend[];
  suggestions: VisitorReportSuggestion[];
};

export type DashboardSummary = {
  total_records: number;
  today_records: number;
  week_records: number;
  average_response_time_ms: number;
  low_confidence_count: number;
  accuracy_rate: number;
  feedback_total_count: number;
  feedback_helpful_count: number;
  feedback_unhelpful_count: number;
  feedback_helpful_rate: number;
};

export type VisitorAnalyticsItem = {
  label: string;
  count: number;
  share: number;
};

export type VisitorAnalytics = {
  source_file?: string;
  sheet_name?: string;
  total_visits?: number;
  unique_tourists?: number;
  average_stay_duration?: number;
  average_total_cost?: number;
  average_satisfaction?: number;
  average_group_size?: number;
  peak_month?: string;
  top_attractions?: VisitorAnalyticsItem[];
  gender_distribution?: VisitorAnalyticsItem[];
  age_groups?: VisitorAnalyticsItem[];
};

export type WeeklyServiceTrendPoint = {
  date: string;
  service_count: number;
  low_confidence_count: number;
  average_response_time_ms: number;
};

export type PopularQuestion = {
  question: string;
  count: number;
  latest_at: string;
  average_confidence: number;
  helpful_count: number;
  unhelpful_count: number;
};

export type SatisfactionTrendPoint = {
  date: string;
  feedback_count: number;
  helpful_count: number;
  unhelpful_count: number;
  helpful_rate: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  weekly_service_trend: WeeklyServiceTrendPoint[];
  popular_questions: PopularQuestion[];
  satisfaction_trend: SatisfactionTrendPoint[];
  visitor_analytics: VisitorAnalytics;
};

export type AdminOverview = {
  total_records: number;
  today_records: number;
  average_response_time_ms: number;
  low_confidence_count: number;
  real_model_count: number;
  mock_model_count: number;
  fallback_count: number;
};

export type KnowledgeDocumentCategory =
  | "guide_script"
  | "history_culture"
  | "faq"
  | "travel_notice"
  | "other";

export type KnowledgeDocumentStatus = "active" | "draft" | "archived";

export type KnowledgeDocument = {
  id: number;
  title: string;
  category: KnowledgeDocumentCategory;
  content: string;
  source_name: string;
  status: KnowledgeDocumentStatus;
  created_at: string;
  updated_at: string;
  character_count: number;
};

export type KnowledgeSummary = {
  total_documents: number;
  active_documents: number;
  draft_documents: number;
  archived_documents: number;
  total_character_count: number;
  managed_searchable_chunk_count: number;
  searchable_chunk_count: number;
  category_counts: Record<string, number>;
};

export type KnowledgeDocumentListResponse = {
  count: number;
  documents: KnowledgeDocument[];
  summary: KnowledgeSummary;
};

export type ActiveView = "chat" | "admin";
export type ConfidenceFilter = "all" | "high" | "medium" | "low";
export type ReliableFilter = "all" | "reliable" | "unreliable";
export type ModelFilter = "all" | "real" | "mock" | "fallback";
export type FeedbackRating = "helpful" | "unhelpful";
