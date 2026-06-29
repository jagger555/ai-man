import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  buildAdminStats,
  formatTimestamp,
  getConfidenceBand,
  getModelBucket,
  getModelLabel,
  truncate,
} from "./utils";
import { ErrorBoundary } from "./ErrorBoundary";
import { DashboardPanel } from "./DashboardPanel";
import { DigitalHumanPanel } from "./DigitalHumanPanel";
import { KnowledgeManager } from "./KnowledgeManager";
import { VisitorReportPanel } from "./VisitorReportPanel";
import { AvatarManager } from "./AvatarManager";

const sampleQuestions = [
  "九龙灌浴几点开始？",
  "灵山大佛为什么是核心景点？",
  "第一次来灵山胜境怎么游玩？",
  "亲子家庭推荐哪条路线？",
  "灵山梵宫有什么看点？",
  "五印坛城适合拍照吗？",
];

const scenicTags = [
  "国家 AAAAA 级景区",
  "佛教文化朝圣",
  "太湖山水",
  "世界佛教论坛永久会址",
];

const featuredSpots = [
  {
    name: "灵山大佛",
    type: "核心地标",
    highlight: "88 米露天青铜释迦牟尼立像，登顶可俯瞰太湖。",
  },
  {
    name: "九龙灌浴",
    type: "动态演艺",
    highlight: "花开见佛，九龙沐浴，适合首次入园游客观看。",
  },
  {
    name: "灵山梵宫",
    type: "艺术殿堂",
    highlight: "佛教艺术与现代科技融合，可观看《吉祥颂》。",
  },
  {
    name: "祥符禅寺",
    type: "千年古刹",
    highlight: "小灵山佛教文化根基，适合历史文化讲解。",
  },
];

type HeroHeaderProps = {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
};

