import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  Maximize2,
  MessageCircleQuestion,
  Mic,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Volume2,
} from "lucide-react";
import type { DigitalHumanConfig } from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
export type DigitalHumanDisplayMode = "stage" | "pip";

type DigitalHumanPanelProps = {
  latestAnswer: string;
  latestAnswerKey: string;
  isAnswerLoading: boolean;
  refreshKey?: number;
  pipQuestionOpenRequest?: number;
  mode?: DigitalHumanDisplayMode;
  question?: string;
  isListening?: boolean;
  isRecognizing?: boolean;
  onQuestionChange?: (question: string) => void;
  onSubmitQuestion?: () => void;
  onToggleListening?: () => void;
};

type PipPosition = {
  left: number;
  top: number;
};

type PipAnchor = {
  x: number;
  y: number;
};

type PipDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  hasMoved: boolean;
};

const ICE_GATHERING_TIMEOUT_MS = 15000;
const LIVETALKING_OFFER_TIMEOUT_MS = 15000;

const connectionStateLabels: Record<ConnectionState, string> = {
  idle: "待连接",
  connecting: "连接中",
  connected: "实时讲解",
  error: "连接异常",
};

function getReadableFetchError(caught: unknown, fallback: string) {
  if (!(caught instanceof Error)) {
    return fallback;
  }
  if (
    caught.name === "AbortError" ||
    caught.name === "TypeError" ||
    caught.message === "Failed to fetch"
  ) {
    return fallback;
  }
  return caught.message;
}

function MistMountainLayer() {
  return (
    <div className="mist-mountain-layer" aria-hidden="true">
      <span className="mist-cloud mist-cloud-one" />
      <span className="mist-cloud mist-cloud-two" />
      <span className="mountain-shape mountain-shape-left" />
      <span className="mountain-shape mountain-shape-right" />
    </div>
  );
}

