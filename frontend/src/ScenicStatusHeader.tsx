import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CloudSun,
  Droplets,
  MapPin,
  RefreshCw,
  Users,
  Wind,
} from "lucide-react";

import type { ActiveView, ScenicStatusResponse } from "./types";


const STATUS_REFRESH_MS = 5_000;

const scenicTags = ["国家 AAAAA 级景区", "佛教文化胜境", "太湖山水"];

type ScenicStatusHeaderProps = {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
};

function SoftCloudPattern() {
  return (
    <div className="soft-cloud-pattern" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function formatUpdateTime(value: string) {
  if (!value) {
    return "等待更新";
  }
  if (!value.includes("T") && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
    return value.slice(11, 16);
  }
  const normalized = value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16) || value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScenicStatusResponse(value: unknown): value is ScenicStatusResponse {
  if (!isRecord(value) || !isRecord(value.opening) || !isRecord(value.weather) || !isRecord(value.crowd)) {
    return false;
  }
  return (
    typeof value.scenic_name === "string" &&
    typeof value.opening.status === "string" &&
    typeof value.opening.hours === "string" &&
    typeof value.weather.status === "string" &&
    typeof value.weather.provider === "string" &&
    typeof value.crowd.current_inside === "number" &&
    typeof value.crowd.comfort_level === "string" &&
    typeof value.crowd.updated_at === "string"
  );
}

export function ScenicStatusHeader({
  activeView,
  onViewChange,
}: ScenicStatusHeaderProps) {
  const [status, setStatus] = useState<ScenicStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const activeRequestRef = useRef<AbortController | null>(null);

  const loadStatus = useCallback(async (showLoading = false) => {
    if (activeRequestRef.current) {
      if (!showLoading) {
        return;
      }
      activeRequestRef.current.abort();
    }
    const controller = new AbortController();
    activeRequestRef.current = controller;
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const response = await fetch("/api/scenic/status", {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("景区实时状态读取失败");
      }
      const payload: unknown = await response.json();
      if (!isScenicStatusResponse(payload)) {
        throw new Error("景区状态数据格式异常");
      }
      setStatus(payload);
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(caught instanceof Error ? caught.message : "景区实时状态读取失败");
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadStatus(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadStatus(false);
      }
    };
    const timer = window.setInterval(refreshWhenVisible, STATUS_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      const activeRequest = activeRequestRef.current;
      activeRequestRef.current = null;
      activeRequest?.abort();
    };
  }, [loadStatus]);

  const weatherMeta = useMemo(() => {
    if (!status) {
      return isLoading ? "滨湖区 · 正在获取天气" : "滨湖区 · 天气暂不可用";
    }
    if (status.weather.status === "cached") {
      return `${status.weather.city} · 最近一次天气`;
    }
    if (status.weather.status === "unavailable") {
      return `${status.weather.city} · 天气暂不可用`;
    }
    return `${status.weather.city} · ${status.weather.provider}`;
  }, [isLoading, status]);

  const hasInitialError = !status && Boolean(error);
  const isStale = Boolean(status && error);
  const temperature = status?.weather.temperature
    ? `${status.weather.temperature}°`
    : "--°";
  const weatherDescription = status?.weather.weather ?? (hasInitialError ? "暂不可用" : "读取中");
  const weatherUpdatedAt = formatUpdateTime(status?.weather.report_time ?? "");
  const crowdUpdatedAt = formatUpdateTime(status?.crowd.updated_at ?? "");
  const recommendedEntrance = status?.crowd.recommended_entrance
    ?? (status?.opening.status === "open" ? "计算中" : status ? "开放后更新" : "--");
  const statusMessage = hasInitialError
    ? error
    : isStale
      ? `更新失败，当前展示 ${formatUpdateTime(status?.updated_at ?? "")} 数据`
      : isLoading
        ? "正在更新景区状态"
        : "";

  return (
    <header
      className="hero-header scenic-live-header"
      aria-label={`${status?.scenic_name ?? "灵山胜境"}智慧导览`}
    >
      <SoftCloudPattern />
      <div className="brand-mark" aria-hidden="true">
        <span />
      </div>

      <div className="hero-copy">
        <p className="eyebrow">{status?.scenic_name ?? "灵山胜境"} · 智慧导览</p>
        <h1>灵山此刻，智慧随行</h1>
        <p>一眼掌握天气与客流，从容开启灵山之旅。</p>
        <div className="tag-row" aria-label="景区标签">
          {scenicTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>

      <section
        className="scenic-live-board"
        aria-label="景区实时天气与客流状态"
      >
        <header className="live-board-heading">
          <span className="live-board-title"><i aria-hidden="true" /> 景区实时状态</span>
          <span className="live-board-refresh">
            <RefreshCw size={12} className={isLoading ? "spin" : ""} aria-hidden="true" />
            每 5 秒更新
          </span>
        </header>

        <article className="live-metric weather-metric">
          <div className="metric-icon" aria-hidden="true">
            <CloudSun size={24} />
          </div>
          <div className="metric-copy">
            <div className="metric-label-row">
              <span title={status?.weather.status === "cached" ? status.weather.message : undefined}>
                {weatherMeta}
              </span>
              <time dateTime={status?.weather.report_time || undefined}>{weatherUpdatedAt} 更新</time>
            </div>
            <div className="metric-value-row">
              <strong>{temperature}</strong>
              <b>{weatherDescription}</b>
            </div>
            <div className="metric-detail-row">
              <span><Droplets size={13} /> 湿度 {status?.weather.humidity ?? "--"}%</span>
              <span><Wind size={13} /> {status?.weather.wind_direction ?? "--"}风 {status?.weather.wind_power ?? "--"}级</span>
            </div>
          </div>
        </article>

        <article className="live-metric crowd-metric">
          <div className="metric-icon" aria-hidden="true">
            <Users size={24} />
          </div>
          <div className="metric-copy">
            <div className="metric-label-row">
              <span>当前在园人数</span>
              <time dateTime={status?.crowd.updated_at || undefined}>{crowdUpdatedAt} 更新</time>
            </div>
            <div className="metric-value-row">
              <strong>{formatCount(status?.crowd.current_inside)}</strong>
              <b>{status?.crowd.comfort_level ?? (hasInitialError ? "暂不可用" : "计算中")}</b>
            </div>
            <div className="metric-detail-row">
              <span><MapPin size={13} /> 推荐入口 {recommendedEntrance}</span>
            </div>
          </div>
        </article>

        <footer className="live-board-footer">
          <span className={`opening-state ${status?.opening.status ?? "loading"}`}>
            {status?.opening.label ?? "开放时间读取中"} · {status?.opening.hours ?? "--"}
          </span>
          <span>开放时间以景区当日公告为准</span>
          {statusMessage ? (
            <span className={`live-status-message ${isStale ? "stale" : "error"}`} role="status" aria-live="polite">
              {statusMessage}
            </span>
          ) : null}
          {error ? (
            <button type="button" onClick={() => void loadStatus(true)} disabled={isLoading}>
              <RefreshCw size={13} className={isLoading ? "spin" : ""} aria-hidden="true" />
              重试
            </button>
          ) : null}
        </footer>
      </section>

      <nav className="admin-entry" aria-label="页面入口">
        <button
          type="button"
          className={activeView === "chat" ? "active" : ""}
          onClick={() => onViewChange("chat")}
          aria-pressed={activeView === "chat"}
        >
          游客导览
        </button>
        <button
          type="button"
          className={activeView === "admin" ? "active admin-link" : "admin-link"}
          onClick={() => onViewChange("admin")}
          aria-pressed={activeView === "admin"}
        >
          管理后台
        </button>
      </nav>
    </header>
  );
}