function HeroHeader({ activeView, onViewChange }: HeroHeaderProps) {
  return (
    <header className="hero-header" aria-label="灵山胜境 AI 数字导游">
      <div className="brand-mark" aria-hidden="true">
        <span />
      </div>
      <div className="hero-copy">
        <p className="eyebrow">灵山胜境 AI 数字导游中控台</p>
        <h1>让数字人替游客讲清每一处灵山</h1>
        <p>
          面向游客咨询、路线规划和文化讲解的数字导游屏。前台专注问答和讲解，
          管理入口收进后台，不干扰游客使用。
        </p>
        <div className="tag-row" aria-label="景区标签">
          {scenicTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <nav className="admin-entry" aria-label="页面入口">
        <button
          type="button"
          className={activeView === "chat" ? "active" : ""}
          onClick={() => onViewChange("chat")}
        >
          游客导览
        </button>
        <button
          type="button"
          className={activeView === "admin" ? "active" : ""}
          onClick={() => onViewChange("admin")}
        >
          管理后台
        </button>
      </nav>
    </header>
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
  const [digitalHumanRefreshKey, setDigitalHumanRefreshKey] = useState(0);

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

  const sessionId = useMemo(() => `web-${Date.now()}`, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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

  const stats = buildAdminStats(overview, overviewLoading);
  const adminErrors = [
    recordsError,
    overviewError,
    lowConfidenceError,
    feedbackError,
  ].filter(Boolean);

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
      stopSpeechCapture();
      stopCurrentAudio();
    };
  }, []);

  async function toggleListening() {
    if (isListening) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSpeechError("当前浏览器不支持语音录入");
      return;
    }

    setSpeechError("");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/wav",
        });
        audioChunksRef.current = [];
        stopSpeechCapture();
        if (audioBlob.size > 0) {
          void recognizeSpeech(audioBlob);
        }
      };

      setupSilenceDetection(stream);
      recorder.start();
      setIsListening(true);
    } catch (caught) {
      stopSpeechCapture();
      setSpeechError(
        caught instanceof Error ? caught.message : "无法获取麦克风权限",
      );
    }
  }

  function setupSilenceDetection(stream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.fftSize);
    const detectSilence = () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const value of buffer) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const volume = Math.sqrt(sum / buffer.length);
      if (volume < 0.018) {
        if (silenceTimerRef.current === null) {
          silenceTimerRef.current = window.setTimeout(() => {
            stopRecording();
          }, 2000);
        }
      } else if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      animationFrameRef.current = window.requestAnimationFrame(detectSilence);
    };

    detectSilence();
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopSpeechCapture();
  }

  function stopSpeechCapture() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setIsListening(false);
  }

  async function recognizeSpeech(audioBlob: Blob) {
    setIsRecognizing(true);
    setSpeechError("");

    try {
      const formData = new FormData();
      const extension = audioBlob.type.includes("webm") ? "webm" : "wav";
      formData.append("audio", audioBlob, `speech.${extension}`);
      const result = await fetch("/api/speech/recognize", {
        method: "POST",
        body: formData,
      });
      if (!result.ok) {
        throw new Error(
          result.status === 502 ? "语音服务暂不可用" : `语音识别返回 ${result.status}`,
        );
      }
      const payload = (await result.json()) as { text: string };
      setQuestion(payload.text);
    } catch (caught) {
      setSpeechError(caught instanceof Error ? caught.message : "语音识别失败");
    } finally {
      setIsRecognizing(false);
    }
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
      setSpeechError(caught instanceof Error ? caught.message : "语音播报失败");
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

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          question: trimmedQuestion,
        }),
      });

      if (!result.ok) {
        throw new Error(`问答接口返回 ${result.status}`);
      }

      setResponse((await result.json()) as ChatResponse);
      await loadAdminData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "问答请求失败");
    } finally {
      setIsLoading(false);
    }
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
      setFeedbackError(caught instanceof Error ? caught.message : "提交反馈失败");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function loadAdminData() {
    await Promise.all([
      loadRecords(),
      loadOverview(),
      loadDashboard(),
      loadLowConfidenceRecords(),
      loadFeedbackRecords(),
      loadVisitorReport(),
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
      setRecordsError(caught instanceof Error ? caught.message : "读取记录失败");
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
      setOverviewError(caught instanceof Error ? caught.message : "读取统计信息失败");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const result = await fetch("/api/admin/dashboard?limit=8");
      if (!result.ok) {
        throw new Error(`数据大屏接口返回 ${result.status}`);
      }

      setDashboard((await result.json()) as DashboardData);
    } catch (caught) {
      setDashboardError(
        caught instanceof Error ? caught.message : "读取数据大屏失败",
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
        caught instanceof Error ? caught.message : "读取低置信度问题失败",
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
        caught instanceof Error ? caught.message : "读取反馈列表失败",
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadVisitorReport() {
    setVisitorReportLoading(true);
    setVisitorReportError("");

    try {
      const result = await fetch("/api/admin/visitor-report?limit=200");
      if (!result.ok) {
        throw new Error(`感受度报告接口返回 ${result.status}`);
      }

      setVisitorReport((await result.json()) as VisitorReport);
    } catch (caught) {
      setVisitorReportError(
        caught instanceof Error ? caught.message : "读取游客感受度报告失败",
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
    const matchedRecord = records.find((record) => record.id === recordId);
    if (matchedRecord) {
      setSelectedRecord(matchedRecord);
    }
  }

  function resetFilters() {
    setKeywordFilter("");
    setSessionFilter("");
    setConfidenceFilter("all");
    setReliableFilter("all");
    setModelFilter("all");
  }

  return (
    <main className="scenic-guide-page">
      <HeroHeader activeView={activeView} onViewChange={setActiveView} />
      <section className="main-layout">
        <section className="left-column" aria-label="AI 数字人讲解台">
          <DigitalHumanPanel
            latestAnswer={response?.answer ?? ""}
            latestAnswerKey={
              response
                ? response.record_id !== null
                  ? `record-${response.record_id}`
                  : `${response.session_id}-${response.latency_ms}-${response.answer}`
                : ""
            }
            isAnswerLoading={isLoading}
            refreshKey={digitalHumanRefreshKey}
          />
          <section className="featured-spots" aria-label="灵山核心景点">
            <div className="section-kicker">推荐讲解主题</div>
            <div className="spot-grid">
              {featuredSpots.map((spot) => (
                <article key={spot.name} className="spot-card">
                  <span>{spot.type}</span>
                  <strong>{spot.name}</strong>
                  <p>{spot.highlight}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section
          className="right-column"
          aria-label={activeView === "chat" ? "游客问答" : "管理后台"}
        >

          {activeView === "chat" ? (
            <>
              <form onSubmit={submitQuestion} className="guide-question-panel">
                <div className="question-panel-head">
                  <div>
                    <p className="eyebrow">游客提问</p>
                    <h2>想了解什么？</h2>
                  </div>
                  <span>路线、演出、文化寓意、亲子安排都可以问。</span>
                </div>
                <label className="sr-only" htmlFor="question">
                  输入你想了解的灵山胜境问题
                </label>
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="例如：九龙灌浴几点开始？第一次来灵山胜境怎么游玩？"
                />
                <div className="quick-questions">
                  {sampleQuestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setQuestion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="question-actions">
                  <button
                    className="voice-action"
                    type="button"
                    onClick={() => void toggleListening()}
                    disabled={isRecognizing}
                    title={isListening ? "停止录音" : "语音输入"}
                    aria-label={isListening ? "停止录音" : "语音输入"}
                  >
                    {isListening ? "■" : "●"}
                  </button>
                  <button className="primary-action" type="submit" disabled={isLoading}>
                    {isLoading ? "检索中..." : "请数字人讲解"}
                  </button>
                  <span className="speech-status">
                    {isListening
                      ? "正在聆听，静音 2 秒后自动识别"
                      : isRecognizing
                        ? "正在识别语音..."
                        : ""}
                  </span>
                </div>
              </form>

              {error ? <p className="error-message">{error}</p> : null}
              {speechError ? <p className="error-message">{speechError}</p> : null}
              {feedbackError && activeView === "chat" ? (
                <p className="error-message">{feedbackError}</p>
              ) : null}

              {response ? (
                <article className="answer-card">
                  <div className="answer-card-head">
                    <div>
                      <p className="eyebrow">AI 数字导游回答</p>
                      <h3>导游讲解</h3>
                    </div>
                    <span className={response.reliable ? "status-chip reliable" : "status-chip unreliable"}>
                      {response.reliable ? "资料可信" : "建议人工复核"}
                    </span>
                  </div>

                  <div className="answer-body">
                    <p>{response.answer}</p>
                    <button
                      type="button"
                      className="voice-action playback-action"
                      onClick={() => void toggleSpeechPlayback()}
                      title={isSpeaking ? "停止播报" : "语音播报"}
                      aria-label={isSpeaking ? "停止播报" : "语音播报"}
                    >
                      {isSpeaking ? "■" : "▶"}
                    </button>

                    <div className="answer-feedback-bar" aria-label="游客反馈">
                      <strong>这次回答有帮助吗？</strong>
                      {feedbackStatus?.recordId === response.record_id ? (
                        <span className="panel-note">
                          已反馈：{feedbackStatus.rating === "helpful" ? "有帮助" : "没有帮助"}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={
                          feedbackStatus?.rating === "helpful"
                            ? "feedback-button active"
                            : "feedback-button"
                        }
                        onClick={() => void submitFeedback("helpful")}
                        disabled={isSubmittingFeedback}
                      >
                        有帮助
                      </button>
                      <button
                        type="button"
                        className={
                          feedbackStatus?.rating === "unhelpful"
                            ? "feedback-button active"
                            : "feedback-button"
                        }
                        onClick={() => void submitFeedback("unhelpful")}
                        disabled={isSubmittingFeedback}
                      >
                        没有帮助
                      </button>
                      <button
                        type="button"
                        className={
                          isFeedbackNoteOpen
                            ? "feedback-button active"
                            : "feedback-button"
                        }
                        onClick={() => setIsFeedbackNoteOpen((isOpen) => !isOpen)}
                      >
                        补充意见
                      </button>
                    </div>
                    {isFeedbackNoteOpen ? (
                      <div className="feedback-note-popover">
                        <textarea
                          id="feedback-note"
                          value={feedbackText}
                          onChange={(event) => setFeedbackText(event.target.value)}
                          rows={3}
                          placeholder="可选：补充你觉得还缺什么信息"
                        />
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() =>
                            feedbackStatus
                              ? void submitFeedback(feedbackStatus.rating)
                              : undefined
                          }
                          disabled={!feedbackStatus || isSubmittingFeedback}
                        >
                          {feedbackStatus ? "提交意见" : "先选择评价"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ) : (
                <section className="answer-card empty-answer">
                  <p className="eyebrow">等待提问</p>
                  <h3>试试让数字导游先讲一段</h3>
                  <p>
                    选择上方快捷问题，或直接输入你想了解的景点、路线和文化背景。
                    生成答案后，数字人会自动开始播报。
                  </p>
                  <div className="empty-prompt-grid" aria-label="提问示例">
                    <span>演出时间</span>
                    <span>游览路线</span>
                    <span>文化典故</span>
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="admin-panel compact-admin" aria-label="管理后台">
              <section className="stats-grid">
                {stats.map((stat) => (
                  <article key={stat.label} className="stat-card">
                    <small>{stat.label}</small>
                    <strong>{stat.value}</strong>
                    <p>{stat.helper}</p>
                  </article>
                ))}
              </section>

              <DashboardPanel
                dashboard={dashboard}
                isLoading={dashboardLoading}
                error={dashboardError}
                onRefresh={() => void loadDashboard()}
              />

              <VisitorReportPanel
                report={visitorReport}
                isLoading={visitorReportLoading}
                error={visitorReportError}
                onRefresh={() => void loadVisitorReport()}
              />

              <AvatarManager
                onAvatarSelected={() =>
                  setDigitalHumanRefreshKey((current) => current + 1)
                }
              />

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

              <KnowledgeManager />

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

              {adminErrors.map((message, index) => (
                <p key={`admin-error-${index}`} className="error-message">
                  {message}
                </p>
              ))}

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
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
