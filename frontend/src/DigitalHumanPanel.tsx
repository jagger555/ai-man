import { useEffect, useRef, useState } from "react";
import type { DigitalHumanConfig } from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type DigitalHumanPanelProps = {
  latestAnswer: string;
  latestAnswerKey: string;
  isAnswerLoading: boolean;
  refreshKey?: number;
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

export function DigitalHumanPanel({
  latestAnswer,
  latestAnswerKey,
  isAnswerLoading,
  refreshKey = 0,
}: DigitalHumanPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const connectionAttemptRef = useRef(0);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(false);
  const pendingAnswerRef = useRef<{ key: string; text: string } | null>(null);
  const autoAttemptedAnswerKeyRef = useRef("");
  const spokenAnswerKeyRef = useRef("");
  const [config, setConfig] = useState<DigitalHumanConfig | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusMessage, setStatusMessage] = useState("等待连接 LiveTalking 服务");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const canSpeak =
    connectionState === "connected" && sessionId.length > 0 && latestAnswer.trim().length > 0;

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
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setSessionId("");
    cleanupMediaElements();
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

  return (
    <section className="digital-human-live-card" aria-label="LiveTalking 数字人">
      <div className="stage-head">
        <div>
          <p className="eyebrow">Digital Human</p>
          <strong>灵山数字人导游</strong>
        </div>
        <span className={`stage-state ${connectionState}`}>
          <span />
          {connectionStateLabels[connectionState]}
        </span>
      </div>
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

      <div className="digital-human-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void connectDigitalHuman()}
          disabled={connectionState === "connecting"}
        >
          {connectionState === "connected" ? "重新连接数字人" : "重新连接"}
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => void speakLatestAnswer()}
          disabled={!canSpeak || isSpeaking}
        >
          {isSpeaking ? "发送中..." : "播报当前回答"}
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => void interruptSpeaking()}
          disabled={!sessionId}
        >
          打断播报
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

      <p className={`digital-human-status ${connectionState}`}>{statusMessage}</p>
      {config ? (
        <p className="digital-human-config">
          服务 {config.base_url}
          {config.avatar ? ` / 形象 ${config.avatar}` : ""}
          {config.voice ? ` / 声音 ${config.voice}` : ""}
          {config.ref_audio ? ` / 参考音频 ${config.ref_audio}` : ""}
          {sessionId ? ` / SID ${sessionId}` : ""}
        </p>
      ) : null}
    </section>
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
