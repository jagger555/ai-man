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
