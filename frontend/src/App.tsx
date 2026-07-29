import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  CalendarClock,
  Database,
  FileText,
  Headphones,
  Map,
  Mic,
  RefreshCw,
  Route,
  ScanLine,
  Smile,
  Users,
} from "lucide-react";
import type {
  ActiveView,
  AdminOverview,
  ChatRecord,
  ChatRecordListResponse,
  ChatResponse,
  ConfidenceFilter,
  DashboardData,
  FeedbackListResponse,
  FeedbackRating,
  FeedbackRecord,
  LowConfidenceListResponse,
  LowConfidenceRecord,
  ModelFilter,
  ReliableFilter,
  VisitorReport,
} from "./types";
import {
  formatTimestamp,
  getConfidenceBand,
  getModelBucket,
  getModelLabel,
  truncate,
} from "./utils";
import { ErrorBoundary } from "./ErrorBoundary";
import { DashboardPanel } from "./DashboardPanel";
import { DigitalHumanPanel } from "./DigitalHumanPanel";
import { KnowledgeManager, type KnowledgeDraft } from "./KnowledgeManager";
import { VisitorReportPanel } from "./VisitorReportPanel";
import { AvatarManager } from "./AvatarManager";
import { StreamingAsrClient } from "./streamingAsrClient";
import { ScenicMapPanel } from "./ScenicMapPanel";
import { ScenicStatusHeader } from "./ScenicStatusHeader";
import { PanoramaExperience } from "./PanoramaExperience";

const sampleQuestions = [
  "第一次来灵山怎么游？",
  "灵山大佛有什么看点？",
  "九龙灌浴几点开始？",
  "带老人怎么安排路线？",
  "附近哪里有厕所？",
  "有什么餐饮推荐？",
];

const positiveEmojis = ["😊", "😄", "👍", "❤️", "🙏", "🤩", "👏", "🌸"];

type AdminSection = "overview" | "insights" | "qa" | "knowledge" | "avatar";
type GuideIntent = "route_guide" | "performance_time" | "map_guide" | "vr_guide" | "service_guide";
type VisitorPage = "home" | "route" | "map" | "vr" | "performance" | "services";
type PendingDashboardAction =
  | "low-confidence"
  | "high-frequency"
  | "unhelpful-feedback"
  | "irrelevant-question"
  | "digital-human";
type LowConfidenceDashboardAction =
  | "补充知识库"
  | "优化问法"
  | "标记无关"
  | "人工复核";

type GuideServiceEntry = {
  id: GuideIntent;
  title: string;
  helper: string;
  summary: string;
  supports: string[];
  icon: typeof Route;
};

const visitorPageByGuideIntent: Record<GuideIntent, Exclude<VisitorPage, "home">> = {
  route_guide: "route",
  map_guide: "map",
  vr_guide: "vr",
  performance_time: "performance",
  service_guide: "services",
};

const guideIntentByVisitorPage: Partial<Record<VisitorPage, GuideIntent>> = {
  route: "route_guide",
  map: "map_guide",
  vr: "vr_guide",
  performance: "performance_time",
  services: "service_guide",
};

const visitorPageMeta: Record<Exclude<VisitorPage, "home">, { eyebrow: string; title: string; helper: string }> = {
  route: {
    eyebrow: "SCENIC ROUTE · LINGSHAN",
    title: "灵山游览路线",
    helper: "按游览节奏查看路线、景点顺序与沿途提醒",
  },
  map: {
    eyebrow: "AMAP · LINGSHAN",
    title: "灵山景区地图导航",
    helper: "选择起终点，查看景区步行路线并交接高德地图",
  },
  vr: {
    eyebrow: "360° PANORAMA · LINGSHAN",
    title: "灵山胜境全景漫游",
    helper: "进入实景，自由查看灵山代表性空间",
  },
  performance: {
    eyebrow: "PERFORMANCE · LINGSHAN",
    title: "灵山演出时间",
    helper: "查看九龙灌浴与梵宫文化体验安排",
  },
  services: {
    eyebrow: "VISITOR SERVICE · LINGSHAN",
    title: "灵山游客服务",
    helper: "查找景区常用设施与服务信息",
  },
};

