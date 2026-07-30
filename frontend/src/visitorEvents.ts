export type VisitorEventType =
  | "page_view"
  | "page_dwell"
  | "preference_select"
  | "route_generate"
  | "route_adjust"
  | "route_confirm"
  | "map_search"
  | "navigation_request"
  | "navigation_success"
  | "navigation_failure"
  | "vr_load"
  | "performance_view"
  | "service_category"
  | "chat_question"
  | "chat_reliability"
  | "feedback";

export type VisitorEventInput = {
  eventType: VisitorEventType;
  page?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
};

const SESSION_KEY = "lingshan-anonymous-session";

export function getAnonymousVisitorSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sessionId = `visitor-${suffix}`;
  window.sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function recordVisitorEvent(
  sessionId: string,
  input: VisitorEventInput,
): void {
  const body = JSON.stringify({
    session_id: sessionId,
    event_type: input.eventType,
    page: input.page ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
    metadata: input.metadata ?? {},
  });

  void fetch("/api/visitor/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
