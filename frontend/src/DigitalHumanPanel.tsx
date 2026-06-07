import { useEffect, useRef, useState } from "react";
import type { DigitalHumanConfig } from "./types";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type DigitalHumanPanelProps = {
  latestAnswer: string;
  isAnswerLoading: boolean;
};

export function DigitalHumanPanel({
  latestAnswer,
  isAnswerLoading,
}: DigitalHumanPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [config, setConfig] = useState<DigitalHumanConfig | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusMessage, setStatusMessage] = useState("等待连接 LiveTalking 服务");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const canSpeak =
    connectionState === "connected" && sessionId.length > 0 && latestAnswer.trim().length > 0;

  useEffect(() => {
    void loadConfig();
    return () => {
      closeConnection();
    };
  }, []);

  async function loadConfig() {
    try {
      const response = await fetch("/api/digital-human/config");
      if (!response.ok) {
        throw new Error(`数字人配置接口返回 ${response.status}`);
      }
      const payload = (await response.json()) as DigitalHumanConfig;
      setConfig(payload);
      setStatusMessage(
        payload.enabled
          ? `LiveTalking 地址：${payload.base_url}`
          : "数字人服务未启用",
      );
    } catch (caught) {
      setConnectionState("error");
      setStatusMessage(caught instanceof Error ? caught.message : "读取数字人配置失败");
    }
  }

  async function connectDigitalHuman() {
    if (!config?.enabled || !config.base_url) {
      setConnectionState("error");
      setStatusMessage("缺少 DIGITAL_HUMAN_BASE_URL 配置");
      return;
    }

    closeConnection();
    setConnectionState("connecting");
    setStatusMessage("正在建立 WebRTC 连接...");

    try {
      const peerConnection = new RTCPeerConnection({
        sdpSemantics: "unified-plan",
      } as RTCConfiguration);
      peerConnectionRef.current = peerConnection;

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
        }
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(peerConnection);

      const localDescription = peerConnection.localDescription;
      if (!localDescription) {
        throw new Error("浏览器未生成 WebRTC Offer");
      }

      const response = await fetch(`${config.base_url}/offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: localDescription.sdp,
          type: localDescription.type,
          avatar: config.avatar || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`LiveTalking /offer 返回 ${response.status}`);
      }

      const answer = (await response.json()) as RTCSessionDescriptionInit & {
        sessionid?: string;
      };
      await peerConnection.setRemoteDescription(answer);
      setSessionId(answer.sessionid ?? "");
      setConnectionState("connected");
      setStatusMessage(
        answer.sessionid
          ? `数字人已连接，会话 ${answer.sessionid}`
          : "数字人已连接，但未返回 sessionid",
      );
    } catch (caught) {
      closeConnection();
      setConnectionState("error");
      setStatusMessage(caught instanceof Error ? caught.message : "连接数字人失败");
    }
  }

  async function speakLatestAnswer() {
    if (!config || !sessionId || !latestAnswer.trim()) {
      return;
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
          text: latestAnswer.trim(),
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
    } catch (caught) {
      setConnectionState("error");
      setStatusMessage(caught instanceof Error ? caught.message : "数字人播报失败");
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }

  return (
    <section className="digital-human-live-card" aria-label="LiveTalking 数字人">
      <div className="live-stage">
        <video ref={videoRef} autoPlay playsInline muted className="live-video" />
        <audio ref={audioRef} autoPlay />
        {connectionState !== "connected" ? (
          <div className="live-placeholder">
            <div className={isAnswerLoading ? "avatar speaking" : "avatar"}>
              <div className="avatar-face">
                <span />
                <span />
              </div>
            </div>
            <strong>灵山数字人导游</strong>
            <span>连接 LiveTalking 后展示实时口型与语音</span>
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
          {connectionState === "connected" ? "重新连接数字人" : "连接数字人"}
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
      </div>

      <p className={`digital-human-status ${connectionState}`}>{statusMessage}</p>
      {config ? (
        <p className="digital-human-config">
          服务 {config.base_url}
          {config.avatar ? ` / 形象 ${config.avatar}` : ""}
          {config.voice ? ` / 声音 ${config.voice}` : ""}
        </p>
      ) : null}
    </section>
  );
}

function waitForIceGathering(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const checkState = () => {
      if (peerConnection.iceGatheringState === "complete") {
        peerConnection.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };
    peerConnection.addEventListener("icegatheringstatechange", checkState);
  });
}