function getVisitorPageFromLocation(): VisitorPage {
  const page = window.location.hash.replace(/^#/, "") as VisitorPage;
  return page === "route" ||
    page === "map" ||
    page === "vr" ||
    page === "performance" ||
    page === "services"
    ? page
    : "home";
}

const performanceScheduleNotice = {
  validPeriod: "2026/7/2 至 2026/7/31",
  source: "以景区当日公告为准",
  items: [
    {
      title: "九龙灌浴",
      rows: [
        { label: "平日每天", time: "10:00、11:30、14:45、16:45", count: "4场" },
        { label: "周六周日", time: "10:00、11:30、13:00、14:45、16:45", count: "5场" },
      ],
    },
    {
      title: "梵宫文化体验之旅",
      rows: [
        { label: "每天", time: "10:00、11:00、12:00、13:30、14:30、15:30", count: "6场" },
      ],
    },
  ],
};

const guideServiceEntries: GuideServiceEntry[] = [
  {
    id: "route_guide",
    title: "游览路线",
    helper: "路线图 / 推荐路线",
    summary: "可查看景区游览路线图，并按游客类型推荐适合的游览顺序。",
    supports: ["景区游览路线图", "亲子路线", "老人路线", "半日游路线"],
    icon: Route,
  },
  {
    id: "map_guide",
    title: "地图导航",
    helper: "GPS / 步行路线",
    summary: "支持高德地点联想、浏览器定位、景区步行路线与地图图层切换。",
    supports: ["高德地点联想", "GPS 设为起点", "步行路线总览", "标准/卫星/3D 图层"],
    icon: Map,
  },
  {
    id: "vr_guide",
    title: "VR 实景",
    helper: "360° / 自由漫游",
    summary: "可在 Web 端直接进入灵山胜境 360° 全景，自由拖动视角并使用原页面场景热点。",
    supports: ["360° 实景漫游", "原页面场景选择", "分享点赞与评论", "第三方原始语音"],
    icon: ScanLine,
  },
  {
    id: "performance_time",
    title: "演出时间",
    helper: "实时场次 / 演出地点",
    summary: "可查看 2026 年 7 月灵山胜境演出场次通知，包含九龙灌浴和梵宫文化体验之旅。",
    supports: ["九龙灌浴平日4场", "九龙灌浴周末5场", "梵宫文化体验之旅6场"],
    icon: CalendarClock,
  },
  {
    id: "service_guide",
    title: "游客服务",
    helper: "厕所 / 餐饮 / 应急",
    summary: "可查询景区常用服务点，帮助游客快速找到附近设施。",
    supports: [
      "卫生间",
      "餐饮",
      "停车",
      "游客中心",
      "医疗救助",
      "失物招领",
      "紧急联系",
      "无障碍通道",
      "母婴室",
      "行李寄存",
      "充电宝",
      "文创购物",
    ],
    icon: Headphones,
  },
];

const adminSections: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof Activity;
}> = [
  {
    id: "overview",
    label: "总览",
    description: "服务量与趋势",
    icon: Activity,
  },
  {
    id: "insights",
    label: "游客洞察",
    description: "报告与反馈",
    icon: Users,
  },
  {
    id: "qa",
    label: "问答质检",
    description: "记录与风险",
    icon: FileText,
  },
  {
    id: "knowledge",
    label: "知识库",
    description: "资料维护",
    icon: Database,
  },
  {
    id: "avatar",
    label: "数字人形象",
    description: "Avatar 管理",
    icon: Bot,
  },
];

function QuickQuestionButton({
  question,
  onSelect,
}: {
  question: string;
  onSelect: (question: string) => void;
}) {
  return (
    <button type="button" onClick={() => onSelect(question)}>
      {question}
    </button>
  );
}

