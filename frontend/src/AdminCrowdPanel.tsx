import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Gauge, RefreshCw, Users } from "lucide-react";

type ScenarioId = "steady" | "entry_peak" | "exit_peak";
type CrowdSnapshot = {
  current_inside: number;
  today_entries: number;
  today_exits: number;
  comfort_level: string;
  updated_at: string;
  simulation: { scenario: ScenarioId; status: "playing" | "paused"; effective_at: string };
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
type CrowdHistory = { points: Array<{ label: string; current_inside: number; today_entries: number; today_exits: number }> };

const scenarios: Array<{ id: ScenarioId; label: string; helper: string }> = [
  { id: "steady", label: "平稳客流", helper: "维持常规人员与入口配置" },
  { id: "entry_peak", label: "入园高峰", helper: "增强检票、分流与咨询" },
  { id: "exit_peak", label: "离园高峰", helper: "加强出口、接驳与停车引导" },
];

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
}

function formatTime(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
      if (!snapshotResponse.ok || !historyResponse.ok) throw new Error("客流数据读取失败");
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
    return () => { window.clearInterval(timer); requestRef.current?.abort(); };
  }, [loadCrowd]);

  async function applyScenario(scenario: ScenarioId) {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/admin/crowd/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play", scenario }),
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
    return points.map((point, index) => {
      const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 0;
      const y = 37 - (point.current_inside / maximum) * 31;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [history]);

  const entranceStats = useMemo(() => {
    const entrances = snapshot?.entrances ?? [];
    return entrances.map((entrance) => ({
      ...entrance,
      recentFlow: entrance.entries_last_5m + entrance.exits_last_5m,
    })).sort((left, right) => right.recentFlow - left.recentFlow);
  }, [snapshot]);
  const busiestEntrance = entranceStats[0] ?? null;
  const diversionEntrance = entranceStats.length > 0 ? entranceStats[entranceStats.length - 1] : null;
  const peakPoint = useMemo(
    () => (history?.points ?? []).reduce<(CrowdHistory["points"][number] | null)>((peak, point) => !peak || point.current_inside > peak.current_inside ? point : peak, null),
    [history],
  );

  const decisions = useMemo(() => {
    const scenario = snapshot?.simulation.scenario ?? "steady";
    if (scenario === "entry_peak") return [
      { level: "urgent", title: "增开入园通道", evidence: `${busiestEntrance?.name ?? "主入口"}近 5 分钟流量最高`, action: "优先补充检票与咨询人员，现场核对排队长度后增开通道。" },
      { level: "watch", title: "引导入口分流", evidence: `${diversionEntrance?.name ?? "备用入口"}当前相对宽松`, action: "在停车场、游客中心和地图入口同步提示可选入口。" },
      { level: "normal", title: "前置服务保障", evidence: "入园后咨询、卫生间和饮水需求通常同步上升", action: "巡查入口附近卫生间、饮水点与游客服务台。" },
    ];
    if (scenario === "exit_peak") return [
      { level: "urgent", title: "增强离园通行", evidence: `${busiestEntrance?.name ?? "主出口"}近 5 分钟进出合计最高`, action: "将可切换通道优先用于离园，并安排人员维持出口秩序。" },
      { level: "watch", title: "联动接驳与停车", evidence: "集中离园将压力传导至观光车站和停车区域", action: "提前核对观光车、网约车上客区与停车缴费点状态。" },
      { level: "normal", title: "发布错峰提示", evidence: `当前在园 ${formatCount(snapshot?.current_inside)} 人`, action: "通过数字人和出口屏提示相对宽松的离园方向。" },
    ];
    return [
      { level: "normal", title: "维持当前通道配置", evidence: `当前舒适度为${snapshot?.comfort_level ?? "正常"}`, action: "保持常规人员配置，每 15 分钟复核入口流量差异。" },
      { level: "watch", title: "平衡入口负载", evidence: `${busiestEntrance?.name ?? "主入口"}为当前最繁忙入口`, action: `若连续三个周期领先，可向${diversionEntrance?.name ?? "其他入口"}引导部分游客。` },
      { level: "normal", title: "补给与巡查", evidence: `预计峰值出现在 ${peakPoint?.label ?? "午间"}`, action: "在峰值前完成饮水点、卫生间、休息区和游客中心巡查。" },
    ];
  }, [busiestEntrance, diversionEntrance, peakPoint, snapshot]);

  return (
    <section className="admin-crowd-panel" aria-label="客流统计与调度">
      <header className="operations-panel-head">
        <div>
          <p className="eyebrow">CROWD COMMAND</p>
          <h2>客流调度台</h2>
          <p>把客流数字转成入口分流、人员安排和服务保障动作。</p>
        </div>
        <div className="crowd-head-actions">
          <span className="crowd-updated">{formatTime(snapshot?.updated_at)} 更新</span>
          <button type="button" className="content-refresh-button" onClick={() => void loadCrowd()} disabled={isUpdating}><RefreshCw size={15} />刷新</button>
        </div>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="crowd-command-summary">
        <article className="crowd-command-primary"><span>当前在园</span><strong>{formatCount(snapshot?.current_inside)}</strong><small>{snapshot?.comfort_level ?? "读取中"}</small></article>
        <article><span>今日入园</span><strong>{formatCount(snapshot?.today_entries)}</strong><small>入口累计</small></article>
        <article><span>今日离园</span><strong>{formatCount(snapshot?.today_exits)}</strong><small>出口累计</small></article>
        <article><span>最繁忙入口</span><strong className="crowd-text-value">{busiestEntrance?.name ?? "--"}</strong><small>近 5 分钟 {busiestEntrance?.recentFlow ?? "--"} 人次</small></article>
        <article><span>建议分流入口</span><strong className="crowd-text-value">{diversionEntrance?.name ?? "--"}</strong><small>当前相对宽松</small></article>
      </div>

      <div className="crowd-command-grid">
        <section className="crowd-trend-card crowd-command-trend">
          <div className="panel-title-row"><div><strong>小时客流趋势</strong><span>用于判断峰值时间和调度提前量</span></div><Gauge size={19} /></div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="今日在园人数趋势">
            <defs><linearGradient id="crowd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f806b" stopOpacity="0.36" /><stop offset="1" stopColor="#2f806b" stopOpacity="0.03" /></linearGradient></defs>
            <polygon points={`0,40 ${chartPoints} 100,40`} fill="url(#crowd-area)" />
            <polyline points={chartPoints} fill="none" stroke="#23715d" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="crowd-chart-labels">{history?.points.map((point) => <span key={point.label}>{point.label}</span>)}</div>
        </section>

        <section className="crowd-scenario-card">
          <div className="panel-title-row"><div><strong>运营情景</strong><span>切换后立即重新计算调度动作</span></div><ArrowRightLeft size={19} /></div>
          <div className="crowd-scenario-list">
            {scenarios.map((scenario) => (
              <button key={scenario.id} type="button" className={snapshot?.simulation.scenario === scenario.id ? "active" : ""} onClick={() => void applyScenario(scenario.id)} disabled={isUpdating}>
                <span>{scenario.label}</span><small>{scenario.helper}</small>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="crowd-decision-panel" aria-label="当前调度建议">
        <div className="panel-title-row"><div><strong>当前调度动作</strong><span>按优先级执行，并由现场人员确认</span></div><Users size={19} /></div>
        <div className="crowd-decision-grid">
          {decisions.map((decision, index) => (
            <article key={decision.title} className={`is-${decision.level}`}>
              <span className="crowd-decision-number">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{decision.title}</strong><small>{decision.evidence}</small><p>{decision.action}</p></div>
              {decision.level === "urgent" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            </article>
          ))}
        </div>
      </section>

      <section className="entrance-flow-table" aria-label="入口流量明细">
        <header><strong>入口负载对比</strong><span>近 5 分钟进出人次</span></header>
        {entranceStats.map((entrance) => {
          const maximum = Math.max(1, ...entranceStats.map((item) => item.recentFlow));
          return (
            <article key={entrance.id}>
              <div><strong>{entrance.name}</strong><span>{entrance.flow_level}</span></div>
              <div className="entrance-flow-track"><i style={{ width: `${Math.max(8, entrance.recentFlow / maximum * 100)}%` }} /></div>
              <span>入 {entrance.entries_last_5m}</span><span>出 {entrance.exits_last_5m}</span><b>{entrance.recentFlow}</b>
            </article>
          );
        })}
      </section>
    </section>
  );
}