function LotusWatermark() {
  return (
    <div className="lotus-watermark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function ScenicStageFrame({ children }: { children: ReactNode }) {
  return <div className="scenic-stage-frame">{children}</div>;
}

function getCaptionText(latestAnswer: string) {
  const trimmedAnswer = latestAnswer.trim();
  if (!trimmedAnswer) {
    return "您好，我是灵山数字导游，可以为您介绍路线、景点和文化故事。";
  }
  return trimmedAnswer.length > 58 ? `${trimmedAnswer.slice(0, 58)}...` : trimmedAnswer;
}

export function DigitalHumanPanel({
  latestAnswer,
  latestAnswerKey,
  isAnswerLoading,
  refreshKey = 0,
  pipQuestionOpenRequest = 0,
  mode = "stage",
  question = "",
  isListening = false,
  isRecognizing = false,
  onQuestionChange,
  onSubmitQuestion,
  onToggleListening,
}: DigitalHumanPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const configRef = useRef<DigitalHumanConfig | null>(null);
  const sessionIdRef = useRef("");
  const connectionAttemptRef = useRef(0);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(false);
  const pendingAnswerRef = useRef<{ key: string; text: string } | null>(null);
  const autoAttemptedAnswerKeyRef = useRef("");
  const spokenAnswerKeyRef = useRef("");
  const loadingPromptSentRef = useRef(false);
  const pipDragRef = useRef<PipDragState | null>(null);
  const pipAnchorRef = useRef<PipAnchor | null>(null);
  const suppressPipExpandClickRef = useRef(false);
  const lastPipQuestionOpenRequestRef = useRef(pipQuestionOpenRequest);
  const [config, setConfig] = useState<DigitalHumanConfig | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusMessage, setStatusMessage] = useState("等待连接 LiveTalking 服务");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [isPipCollapsed, setIsPipCollapsed] = useState(false);
  const [isPipQuestionOpen, setIsPipQuestionOpen] = useState(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [isPipDragging, setIsPipDragging] = useState(false);
  const [pipPosition, setPipPosition] = useState<PipPosition | null>(null);
  const [pipAnchor, setPipAnchor] = useState<PipAnchor | null>(null);

  configRef.current = config;
  sessionIdRef.current = sessionId;

  const canSpeak =
    connectionState === "connected" && sessionId.length > 0 && latestAnswer.trim().length > 0;
  const stageStateLabel = isAnswerLoading
    ? "正在讲解"
    : connectionState === "connected"
      ? "实时讲解"
      : connectionStateLabels[connectionState];

  useEffect(() => {
    isMountedRef.current = true;
    const controller = new AbortController();
    void loadConfigAndConnect(controller.signal);
    return () => {
      isMountedRef.current = false;
      controller.abort();
      closeConnection();
    };
  }, [refreshKey]);

  useEffect(() => {
    const handlePageExit = () => {
      notifySessionInterruptOnExit();
      closePeerConnection();
      cleanupMediaElements();
    };

    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);
    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, []);

  useEffect(() => {
    if (
      mode === "pip" &&
      pipQuestionOpenRequest !== lastPipQuestionOpenRequestRef.current
    ) {
      setIsPipCollapsed(false);
      setIsPipQuestionOpen(true);
    }
    lastPipQuestionOpenRequestRef.current = pipQuestionOpenRequest;
  }, [mode, pipQuestionOpenRequest]);

  useEffect(() => {
    if (mode !== "pip") {
      return;
    }

    const restorePipAnchor = () => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      const currentAnchor = pipAnchorRef.current;
      setPipPosition(
        currentAnchor ? getPipPositionFromAnchor(currentAnchor, rect.width, rect.height) : null,
      );
    };

    const handleViewportChange = () => window.requestAnimationFrame(restorePipAnchor);
    restorePipAnchor();
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [mode, isPipCollapsed, pipAnchor]);

  useEffect(() => {
    if (mode !== "pip") {
      return;
    }
    const handleGlobalPointerMove = (event: PointerEvent) => {
      updatePipFromPointer(event.pointerId, event.clientX, event.clientY);
    };
    const handleGlobalPointerEnd = (event: PointerEvent) => {
      finishPipDrag(event.pointerId);
    };
    window.addEventListener("pointermove", handleGlobalPointerMove, true);
    window.addEventListener("pointerup", handleGlobalPointerEnd, true);
    window.addEventListener("pointercancel", handleGlobalPointerEnd, true);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove, true);
      window.removeEventListener("pointerup", handleGlobalPointerEnd, true);
      window.removeEventListener("pointercancel", handleGlobalPointerEnd, true);
    };
  }, [mode]);

  useEffect(() => {
    const trimmedAnswer = latestAnswer.trim();
    if (!trimmedAnswer || !latestAnswerKey) {
      return;
    }
    if (spokenAnswerKeyRef.current === latestAnswerKey) {
      return;
    }
    if (autoAttemptedAnswerKeyRef.current === latestAnswerKey) {
      return;
    }

    pendingAnswerRef.current = {
      key: latestAnswerKey,
      text: trimmedAnswer,
    };
    void flushPendingAnswer();
  }, [latestAnswer, latestAnswerKey, connectionState, sessionId, isSpeaking]);

  useEffect(() => {
    if (!isAnswerLoading) {
      loadingPromptSentRef.current = false;
      return;
    }
    if (
      loadingPromptSentRef.current ||
      connectionState !== "connected" ||
      !sessionId ||
      isSpeaking
    ) {
      return;
    }

    loadingPromptSentRef.current = true;
    void speakText("好的，我马上为您讲解。");
  }, [isAnswerLoading, connectionState, sessionId, isSpeaking]);

  async function loadConfigAndConnect(signal?: AbortSignal) {
    try {
      setStatusMessage("正在读取数字人配置...");
      const response = await fetch("/api/digital-human/config", { signal });
      if (!response.ok) {
        throw new Error(`数字人配置接口返回 ${response.status}`);
      }
      const payload = (await response.json()) as DigitalHumanConfig;
      if (signal?.aborted || !isMountedRef.current) {
        return;
      }
      setConfig(payload);
      if (!payload.enabled) {
        setConnectionState("idle");
        setStatusMessage("数字人服务未启用");
        return;
      }
      await connectDigitalHuman(payload, signal);
    } catch (caught) {
      if (signal?.aborted) {
        return;
      }
      setConnectionState("error");
      setStatusMessage(
        getReadableFetchError(caught, "数字人配置读取失败，文本问答仍可使用"),
      );
    }
  }

  async function connectDigitalHuman(nextConfig = config, signal?: AbortSignal) {
    if (!nextConfig?.enabled || !nextConfig.base_url) {
      setConnectionState("error");
      setStatusMessage("缺少 DIGITAL_HUMAN_BASE_URL 配置");
      return;
    }
    if (isConnectingRef.current) {
      return;
    }

    const attemptId = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attemptId;
    isConnectingRef.current = true;
    closeConnection();
    setConnectionState("connecting");
    setStatusMessage(`正在连接 LiveTalking：${nextConfig.base_url}`);
    setIsAudioBlocked(false);

    try {
      const peerConnection = new RTCPeerConnection({
        sdpSemantics: "unified-plan",
      } as RTCConfiguration);
      peerConnectionRef.current = peerConnection;

      peerConnection.addEventListener("connectionstatechange", () => {
        if (peerConnectionRef.current !== peerConnection) {
          return;
        }
        if (peerConnection.connectionState === "connected") {
          setConnectionState("connected");
        }
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          cleanupMediaElements();
          peerConnectionRef.current = null;
          setSessionId("");
          setConnectionState("error");
          setStatusMessage("LiveTalking 连接已断开，可重新连接");
        }
      });

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerConnection.addTransceiver("audio", { direction: "recvonly" });
      peerConnection.addEventListener("track", (event) => {
        const [stream] = event.streams;
        if (!stream) {
          return;
        }
        if (event.track.kind === "video" && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        if (event.track.kind === "audio" && audioRef.current) {
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => {
            setIsAudioBlocked(true);
          });
        }
      });

      const offer = await peerConnection.createOffer();
      if (signal?.aborted || !isMountedRef.current) {
        peerConnection.close();
        return;
      }
      await peerConnection.setLocalDescription(offer);
      setStatusMessage("正在收集 WebRTC 候选，准备连接 LiveTalking...");
      await waitForIceGathering(peerConnection);
      if (signal?.aborted || !isMountedRef.current) {
        peerConnection.close();
        return;
      }

      const localDescription = peerConnection.localDescription;
      if (!localDescription) {
        throw new Error("浏览器未生成 WebRTC Offer");
      }

      const offerController = new AbortController();
      const abortOffer = () => offerController.abort();
      const offerTimeoutId = window.setTimeout(abortOffer, LIVETALKING_OFFER_TIMEOUT_MS);
      signal?.addEventListener("abort", abortOffer, { once: true });
      let response: Response;
      try {
        setStatusMessage("正在向 LiveTalking 发送 WebRTC Offer...");
        response = await fetch(`${nextConfig.base_url}/offer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sdp: localDescription.sdp,
            type: localDescription.type,
            avatar: nextConfig.avatar || undefined,
            refaudio: nextConfig.ref_audio || undefined,
            reftext: nextConfig.ref_text || undefined,
          }),
          signal: offerController.signal,
        });
      } finally {
        window.clearTimeout(offerTimeoutId);
        signal?.removeEventListener("abort", abortOffer);
      }

      if (!response.ok) {
        throw new Error(`LiveTalking /offer 返回 ${response.status}`);
      }

      const answer = (await response.json()) as RTCSessionDescriptionInit & {
        sessionid?: string;
      };
      if (connectionAttemptRef.current !== attemptId) {
        peerConnection.close();
        return;
      }
      if (signal?.aborted || !isMountedRef.current) {
        peerConnection.close();
        return;
      }
      await peerConnection.setRemoteDescription(answer);
      setSessionId(answer.sessionid ?? "");
      setConnectionState("connected");
      setStatusMessage(
        answer.sessionid
          ? `数字人已连接，会话 ${answer.sessionid}`
          : "数字人已连接，但未返回 sessionid",
      );
    } catch (caught) {
      if (signal?.aborted) {
        return;
      }
      closeConnection();
      setConnectionState("error");
      const fallbackMessage =
        caught instanceof Error && caught.name === "AbortError"
          ? "LiveTalking 已启动但 /offer 响应超时，请稍后重试或检查 LiveTalking 控制台日志"
          : "未检测到 LiveTalking 服务，文本问答仍可使用";
      setStatusMessage(
        getReadableFetchError(caught, fallbackMessage),
      );
    } finally {
      if (connectionAttemptRef.current === attemptId) {
        isConnectingRef.current = false;
      }
    }
  }

  async function speakLatestAnswer() {
    const trimmedAnswer = latestAnswer.trim();
    if (!trimmedAnswer) {
      return;
    }
    const didSpeak = await speakText(trimmedAnswer);
    if (didSpeak && latestAnswerKey) {
      spokenAnswerKeyRef.current = latestAnswerKey;
      pendingAnswerRef.current = null;
    }
  }

  async function flushPendingAnswer() {
    const pendingAnswer = pendingAnswerRef.current;
    if (
      !pendingAnswer ||
      spokenAnswerKeyRef.current === pendingAnswer.key ||
      connectionState !== "connected" ||
      !sessionId ||
      isSpeaking
    ) {
      return;
    }

    pendingAnswerRef.current = null;
    autoAttemptedAnswerKeyRef.current = pendingAnswer.key;
    const didSpeak = await speakText(pendingAnswer.text);
    if (didSpeak) {
      spokenAnswerKeyRef.current = pendingAnswer.key;
    }
  }

  async function speakText(text: string) {
    if (!config || !sessionId || !text.trim() || isSpeaking) {
      return false;
    }

    setIsSpeaking(true);
    setStatusMessage("正在把回答发送给数字人播报...");
    try {
      const response = await fetch(`${config.base_url}/human`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionid: sessionId,
          text: text.trim(),
          type: "echo",
          interrupt: true,
          tts: config.voice ? { voice: config.voice } : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`LiveTalking /human 返回 ${response.status}`);
      }
      const payload = (await response.json()) as { code?: number; msg?: string };
      if (payload.code !== 0) {
        throw new Error(payload.msg || "LiveTalking 拒绝播报请求");
      }
      setStatusMessage("数字人正在播报当前回答");
      return true;
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "数字人播报失败");
      return false;
    } finally {
      setIsSpeaking(false);
    }
  }

  async function interruptSpeaking() {
    if (!config || !sessionId) {
      return;
    }
    try {
      await fetch(`${config.base_url}/interrupt_talk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionid: sessionId }),
      });
      setStatusMessage("已请求打断数字人播报");
    } catch {
      setStatusMessage("打断播报请求失败");
    }
  }

  function closeConnection() {
    closePeerConnection();
    setSessionId("");
    cleanupMediaElements();
  }

  function closePeerConnection() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    sessionIdRef.current = "";
  }

  function notifySessionInterruptOnExit() {
    const currentConfig = configRef.current;
    const currentSessionId = sessionIdRef.current;
    if (!currentConfig?.base_url || !currentSessionId) {
      return;
    }

    const payload = JSON.stringify({ sessionid: currentSessionId });
    const endpoint = `${currentConfig.base_url}/interrupt_talk`;
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        endpoint,
        new Blob([payload], { type: "application/json" }),
      );
      if (queued) {
        return;
      }
    }

    void fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }

  function cleanupMediaElements() {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }

  async function enableAudio() {
    if (!audioRef.current) {
      return;
    }
    try {
      await audioRef.current.play();
      setIsAudioBlocked(false);
    } catch {
      setStatusMessage("浏览器仍然阻止自动播放声音，请检查站点声音权限");
    }
  }

  function beginPipDrag(event: ReactPointerEvent<HTMLElement>) {
    if (mode !== "pip" || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    const collapsedDragHandle = target.closest(".pip-expand-button");
    if (
      target.closest("input, form") ||
      (!isPipCollapsed && target.closest("button:not(.pip-caption)")) ||
      (isPipCollapsed && !collapsedDragHandle)
    ) {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    pipDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      hasMoved: false,
    };
    suppressPipExpandClickRef.current = false;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The global drag layer keeps movement working when browser zoom or the map iframe blocks capture.
    }
    setIsPipDragging(true);
  }

  function movePip(event: ReactPointerEvent<HTMLElement>) {
    updatePipFromPointer(event.pointerId, event.clientX, event.clientY);
  }

  function updatePipFromPointer(pointerId: number, clientX: number, clientY: number) {
    const drag = pipDragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.pointerId !== pointerId) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      drag.hasMoved = true;
    }
    const nextPosition = clampPipPosition(
      drag.originLeft + deltaX,
      drag.originTop + deltaY,
      rect.width,
      rect.height,
    );
    pipAnchorRef.current = getPipAnchorFromPosition(nextPosition, rect.width, rect.height);
    setPipPosition(nextPosition);
  }

  function endPipDrag(event: ReactPointerEvent<HTMLElement>) {
    if (pipDragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishPipDrag(event.pointerId);
  }

  function finishPipDrag(pointerId: number) {
    const drag = pipDragRef.current;
    if (drag?.pointerId !== pointerId) {
      return;
    }
    const panel = panelRef.current;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const position = { left: rect.left, top: rect.top };
      if (isPipAtDefaultCorner(position, rect.width, rect.height)) {
        pipAnchorRef.current = null;
        setPipAnchor(null);
        setPipPosition(null);
      } else {
        const nextAnchor = getPipAnchorFromPosition(position, rect.width, rect.height);
        pipAnchorRef.current = nextAnchor;
        setPipAnchor(nextAnchor);
        setPipPosition(getPipPositionFromAnchor(nextAnchor, rect.width, rect.height));
      }
    }
    if (isPipCollapsed && drag.hasMoved) {
      suppressPipExpandClickRef.current = true;
    }
    pipDragRef.current = null;
    setIsPipDragging(false);
  }

  function submitPipQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || isAnswerLoading) {
      return;
    }
    onSubmitQuestion?.();
  }

  const pipStyle =
    mode === "pip" && pipPosition
      ? {
          left: `${pipPosition.left}px`,
          top: `${pipPosition.top}px`,
          right: "auto",
          bottom: "auto",
        }
      : undefined;

  const fullCaption = latestAnswer.trim() || "您好，我是灵山数字导游，可以为您介绍路线、景点和文化故事。";
  const shouldScrollCaption = fullCaption.length > 22 && !isCaptionExpanded;
  const captionScrollDuration = Math.min(60, Math.max(24, Math.ceil(fullCaption.length / 2.2)));

  return (
    <section
      ref={panelRef}
      className={`digital-human-live-card ${mode === "pip" ? "pip-mode" : "stage-mode"}${
        isPipCollapsed ? " is-collapsed" : ""
      }${isPipDragging ? " is-dragging" : ""}${isPipQuestionOpen ? " is-question-open" : ""}`}
      style={pipStyle}
      aria-label={mode === "pip" ? "数字人画中画" : "LiveTalking 数字人"}
      onPointerDown={beginPipDrag}
      onPointerMove={movePip}
      onPointerUp={endPipDrag}
      onPointerCancel={endPipDrag}
    >
      <MistMountainLayer />
      {mode === "pip" && isPipDragging ? <span className="pip-drag-shield" aria-hidden="true" /> : null}
      {mode === "pip" ? (
        <svg className="pip-avatar-mask-defs" aria-hidden="true">
          <defs>
            <clipPath id="guide-pip-avatar-clip" clipPathUnits="objectBoundingBox">
              <ellipse cx="0.5" cy="0.25" rx="0.19" ry="0.24" />
              <path d="M 0.29 0.42 Q 0.5 0.36 0.71 0.42 L 0.94 1 L 0.06 1 Z" />
            </clipPath>
          </defs>
        </svg>
      ) : null}
      {mode === "stage" ? (
        <div className="stage-head">
          <div className="stage-title-block">
            <p className="eyebrow">灵山数字导游</p>
            <strong>灵山数字人导游</strong>
          </div>
          <div className="stage-head-actions">
            <span className={`stage-state ${connectionState}`}>
              <span />
              {stageStateLabel}
            </span>
          </div>
        </div>
      ) : null}
      <ScenicStageFrame>
        <LotusWatermark />
        <div className="live-stage">
          <video ref={videoRef} autoPlay playsInline muted className="live-video" />
          <audio ref={audioRef} autoPlay />
          {connectionState !== "connected" ? (
            <div className="live-placeholder">
              <div className="standby-frame" aria-hidden="true">
                <div className="standby-orbit">
                  <span />
                  <span />
                  <span />
                </div>
                <div className={isAnswerLoading ? "standby-avatar speaking" : "standby-avatar"}>
                  <span className="standby-head" />
                  <span className="standby-body" />
                  <span className="standby-wave" />
                </div>
              </div>
              <div className="standby-copy">
                <strong>数字导游待机中</strong>
                <span>连接 LiveTalking 后显示实时形象、语音与口型</span>
              </div>
            </div>
          ) : null}
        </div>
      </ScenicStageFrame>
      {mode === "pip" ? (
        <button
          type="button"
          className={`stage-caption pip-caption${shouldScrollCaption ? " is-scrolling" : ""}`}
          aria-expanded={isCaptionExpanded}
          title={isCaptionExpanded ? "收起完整字幕" : "展开完整字幕"}
          onClick={() => setIsCaptionExpanded((expanded) => !expanded)}
        >
          <span
            className="pip-caption-track"
            style={shouldScrollCaption ? { animationDuration: `${captionScrollDuration}s` } : undefined}
          >
            <span>{fullCaption}</span>
            {shouldScrollCaption ? <span aria-hidden="true">{fullCaption}</span> : null}
          </span>
        </button>
      ) : (
        <p className="stage-caption">{getCaptionText(latestAnswer)}</p>
      )}

      {mode === "pip" ? (
        <>
          {isPipQuestionOpen ? (
            <form className="pip-question-sheet" onSubmit={submitPipQuestion}>
              <label htmlFor="pip-guide-question">向数字导游提问</label>
              <div className="pip-question-row">
                <input
                  id="pip-guide-question"
                  value={question}
                  onChange={(event) => onQuestionChange?.(event.target.value)}
                  placeholder="输入路线或景点问题"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={isListening || isRecognizing ? "active" : ""}
                  aria-label={isListening ? "结束语音输入" : isRecognizing ? "正在识别语音" : "开始语音输入"}
                  title={isListening ? "结束语音输入" : "语音输入"}
                  onClick={onToggleListening}
                  disabled={isRecognizing}
                >
                  <Mic size={15} aria-hidden="true" />
                </button>
                <button
                  type="submit"
                  className="submit"
                  aria-label="发送问题"
                  title="发送问题"
                  disabled={!question.trim() || isAnswerLoading}
                >
                  <Send size={15} aria-hidden="true" />
                </button>
              </div>
              <div className={`pip-connection-row ${connectionState}`}>
                <span>{statusMessage}</span>
                <button
                  type="button"
                  aria-label="重新连接数字人"
                  title="重新连接"
                  onClick={() => void connectDigitalHuman()}
                  disabled={connectionState === "connecting"}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              </div>
            </form>
          ) : null}
          <div className="digital-human-actions pip-actions" aria-label="数字人控制">
            <button
              type="button"
              className={isPipQuestionOpen ? "active" : ""}
              aria-label="向数字人提问"
              title="提问"
              aria-expanded={isPipQuestionOpen}
              onClick={() => setIsPipQuestionOpen((open) => !open)}
            >
              <MessageCircleQuestion size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="暂停数字人播报"
              title="暂停播报"
              onClick={() => void interruptSpeaking()}
              disabled={!sessionId}
            >
              <Pause size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="primary"
              aria-label="播放最近回答"
              title="播放回答"
              onClick={() => void speakLatestAnswer()}
              disabled={!canSpeak || isSpeaking}
            >
              <Play size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="收起数字人"
              title="收起数字人"
              onClick={() => {
                setIsPipCollapsed(true);
                setIsPipQuestionOpen(false);
              }}
            >
              <Minimize2 size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : (
        <div className="digital-human-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={() => void connectDigitalHuman()}
            disabled={connectionState === "connecting"}
          >
            <RotateCcw size={16} aria-hidden="true" />
            重新连接
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void interruptSpeaking()}
            disabled={!sessionId}
          >
            <Pause size={16} aria-hidden="true" />
            暂停播报
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void speakLatestAnswer()}
            disabled={!canSpeak || isSpeaking}
          >
            <Volume2 size={16} aria-hidden="true" />
            {isSpeaking ? "发送中..." : "播报回答"}
          </button>
          {isAudioBlocked ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => void enableAudio()}
            >
              启用声音
            </button>
          ) : null}
        </div>
      )}

      <p className={`digital-human-status ${connectionState}`}>{statusMessage}</p>
      {mode === "pip" && isPipCollapsed ? (
        <button
          type="button"
          className="pip-expand-button"
          aria-label="展开数字人画中画"
          title="展开数字人"
          onClick={() => {
            if (suppressPipExpandClickRef.current) {
              suppressPipExpandClickRef.current = false;
              return;
            }
            setIsPipCollapsed(false);
          }}
        >
          <Maximize2 size={18} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function getPipBounds(width: number, height: number) {
  const rootStyles = getComputedStyle(document.documentElement);
  const edgeGap = Number.parseFloat(rootStyles.getPropertyValue("--guide-pip-edge-gap")) || 16;
  const safeBottom = Number.parseFloat(rootStyles.getPropertyValue("--guide-pip-safe-bottom")) || 18;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const minLeft = viewportLeft + edgeGap;
  const minTop = viewportTop + edgeGap;
  const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - width - edgeGap);
  const maxTop = Math.max(minTop, viewportTop + viewportHeight - height - safeBottom);
  return {
    minLeft,
    minTop,
    maxLeft,
    maxTop,
    horizontalRange: Math.max(0, maxLeft - minLeft),
    verticalRange: Math.max(0, maxTop - minTop),
  };
}

function clampPipPosition(left: number, top: number, width: number, height: number): PipPosition {
  const bounds = getPipBounds(width, height);
  return {
    left: Math.min(Math.max(left, bounds.minLeft), bounds.maxLeft),
    top: Math.min(Math.max(top, bounds.minTop), bounds.maxTop),
  };
}

function getPipAnchorFromPosition(position: PipPosition, width: number, height: number): PipAnchor {
  const bounds = getPipBounds(width, height);
  return {
    x: bounds.horizontalRange > 0
      ? Math.min(1, Math.max(0, (position.left - bounds.minLeft) / bounds.horizontalRange))
      : 1,
    y: bounds.verticalRange > 0
      ? Math.min(1, Math.max(0, (position.top - bounds.minTop) / bounds.verticalRange))
      : 1,
  };
}

function getPipPositionFromAnchor(anchor: PipAnchor, width: number, height: number): PipPosition {
  const bounds = getPipBounds(width, height);
  return {
    left: bounds.minLeft + bounds.horizontalRange * anchor.x,
    top: bounds.minTop + bounds.verticalRange * anchor.y,
  };
}

function isPipAtDefaultCorner(position: PipPosition, width: number, height: number) {
  const rootStyles = getComputedStyle(document.documentElement);
  const snapDistance = Number.parseFloat(rootStyles.getPropertyValue("--guide-pip-snap-distance")) || 30;
  const bounds = getPipBounds(width, height);
  return (
    bounds.maxLeft - position.left <= snapDistance &&
    bounds.maxTop - position.top <= snapDistance
  );
}

function waitForIceGathering(
  peerConnection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      peerConnection.removeEventListener("icegatheringstatechange", checkState);
      resolve();
    };
    const checkState = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    peerConnection.addEventListener("icegatheringstatechange", checkState);
  });
}