function GuideQuestionPanel({
  question,
  isLoading,
  isListening,
  isRecognizing,
  onQuestionChange,
  onQuickQuestion,
  onSubmit,
  onToggleListening,
}: {
  question: string;
  isLoading: boolean;
  isListening: boolean;
  isRecognizing: boolean;
  onQuestionChange: (question: string) => void;
  onQuickQuestion: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleListening: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEmojiPickerOpen(false);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEmojiPickerOpen]);

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? question.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const nextQuestion = `${question.slice(0, selectionStart)}${emoji}${question.slice(selectionEnd)}`;
    onQuestionChange(nextQuestion);
    requestAnimationFrame(() => {
      const caret = selectionStart + emoji.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  return (
    <form onSubmit={onSubmit} className="guide-question-panel">
      <div className="question-panel-head">
        <div>
          <p className="eyebrow">游客提问</p>
          <h2>想问数字导游什么？</h2>
          <span>可以询问路线、演出、文化典故和附近服务</span>
        </div>
      </div>
      <label className="sr-only" htmlFor="question">
        输入你想了解的灵山胜境问题
      </label>
      <textarea
        ref={textareaRef}
        id="question"
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        rows={4}
        maxLength={500}
        placeholder="例如：九龙灌浴几点开始？"
      />
      <div className="quick-questions">
        <span className="quick-questions-label">问法示例</span>
        {sampleQuestions.map((item) => (
          <QuickQuestionButton key={item} question={item} onSelect={onQuickQuestion} />
        ))}
      </div>
      <div className="question-actions">
        <button
          className="voice-action"
          type="button"
          onClick={onToggleListening}
          title={isListening ? "结束语音输入" : "开始语音输入"}
          aria-label={isListening ? "结束语音输入" : "开始语音输入"}
        >
          <Mic size={20} aria-hidden="true" />
        </button>
        <div className="emoji-picker-wrap" ref={emojiPickerRef}>
          <button
            className="emoji-action"
            type="button"
            onClick={() => setIsEmojiPickerOpen((isOpen) => !isOpen)}
            title="添加积极表情"
            aria-label="添加积极表情"
            aria-expanded={isEmojiPickerOpen}
            aria-controls="positive-emoji-picker"
          >
            <Smile size={20} aria-hidden="true" />
          </button>
          {isEmojiPickerOpen ? (
            <div
              id="positive-emoji-picker"
              className="emoji-picker"
              role="dialog"
              aria-label="积极表情选择"
            >
              <span>选择积极表情</span>
              <div className="emoji-picker-grid">
                {positiveEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    aria-label={`插入表情 ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <small>纯表情可直接发送，也可以与文字一起提问。</small>
            </div>
          ) : null}
        </div>
        <button className="primary-action" type="submit" disabled={isLoading}>
          {isLoading ? "数字导游正在整理讲解内容..." : "开始讲解"}
        </button>
        <span className="speech-status">
          {isListening
            ? "正在听，请再次点击结束语音输入"
            : isRecognizing
              ? "正在识别语音并准备提问..."
              : ""}
        </span>
      </div>
    </form>
  );
}

function AnswerPreviewCard({
  response,
  servicePreview,
  isLoading,
  feedbackStatus,
  feedbackText,
  isFeedbackNoteOpen,
  isSubmittingFeedback,
  onFeedback,
  onFeedbackTextChange,
  onToggleFeedbackNote,
  onSubmitFeedbackNote,
}: {
  response: ChatResponse | null;
  servicePreview: GuideServiceEntry | null;
  isLoading: boolean;
  feedbackStatus: { recordId: number; rating: FeedbackRating } | null;
  feedbackText: string;
  isFeedbackNoteOpen: boolean;
  isSubmittingFeedback: boolean;
  onFeedback: (rating: FeedbackRating) => void;
  onFeedbackTextChange: (value: string) => void;
  onToggleFeedbackNote: () => void;
  onSubmitFeedbackNote: () => void;
}) {
  const hasAnswer = Boolean(response?.answer.trim());
  const hasServicePreview = !hasAnswer && !isLoading && Boolean(servicePreview);
  const previewText = hasAnswer
    ? response?.answer
    : servicePreview
      ? servicePreview.summary
      : "您可以输入问题，或点击下方常用导览服务，查看路线、地图、演出和游客服务。";
  const previewLabel = isLoading
    ? "正在整理讲解内容"
    : hasAnswer
      ? "数字人输出"
      : servicePreview
        ? "常用导览服务"
        : "数字导游可以为您介绍";

  return (
    <section className="answer-card answer-preview-card" aria-label="讲解预览">
      <div className="answer-card-head">
        <div>
          <p className="eyebrow">{previewLabel}</p>
          {servicePreview ? <strong className="service-preview-title">{servicePreview.title}</strong> : null}
        </div>
        {response ? (
          <span className={response.reliable ? "status-chip reliable" : "status-chip unreliable"}>
            {response.reliable ? "资料可信" : "建议人工复核"}
          </span>
        ) : null}
      </div>
      <p className="answer-preview-text">
        {isLoading ? "数字导游正在结合景区资料整理适合现场播报的讲解内容。" : previewText}
      </p>
      {hasServicePreview ? (
        <div className="service-preview-list" aria-label={`${servicePreview?.title}可用功能`}>
          {servicePreview?.supports.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className="answer-preview-footer">
        {hasAnswer && response?.record_id != null ? (
          <div className="answer-feedback-inline" aria-label="回答反馈">
            <span>这个回答对您有帮助吗？</span>
            <div className="answer-feedback-actions">
              <button
                type="button"
                className={feedbackStatus?.rating === "helpful" ? "active" : ""}
                onClick={() => onFeedback("helpful")}
                disabled={isSubmittingFeedback}
              >
                有帮助
              </button>
              <button
                type="button"
                className={feedbackStatus?.rating === "unhelpful" ? "active" : ""}
                onClick={() => onFeedback("unhelpful")}
                disabled={isSubmittingFeedback}
              >
                无帮助
              </button>
              <button type="button" className="text-action" onClick={onToggleFeedbackNote}>
                补充意见
              </button>
            </div>
            {feedbackStatus?.recordId === response.record_id ? <small>感谢您的反馈</small> : null}
          </div>
        ) : (
          <span>
            {hasServicePreview
              ? `${servicePreview?.title}已打开，可直接使用上方功能。`
              : "回答生成后，数字人会自动开始播报。"}
          </span>
        )}
      </div>
      {hasAnswer && isFeedbackNoteOpen ? (
        <div className="answer-feedback-note">
          <textarea
            value={feedbackText}
            onChange={(event) => onFeedbackTextChange(event.target.value)}
            placeholder="可以补充说明回答哪里需要改进（选填）"
            maxLength={500}
          />
          <button
            type="button"
            className="secondary-action"
            onClick={onSubmitFeedbackNote}
            disabled={!feedbackStatus || isSubmittingFeedback}
          >
            {feedbackStatus ? "提交意见" : "请先选择反馈"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PerformanceSchedulePanel() {
  return (
    <section className="performance-schedule-panel" aria-label="灵山胜境演出时间">
      <div className="performance-head">
        <div>
          <p className="eyebrow">PERFORMANCE NOTICE</p>
          <h3>2026 年 7 月演出场次通知</h3>
          <span>提示有效期：{performanceScheduleNotice.validPeriod}</span>
        </div>
        <span className="notice-badge">{performanceScheduleNotice.source}</span>
      </div>
      <div className="performance-grid">
        {performanceScheduleNotice.items.map((item) => (
          <article key={item.title} className="performance-card">
            <strong>{item.title}</strong>
            <div className="performance-rows">
              {item.rows.map((row) => (
                <div key={`${item.title}-${row.label}`} className="performance-row">
                  <span>{row.label}</span>
                  <b>{row.count}</b>
                  <p>{row.time}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="performance-note">
        演出安排可能因天气、客流或景区运营临时调整，请以景区当日公告和现场工作人员说明为准。
      </p>
    </section>
  );
}

function GuideServiceBar({
  entries,
  isLoading,
  activeIntent,
  pageMode = false,
  onSelect,
}: {
  entries: GuideServiceEntry[];
  isLoading: boolean;
  activeIntent?: GuideIntent;
  pageMode?: boolean;
  onSelect: (intent: GuideIntent) => void;
}) {
  return (
    <section
      className={`today-recommend-bar${pageMode ? " page-mode" : ""}`}
      aria-label="常用导览服务"
    >
      {entries.map((item) => {
        const ItemIcon = item.icon;
        return (
          <button
            key={item.title}
            type="button"
            className={`recommend-entry ${activeIntent === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
            disabled={isLoading}
            aria-pressed={activeIntent === item.id}
            aria-label={`${item.title}：${item.helper}`}
          >
            <ItemIcon size={22} aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              <p>{item.helper}</p>
            </div>
          </button>
        );
      })}
    </section>
  );
}

export function App() {
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [visitorPage, setVisitorPage] = useState<VisitorPage>(() => getVisitorPageFromLocation());
  const [mapDestination, setMapDestination] = useState("");
  const [activeAdminSection, setActiveAdminSection] =
    useState<AdminSection>("overview");
  const [adminTimeRange, setAdminTimeRange] = useState<"today" | "7d" | "30d">("7d");
  const [digitalHumanRefreshKey, setDigitalHumanRefreshKey] = useState(0);
  const [activeGuideService, setActiveGuideService] =
    useState<GuideServiceEntry | null>(null);
  const [serviceNarration, setServiceNarration] = useState<{
    key: string;
    text: string;
  } | null>(null);

  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [recordsTotalCount, setRecordsTotalCount] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

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
  const [visitorReport, setVisitorReport] = useState<VisitorReport | null>(null);
  const [visitorReportLoading, setVisitorReportLoading] = useState(false);
  const [visitorReportError, setVisitorReportError] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<{
    recordId: number;
    rating: FeedbackRating;
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isFeedbackNoteOpen, setIsFeedbackNoteOpen] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

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
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft | null>(null);

  const sessionId = useMemo(() => `web-${Date.now()}`, []);
  const asrClientRef = useRef<StreamingAsrClient | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

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

  const adminErrors = [
    recordsError,
    overviewError,
    lowConfidenceError,
    feedbackError,
  ].filter(Boolean);
  const adminIsRefreshing =
    recordsLoading ||
    overviewLoading ||
    dashboardLoading ||
    lowConfidenceLoading ||
    feedbackLoading ||
    visitorReportLoading;

  useEffect(() => {
    const syncVisitorPage = () => {
      const nextPage = getVisitorPageFromLocation();
      setVisitorPage(nextPage);
      const nextIntent = guideIntentByVisitorPage[nextPage];
      setActiveGuideService(
        nextIntent
          ? guideServiceEntries.find((entry) => entry.id === nextIntent) ?? null
          : null,
      );
      setServiceNarration(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("hashchange", syncVisitorPage);
    window.addEventListener("popstate", syncVisitorPage);
    return () => {
      window.removeEventListener("hashchange", syncVisitorPage);
      window.removeEventListener("popstate", syncVisitorPage);
    };
  }, []);

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
      setIsFeedbackNoteOpen(false);
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
      setIsFeedbackNoteOpen(false);
    } else {
      setFeedbackStatus(null);
      setFeedbackText("");
      setIsFeedbackNoteOpen(false);
    }
  }, [response?.record_id, feedbackRecords]);

  useEffect(() => {
    return () => {
      asrClientRef.current?.close();
      stopCurrentAudio();
    };
  }, []);

  async function toggleListening() {
    if (isRecognizing) {
      asrClientRef.current?.close(false);
      asrClientRef.current = null;
      setIsRecognizing(false);
      setIsListening(false);
      setSpeechError("");
      return;
    }

    if (isListening) {
      finishListening();
      return;
    }

    await startListening();
  }

  async function startListening() {
    setSpeechError("");
    setIsRecognizing(false);

    const client = new StreamingAsrClient({
      onPartial: (text) => {
        if (text.trim()) {
          setQuestion(text);
        }
      },
      onFinal: (text) => {
        const trimmedText = text.trim();
        asrClientRef.current = null;
        setIsListening(false);
        setIsRecognizing(false);
        if (!trimmedText) {
          setSpeechError("没有识别到语音内容");
          return;
        }
        setQuestion(trimmedText);
        void askQuestion(trimmedText);
      },
      onError: (message) => {
        asrClientRef.current = null;
        setIsListening(false);
        setIsRecognizing(false);
        setSpeechError(getReadableSpeechError(message));
      },
      onClose: () => {
        if (asrClientRef.current === client) {
          asrClientRef.current = null;
          setIsListening(false);
          setIsRecognizing(false);
        }
      },
    });
    asrClientRef.current = client;

    try {
      await client.start();
      setIsListening(true);
    } catch (caught) {
      client.close(false);
      if (asrClientRef.current === client) {
        asrClientRef.current = null;
      }
      setIsListening(false);
      setIsRecognizing(false);
      setSpeechError(
        caught instanceof Error
          ? getReadableSpeechError(caught.message)
          : "无法获取麦克风权限",
      );
    }
  }

  function finishListening() {
    asrClientRef.current?.finish();
    setIsListening(false);
    setIsRecognizing(true);
  }

  async function toggleSpeechPlayback() {
    if (!response?.answer.trim()) {
      return;
    }

    if (isSpeaking) {
      stopCurrentAudio();
      return;
    }

    setSpeechError("");
    try {
      const result = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: response.answer }),
      });
      if (!result.ok) {
        throw new Error(
          result.status === 502 ? "语音服务暂不可用" : `语音合成返回 ${result.status}`,
        );
      }

      const audioBlob = await result.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      currentAudioUrlRef.current = audioUrl;
      audio.onended = stopCurrentAudio;
      audio.onerror = () => {
        stopCurrentAudio();
        setSpeechError("音频播放失败");
      };
      setIsSpeaking(true);
      await audio.play();
    } catch (caught) {
      stopCurrentAudio();
      setSpeechError(caught instanceof Error ? (caught as Error).message : "语音播报失败");
    }
  }

  function stopCurrentAudio() {
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setIsSpeaking(false);
  }

  function getReadableSpeechError(message: string) {
    if (
      message.includes("Speech ASR is not configured") ||
      message.includes("speech service unavailable") ||
      message.includes("401") ||
      message.includes("403") ||
      message.includes("语音服务暂不可用")
    ) {
      return "语音服务暂不可用";
    }
    if (
      message.includes("browser microphone is not supported") ||
      message.includes("browser audio capture is not supported")
    ) {
      return "当前浏览器不支持语音输入";
    }
    return message || "语音服务暂不可用";
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askQuestion(question);
  }

  async function askQuestion(
    nextQuestion: string,
    options: { syncInput?: boolean } = {},
  ) {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion) {
      return;
    }

    if (options.syncInput !== false) {
      setQuestion(trimmedQuestion);
    }
    setActiveGuideService(null);
    setResponse(null);
    setIsLoading(true);
    setError("");
    setFeedbackStatus(null);
    setFeedbackText("");
    setIsFeedbackNoteOpen(false);

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          question: trimmedQuestion,
          current_location: "",
          visitor_type: "",
          available_time: "",
          route_context: "",
        }),
      });

      if (!result.ok) {
        throw new Error(`问答接口返回 ${result.status}`);
      }

      setResponse((await result.json()) as ChatResponse);
      void loadAdminData();
    } catch (caught) {
      setError(caught instanceof Error ? (caught as Error).message : "问答请求失败");
    } finally {
      setIsLoading(false);
    }
  }

  function openGuideService(intent: GuideIntent) {
    const matchedEntry = guideServiceEntries.find((entry) => entry.id === intent) ?? null;
    const nextPage = visitorPageByGuideIntent[intent];
    if (intent === "map_guide") {
      setMapDestination("");
    }
    setActiveGuideService(matchedEntry);
    setResponse(null);
    setServiceNarration(null);
    setError("");
    navigateToVisitorPage(nextPage);
  }

  function navigateToVisitorPage(nextPage: VisitorPage) {
    const nextHash = nextPage === "home" ? "" : `#${nextPage}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.pushState({ visitorPage: nextPage }, "", nextUrl);
    setVisitorPage(nextPage);
    if (nextPage === "home") {
      setActiveGuideService(null);
      setServiceNarration(null);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openRouteStopInMap(stop: string) {
    setMapDestination(stop);
    setActiveGuideService(guideServiceEntries.find((entry) => entry.id === "map_guide") ?? null);
    navigateToVisitorPage("map");
  }

  function askAboutRouteStop(stop: string) {
    const nextQuestion = `请介绍${stop}的参观重点，并提醒我游览时需要注意什么。`;
    void askQuestion(nextQuestion);
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
      setIsFeedbackNoteOpen(false);
      await Promise.all([loadFeedbackRecords(), loadAdminData()]);
    } catch (caught) {
      setFeedbackError(caught instanceof Error ? (caught as Error).message : "提交反馈失败");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  function getAdminRangeDays(range: "today" | "7d" | "30d") {
    return range === "today" ? 1 : range === "30d" ? 30 : 7;
  }

  function changeAdminTimeRange(range: "today" | "7d" | "30d") {
    setAdminTimeRange(range);
    void Promise.all([loadDashboard(range), loadVisitorReport(range)]);
  }

  async function loadAdminData(range = adminTimeRange) {
    await Promise.all([
      loadRecords(),
      loadOverview(),
      loadDashboard(range),
      loadLowConfidenceRecords(),
      loadFeedbackRecords(),
      loadVisitorReport(range),
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
      setRecordsError(caught instanceof Error ? (caught as Error).message : "读取记录失败");
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
      setOverviewError(caught instanceof Error ? (caught as Error).message : "读取统计信息失败");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadDashboard(range = adminTimeRange) {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const result = await fetch(
        `/api/admin/dashboard?limit=8&days=${getAdminRangeDays(range)}`,
      );
      if (!result.ok) {
        throw new Error(`数据大屏接口返回 ${result.status}`);
      }

      setDashboard((await result.json()) as DashboardData);
    } catch (caught) {
      setDashboardError(
        caught instanceof Error ? (caught as Error).message : "读取数据大屏失败",
      );
    } finally {
      setDashboardLoading(false);
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
        caught instanceof Error ? (caught as Error).message : "读取低置信度问题失败",
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
        caught instanceof Error ? (caught as Error).message : "读取反馈列表失败",
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadVisitorReport(range = adminTimeRange) {
    setVisitorReportLoading(true);
    setVisitorReportError("");

    try {
      const result = await fetch(
        `/api/admin/visitor-report?limit=200&days=${getAdminRangeDays(range)}`,
      );
      if (!result.ok) {
        throw new Error(`游客互动报告接口返回 ${result.status}`);
      }

      setVisitorReport((await result.json()) as VisitorReport);
    } catch (caught) {
      setVisitorReportError(
        caught instanceof Error ? (caught as Error).message : "读取游客互动报告失败",
      );
    } finally {
      setVisitorReportLoading(false);
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
    setActiveAdminSection("qa");
    const matchedRecord = records.find((record) => record.id === recordId);
    if (matchedRecord) {
      setSelectedRecord(matchedRecord);
    }
  }

  function openQuestionDetail(question: string) {
    resetFilters();
    setActiveView("admin");
    setActiveAdminSection("qa");
    setKeywordFilter(question);
    const matchedRecord = records.find(
      (record) => record.original_question === question,
    );
    if (matchedRecord) {
      setSelectedRecord(matchedRecord);
    }
  }

  function createKnowledgeDraftFromQuestion(
    question: string,
    options: {
      titlePrefix?: string;
      content?: string;
      category?: KnowledgeDraft["category"];
      status?: KnowledgeDraft["status"];
    } = {},
  ) {
    const matchedRecord = records.find(
      (record) => record.original_question === question,
    );
    const sourceText =
      matchedRecord?.sources
        .slice(0, 2)
        .map((source, index) => `参考资料 ${index + 1}：${source.text}`)
        .join("\n\n") ?? "";
    const content =
      options.content ??
      [
        `游客问题：${question}`,
        matchedRecord ? `现有回答：${matchedRecord.answer}` : "",
        sourceText,
        "建议维护：补充官方讲解词、FAQ 或服务规则后，将状态改为启用。",
      ]
        .filter(Boolean)
        .join("\n\n");

    setActiveView("admin");
    setActiveAdminSection("knowledge");
    setKnowledgeDraft({
      nonce: Date.now(),
      title: `${options.titlePrefix ?? "待补充知识"}：${truncate(question, 24)}`,
      category: options.category ?? "faq",
      source_name: "后台运营处理",
      status: options.status ?? "draft",
      content,
    });
  }

  function markQuestionUnrelated(question: string) {
    createKnowledgeDraftFromQuestion(question, {
      titlePrefix: "边界问题",
      category: "faq",
      status: "draft",
      content: [
        `游客问题：${question}`,
        "建议回答：这个问题超出灵山胜境景区导览服务范围，我可以继续为您介绍景点历史、文化典故、游览路线、演出时间、票务和游客服务信息。",
        "用途：保存为边界 FAQ 后，可用于统一处理无关问题，避免进入常规景区知识补充流程。",
      ].join("\n\n"),
    });
  }

  function handlePendingDashboardAction(action: PendingDashboardAction) {
    setActiveView("admin");
    if (action === "low-confidence" || action === "high-frequency") {
      resetFilters();
      setActiveAdminSection("qa");
      setConfidenceFilter("low");
      return;
    }
    if (action === "unhelpful-feedback") {
      setActiveAdminSection("insights");
      return;
    }
    if (action === "irrelevant-question") {
      resetFilters();
      setActiveAdminSection("qa");
      setKeywordFilter("股票");
      return;
    }
    setActiveAdminSection("avatar");
  }

  function handleLowConfidenceAction(
    action: LowConfidenceDashboardAction,
    record: LowConfidenceRecord,
  ) {
    if (action === "补充知识库") {
      createKnowledgeDraftFromQuestion(record.original_question, {
        titlePrefix: "低置信补充",
      });
      return;
    }
    if (action === "标记无关") {
      markQuestionUnrelated(record.original_question);
      return;
    }
    openQuestionDetail(record.original_question);
  }

  function resetFilters() {
    setKeywordFilter("");
    setSessionFilter("");
    setConfidenceFilter("all");
    setReliableFilter("all");
    setModelFilter("all");
  }

  const isVisitorHome = visitorPage === "home";
  const visitorIntent = guideIntentByVisitorPage[visitorPage];
  const selectedVisitorPage = isVisitorHome ? null : visitorPageMeta[visitorPage];

  return (
    <main
      className={
        activeView === "admin"
          ? "scenic-guide-page admin-page"
          : `scenic-guide-page${isVisitorHome ? "" : " feature-page-active"}`
      }
    >
      {activeView === "chat" && isVisitorHome ? (
        <ScenicStatusHeader
          activeView={activeView}
          onViewChange={setActiveView}
        />
      ) : null}
      <section
        className={
          activeView === "admin"
            ? "main-layout admin-mode"
            : `main-layout${isVisitorHome ? "" : " visitor-feature-layout"}`
        }
      >
        <section
          className={`left-column digital-human-host${isVisitorHome ? " stage-host" : " pip-host"}`}
          aria-label="AI 数字人讲解台"
          hidden={activeView !== "chat"}
        >
          <DigitalHumanPanel
            latestAnswer={response?.answer ?? serviceNarration?.text ?? ""}
            latestAnswerKey={
              response
                ? response.record_id !== null
                  ? `record-${response.record_id}`
                  : `${response.session_id}-${response.latency_ms}-${response.answer}`
                : serviceNarration?.key ?? ""
            }
            isAnswerLoading={isLoading}
            refreshKey={digitalHumanRefreshKey}
            mode={isVisitorHome ? "stage" : "pip"}
            question={question}
            isListening={isListening}
            isRecognizing={isRecognizing}
            onQuestionChange={setQuestion}
            onSubmitQuestion={() => void askQuestion(question)}
            onToggleListening={() => void toggleListening()}
          />
        </section>

        <section
          className={
            activeView === "admin"
              ? "admin-column"
              : `right-column${isVisitorHome ? "" : " visitor-feature-column"}`
          }
          aria-label={activeView === "chat" ? (isVisitorHome ? "游客问答" : "游客功能专页") : "管理后台"}
        >

          {activeView === "chat" ? (
            isVisitorHome ? (
              <>
                <GuideQuestionPanel
                  question={question}
                  isLoading={isLoading}
                  isListening={isListening}
                  isRecognizing={isRecognizing}
                  onQuestionChange={setQuestion}
                  onQuickQuestion={setQuestion}
                  onSubmit={submitQuestion}
                  onToggleListening={() => void toggleListening()}
                />

                {error ? <p className="error-message">{error}</p> : null}
                {speechError ? <p className="error-message">{speechError}</p> : null}
                {feedbackError && activeView === "chat" ? (
                  <p className="error-message">{feedbackError}</p>
                ) : null}

                <AnswerPreviewCard
                  response={response}
                  servicePreview={activeGuideService}
                  isLoading={isLoading}
                  feedbackStatus={feedbackStatus}
                  feedbackText={feedbackText}
                  isFeedbackNoteOpen={isFeedbackNoteOpen}
                  isSubmittingFeedback={isSubmittingFeedback}
                  onFeedback={(rating) => void submitFeedback(rating)}
                  onFeedbackTextChange={setFeedbackText}
                  onToggleFeedbackNote={() => setIsFeedbackNoteOpen((isOpen) => !isOpen)}
                  onSubmitFeedbackNote={() => {
                    if (feedbackStatus) {
                      void submitFeedback(feedbackStatus.rating);
                    }
                  }}
                />
              </>
            ) : (
              <section className="visitor-feature-page" aria-label={selectedVisitorPage?.title}>
                <button
                  type="button"
                  className="visitor-home-button visitor-home-floating"
                  onClick={() => navigateToVisitorPage("home")}
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  返回首页
                </button>
                {visitorPage === "route" ? (
                  <div className="visitor-feature-content route-feature-content">
                    <ScenicMapPanel
                      defaultMode="route_guide"
                      onNarrationChange={setServiceNarration}
                      onOpenMapDestination={openRouteStopInMap}
                      onAskRouteStop={askAboutRouteStop}
                    />
                  </div>
                ) : visitorPage === "map" ? (
                  <div className="visitor-feature-content map-feature-content">
                    <ScenicMapPanel
                      defaultMode="map_guide"
                      initialDestination={mapDestination}
                      immersive
                      onNarrationChange={setServiceNarration}
                    />
                  </div>
                ) : visitorPage === "vr" ? (
                  <div className="visitor-feature-content vr-feature-content">
                    <PanoramaExperience />
                  </div>
                ) : (
                  <div className="visitor-feature-placeholder">
                    <strong>{selectedVisitorPage?.title}</strong>
                    <p>页面框架已经接入，本专页内容将在对应独立功能分支中完成。</p>
                  </div>
                )}

                {error ? <p className="error-message feature-error">{error}</p> : null}
                {speechError ? <p className="error-message feature-error">{speechError}</p> : null}
              </section>
            )
          ) : (
            <section className="admin-console" aria-label="管理后台">
              <header className="admin-shell">
                <div className="admin-title-block">
                  <p className="eyebrow">ADMIN CONSOLE</p>
                  <h2>灵山胜境 AI 导游管理后台</h2>
                  <p>
                    问答运营、知识库质检、数字人服务监控
                  </p>
                </div>
                <div className="admin-head-actions" aria-label="后台控制项">
                  <div className="admin-range-tabs" aria-label="时间范围筛选">
                    {[
                      { id: "today", label: "今日" },
                      { id: "7d", label: "近 7 天" },
                      { id: "30d", label: "近 30 天" },
                    ].map((range) => (
                      <button
                        key={range.id}
                        type="button"
                        className={adminTimeRange === range.id ? "active" : ""}
                        onClick={() =>
                          changeAdminTimeRange(range.id as "today" | "7d" | "30d")
                        }
                        aria-pressed={adminTimeRange === range.id}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                  <span className="admin-status-pill">
                    <span aria-hidden="true" />
                    数字人在线
                  </span>
                  <button
                    type="button"
                    className="secondary-action admin-refresh"
                    onClick={() => void loadAdminData()}
                    disabled={adminIsRefreshing}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    {adminIsRefreshing ? "刷新中..." : "刷新全部"}
                  </button>
                  <button
                    type="button"
                    className="secondary-action admin-refresh"
                    onClick={() => setActiveView("chat")}
                  >
                    游客端
                  </button>
                </div>
              </header>

              <nav className="admin-tabs" aria-label="管理后台模块">
                {adminSections.map((section) => {
                  const SectionIcon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={activeAdminSection === section.id ? "active" : ""}
                      onClick={() => setActiveAdminSection(section.id)}
                      aria-pressed={activeAdminSection === section.id}
                    >
                      <SectionIcon size={18} aria-hidden="true" />
                      <span>
                        <strong>{section.label}</strong>
                        <small>{section.description}</small>
                      </span>
                    </button>
                  );
                })}
              </nav>

              {adminErrors.map((message, index) => (
                <p key={`admin-error-${index}`} className="error-message">
                  {message}
                </p>
              ))}

              <section className="admin-section">
                {activeAdminSection === "overview" ? (
              <DashboardPanel
                dashboard={dashboard}
                overview={overview}
                lowConfidenceRecords={lowConfidenceRecords}
                isLoading={dashboardLoading}
                error={dashboardError}
                onRefresh={() => void loadDashboard()}
                onPendingAction={handlePendingDashboardAction}
                onViewQuestion={openQuestionDetail}
                onAddKnowledge={createKnowledgeDraftFromQuestion}
                onMarkUnrelated={markQuestionUnrelated}
                onReviewLowConfidence={handleLowConfidenceAction}
              />
                ) : null}

                {activeAdminSection === "insights" ? (
                  <>
              <VisitorReportPanel
                report={visitorReport}
                isLoading={visitorReportLoading}
                error={visitorReportError}
                onRefresh={() => void loadVisitorReport()}
              />
                  </>
                ) : null}

                {activeAdminSection === "avatar" ? (
              <AvatarManager
                onAvatarSelected={() =>
                  setDigitalHumanRefreshKey((current) => current + 1)
                }
              />
                ) : null}

                {activeAdminSection === "insights" ? (
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
                ) : null}

                {activeAdminSection === "qa" ? (
                  <>
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
                  </>
                ) : null}

                {activeAdminSection === "knowledge" ? (
              <KnowledgeManager initialDraft={knowledgeDraft} />
                ) : null}

                {activeAdminSection === "qa" ? (
                  <>
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
                      dashboardLoading ||
                      lowConfidenceLoading ||
                      feedbackLoading ||
                      visitorReportLoading
                    }
                  >
                    {recordsLoading ||
                    overviewLoading ||
                    dashboardLoading ||
                    lowConfidenceLoading ||
                    feedbackLoading ||
                    visitorReportLoading
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
                  </>
                ) : null}
              </section>
            </section>
          )}
        </section>
        {activeView === "chat" && isVisitorHome ? (
          <GuideServiceBar
            entries={guideServiceEntries}
            isLoading={isLoading}
            activeIntent={visitorIntent ?? activeGuideService?.id}
            onSelect={openGuideService}
          />
        ) : null}
      </section>
    </main>
  );
}
