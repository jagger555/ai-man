import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RefreshCw, RotateCcw, Users } from "lucide-react";

type CrowdSnapshot = {
  current_inside: number;
  today_entries: number;
  today_exits: number;
  comfort_level: string;
  updated_at: string;
  simulation: {
    scenario: "steady" | "entry_peak" | "exit_peak";
    status: "playing" | "paused";
    effective_at: string;
  };
  entrances: Array<{
    id: string;
    name: string;
    today_entries: number;
    today_exits: number;
    entries_last_5m: number;
    exits_last_5m: number;
    flow_level: string;
  }>;
};

type CrowdHistory = {
  points: Array<{
    label: string;
    current_inside: number;
    today_entries: number;
    today_exits: number;
  }>;
};

const scenarios = [
  { id: "steady", label: "平稳客流", helper: "常规游园节奏" },
  { id: "entry_peak", label: "入园高峰", helper: "入口流量集中" },
  { id: "exit_peak", label: "离园高峰", helper: "离场流量集中" },
] as const;

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
}

export function AdminCrowdPanel() {
  const [snapshot, setSnapshot] = useState<CrowdSnapshot | null>(null);
  const [history, setHistory] = useState<CrowdHistory | null>(null);
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const loadCrowd = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const [snapshotResponse, historyResponse] = await Promise.all([
        fetch("/api/admin/crowd/simulation", { signal: controller.signal }),
        fetch("/api/crowd/history", { signal: controller.signal }),
      ]);
      if (!snapshotResponse.ok || !historyResponse.ok) {
        throw new Error("客流数据读取失败");
      }
      setSnapshot((await snapshotResponse.json()) as CrowdSnapshot);
      setHistory((await historyResponse.json()) as CrowdHistory);
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "客流数据读取失败");
    }
  }, []);

  useEffect(() => {
    void loadCrowd();
    const timer = window.setInterval(() => void loadCrowd(), 5_000);
    return () => {
      window.clearInterval(timer);
      requestRef.current?.abort();
    };
  }, [loadCrowd]);

  async function controlCrowd(
    action: "play" | "pause" | "reset",
    scenario?: "steady" | "entry_peak" | "exit_peak",
  ) {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/admin/crowd/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scenario }),
      });
      if (!response.ok) throw new Error("客流方案切换失败");
      setSnapshot((await response.json()) as CrowdSnapshot);
      await loadCrowd();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "客流方案切换失败");
    } finally {
      setIsUpdating(false);
    }
  }

  const chartPoints = useMemo(() => {
    const points = history?.points ?? [];
    const maximum = Math.max(1, ...points.map((point) => point.current_inside));
    return points
      .map((point, index) => {
        const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 0;
        const y = 37 - (point.current_inside / maximum) * 31;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [history]);
  const peakPoint = useMemo(
    () => (history?.points ?? []).reduce<(CrowdHistory["points"][number] | null)>(
      (peak, point) => (!peak || point.current_inside > peak.current_inside ? point : peak),
      null,
    ),
    [history],
  );
  const busiestEntrance = useMemo(
    () => (snapshot?.entrances ?? []).reduce<(CrowdSnapshot["entrances"][number] | null)>(
      (busiest, entrance) =>
        !busiest || entrance.entries_last_5m + entrance.exits_last_5m > busiest.entries_last_5m + busiest.exits_last_5m
          ? entrance
          : busiest,
      null,
    ),
    [snapshot],
  );

  return (
    <section className="admin-crowd-panel" aria-label="客流统计与方案控制">
      <header className="operations-panel-head">
        <div>
          <p className="eyebrow">CROWD OPERATIONS</p>
          <h2>客流统计</h2>
          <p>查看三处入口的同一客流快照，并切换现场展示所需的客流方案。</p>
        </div>
        <span className={`crowd-playback-pill ${snapshot?.simulation.status ?? "loading"}`}>
          <i aria-hidden="true" />
          {snapshot?.simulation.status === "paused" ? "已暂停" : "播放中"}
        </span>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="crowd-kpi-grid">
        <article><span>当前在园</span><strong>{formatCount(snapshot?.current_inside)}</strong><small>{snapshot?.comfort_level ?? "读取中"}</small></article>
        <article><span>今日累计入园</span><strong>{formatCount(snapshot?.today_entries)}</strong><small>三个入口汇总</small></article>
        <article><span>今日累计离园</span><strong>{formatCount(snapshot?.today_exits)}</strong><small>三个入口汇总</small></article>
        <article><span>当前净流入</span><strong>{formatCount(snapshot ? snapshot.today_entries - snapshot.today_exits : undefined)}</strong><small>入园减离园</small></article>
        <article><span>预计峰值时段</span><strong>{peakPoint?.label ?? "--"}</strong><small>方案曲线最高点</small></article>
        <article><span>近 5 分钟最繁忙入口</span><strong className="crowd-text-value">{busiestEntrance?.name ?? "--"}</strong><small>按进出合计</small></article>
      </div>

      <div className="crowd-operations-grid">
        <section className="crowd-trend-card">
          <div className="panel-title-row"><div><strong>小时客流趋势</strong><span>方案数据 · 每 5 秒同步</span></div><Users size={19} /></div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="今日在园人数趋势">
            <defs><linearGradient id="crowd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f806b" stopOpacity="0.36" /><stop offset="1" stopColor="#2f806b" stopOpacity="0.03" /></linearGradient></defs>
            <polygon points={`0,40 ${chartPoints} 100,40`} fill="url(#crowd-area)" />
            <polyline points={chartPoints} fill="none" stroke="#23715d" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="crowd-chart-labels">{history?.points.map((point) => <span key={point.label}>{point.label}</span>)}</div>
        </section>

        <section className="crowd-control-card">
          <div className="panel-title-row"><div><strong>客流方案</strong><span>用于首页与后台同步展示</span></div></div>
          <div className="crowd-scenario-list">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={snapshot?.simulation.scenario === scenario.id ? "active" : ""}
                onClick={() => void controlCrowd("play", scenario.id)}
                disabled={isUpdating}
              >
                <span>{scenario.label}</span><small>{scenario.helper}</small>
              </button>
            ))}
          </div>
          <div className="crowd-control-actions">
            <button type="button" onClick={() => void controlCrowd("play")} disabled={isUpdating}><Play size={15} />播放</button>
            <button type="button" onClick={() => void controlCrowd("pause")} disabled={isUpdating}><Pause size={15} />暂停</button>
            <button type="button" onClick={() => void controlCrowd("reset")} disabled={isUpdating}><RotateCcw size={15} />重置</button>
            <button type="button" onClick={() => void loadCrowd()} disabled={isUpdating}><RefreshCw size={15} />刷新</button>
          </div>
        </section>
      </div>

      <section className="entrance-flow-grid" aria-label="三处入口客流">
        {snapshot?.entrances.map((entrance) => (
          <article key={entrance.id}>
            <header><strong>{entrance.name}</strong><span>{entrance.flow_level}</span></header>
            <div><span>今日入园 <b>{formatCount(entrance.today_entries)}</b></span><span>今日离园 <b>{formatCount(entrance.today_exits)}</b></span></div>
            <footer>近 5 分钟：入 {entrance.entries_last_5m} · 出 {entrance.exits_last_5m}</footer>
          </article>
        ))}
      </section>
    </section>
  );
}
