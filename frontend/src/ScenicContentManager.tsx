import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Eye, EyeOff, RefreshCw, Save, Star } from "lucide-react";

type ContentKind = "poi" | "route" | "performance";

type Schedule = { label: string; times: string[] };

type ScenicContentItem = {
  id: string;
  title: string;
  enabled: boolean;
  featured: boolean;
  order: number;
  category?: string;
  summary?: string;
  helper?: string;
  duration?: string;
  duration_minutes?: number;
  audience?: string;
  pace?: string;
  stops?: string[];
  notes?: string[];
  audience_tags?: string[];
  interest_tags?: string[];
  subtitle?: string;
  location?: string;
  map_destination?: string;
  description?: string;
  arrival_notice?: string;
  valid_from?: string;
  valid_until?: string;
  schedules?: Schedule[];
  image_key?: string;
};

type ScenicContentResponse = {
  items: Record<ContentKind, ScenicContentItem[]>;
};

const contentTabs: Array<{ id: ContentKind; label: string; helper: string }> = [
  { id: "poi", label: "地图与设施", helper: "前台地图点位" },
  { id: "route", label: "游览路线", helper: "路线内容与顺序" },
  { id: "performance", label: "演出内容", helper: "场次与有效期" },
];

const editableFields: Record<ContentKind, Array<keyof ScenicContentItem>> = {
  poi: ["title", "category", "summary", "enabled", "featured", "order"],
  route: ["title", "helper", "duration", "duration_minutes", "audience", "pace", "summary", "stops", "notes", "audience_tags", "interest_tags", "enabled", "featured", "order"],
  performance: ["title", "subtitle", "location", "map_destination", "description", "arrival_notice", "valid_from", "valid_until", "schedules", "enabled", "featured", "order"],
};

function splitList(value: string) {
  return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function formatSchedules(schedules: Schedule[] | undefined) {
  return (schedules ?? []).map((item) => `${item.label}：${item.times.join("、")}`).join("\n");
}

function parseSchedules(value: string): Schedule[] {
  return value.split("\n").map((line) => {
    const [label, times = ""] = line.split(/[：:]/, 2);
    return { label: label.trim(), times: splitList(times) };
  }).filter((item) => item.label);
}

function dateValue(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}

export function ScenicContentManager() {
  const [content, setContent] = useState<ScenicContentResponse | null>(null);
  const [activeKind, setActiveKind] = useState<ContentKind>("poi");
  const [pendingId, setPendingId] = useState("");
  const [savedId, setSavedId] = useState("");
  const [error, setError] = useState("");

  const loadContent = useCallback(async () => {
    try {
      const response = await fetch("/api/scenic/content");
      if (!response.ok) throw new Error("景区内容读取失败");
      setContent((await response.json()) as ScenicContentResponse);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "景区内容读取失败");
    }
  }, []);

  useEffect(() => { void loadContent(); }, [loadContent]);

  function updateItem(itemId: string, changes: Partial<ScenicContentItem>) {
    setSavedId("");
    setContent((current) => current ? {
      items: {
        ...current.items,
        [activeKind]: current.items[activeKind].map((item) => item.id === itemId ? { ...item, ...changes } : item),
      },
    } : current);
  }

  async function saveItem(item: ScenicContentItem) {
    setPendingId(item.id);
    setSavedId("");
    setError("");
    try {
      const payload = Object.fromEntries(
        editableFields[activeKind].map((field) => [field, item[field]]),
      );
      const response = await fetch(`/api/admin/scenic/content/${activeKind}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(detail?.detail || "保存失败，请检查输入后重试");
      }
      setSavedId(item.id);
      await loadContent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPendingId("");
    }
  }

  const items = content?.items[activeKind] ?? [];
  const previewHash = activeKind === "route" ? "#route" : activeKind === "performance" ? "#performance" : "#map";

  return (
    <section className="scenic-content-manager" aria-label="景区内容管理">
      <header className="operations-panel-head">
        <div>
          <p className="eyebrow">SCENIC CONTENT</p>
          <h2>景区内容</h2>
          <p>统一维护游客端地图点位、推荐路线和演出信息，保存后立即发布。</p>
        </div>
        <button type="button" className="content-refresh-button" onClick={() => void loadContent()}><RefreshCw size={15} />刷新</button>
      </header>

      <nav className="content-kind-tabs" aria-label="景区内容分类">
        {contentTabs.map((tab) => (
          <button key={tab.id} type="button" className={activeKind === tab.id ? "active" : ""} onClick={() => setActiveKind(tab.id)}>
            <strong>{tab.label}</strong><small>{tab.helper}</small>
          </button>
        ))}
      </nav>

      {error ? <p className="error-message">{error}</p> : null}

      <div className={`content-management-list is-${activeKind}`}>
        {items.map((item) => (
          <article key={item.id} className="content-management-card">
            <div className="content-item-heading">
              <span className="content-item-icon">{item.title.slice(0, 1)}</span>
              <div><strong>{item.title}</strong><small>{item.id}</small></div>
            </div>

            <div className="content-form-grid">
              <label><span>名称</span><input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} /></label>
              <label><span>排序</span><input type="number" min="0" max="999" value={item.order} onChange={(event) => updateItem(item.id, { order: Number(event.target.value) })} /></label>

              {activeKind === "poi" ? <>
                <label><span>分类</span><input value={item.category ?? ""} onChange={(event) => updateItem(item.id, { category: event.target.value })} /></label>
                <label className="span-2"><span>简介</span><textarea value={item.summary ?? ""} onChange={(event) => updateItem(item.id, { summary: event.target.value })} /></label>
              </> : null}

              {activeKind === "route" ? <>
                <label><span>展示时长</span><input value={item.duration ?? ""} onChange={(event) => updateItem(item.id, { duration: event.target.value })} /></label>
                <label><span>分钟数</span><input type="number" min="30" max="720" value={item.duration_minutes ?? 240} onChange={(event) => updateItem(item.id, { duration_minutes: Number(event.target.value) })} /></label>
                <label><span>推荐人群</span><input value={item.audience ?? ""} onChange={(event) => updateItem(item.id, { audience: event.target.value })} /></label>
                <label><span>游览节奏</span><input value={item.pace ?? ""} onChange={(event) => updateItem(item.id, { pace: event.target.value })} /></label>
                <label className="span-2"><span>路线标签</span><input value={item.helper ?? ""} onChange={(event) => updateItem(item.id, { helper: event.target.value })} /></label>
                <label className="span-2"><span>路线简介</span><textarea value={item.summary ?? ""} onChange={(event) => updateItem(item.id, { summary: event.target.value })} /></label>
                <label className="span-2"><span>景点顺序（顿号分隔）</span><textarea value={(item.stops ?? []).join("、")} onChange={(event) => updateItem(item.id, { stops: splitList(event.target.value) })} /></label>
                <label className="span-2"><span>路线提示（顿号分隔）</span><input value={(item.notes ?? []).join("、")} onChange={(event) => updateItem(item.id, { notes: splitList(event.target.value) })} /></label>
                <label><span>适合同行类型</span><input value={(item.audience_tags ?? []).join("、")} onChange={(event) => updateItem(item.id, { audience_tags: splitList(event.target.value) })} /></label>
                <label><span>兴趣标签</span><input value={(item.interest_tags ?? []).join("、")} onChange={(event) => updateItem(item.id, { interest_tags: splitList(event.target.value) })} /></label>
              </> : null}

              {activeKind === "performance" ? <>
                <label><span>副标题</span><input value={item.subtitle ?? ""} onChange={(event) => updateItem(item.id, { subtitle: event.target.value })} /></label>
                <label><span>地点</span><input value={item.location ?? ""} onChange={(event) => updateItem(item.id, { location: event.target.value })} /></label>
                <label><span>地图目的地</span><input value={item.map_destination ?? ""} onChange={(event) => updateItem(item.id, { map_destination: event.target.value })} /></label>
                <label><span>到场提醒</span><input value={item.arrival_notice ?? ""} onChange={(event) => updateItem(item.id, { arrival_notice: event.target.value })} /></label>
                <label className="span-2"><span>介绍</span><textarea value={item.description ?? ""} onChange={(event) => updateItem(item.id, { description: event.target.value })} /></label>
                <label><span>有效开始</span><input type="date" value={dateValue(item.valid_from)} onChange={(event) => updateItem(item.id, { valid_from: `${event.target.value}T00:00:00+08:00` })} /></label>
                <label><span>有效结束</span><input type="date" value={dateValue(item.valid_until)} onChange={(event) => updateItem(item.id, { valid_until: `${event.target.value}T23:59:59+08:00` })} /></label>
                <label className="span-2"><span>场次（每行“日期类型：时间、时间”）</span><textarea value={formatSchedules(item.schedules)} onChange={(event) => updateItem(item.id, { schedules: parseSchedules(event.target.value) })} /></label>
              </> : null}
            </div>

            <div className="content-item-actions">
              <button type="button" className={item.enabled ? "active" : ""} onClick={() => updateItem(item.id, { enabled: !item.enabled })}>
                {item.enabled ? <Eye size={15} /> : <EyeOff size={15} />}{item.enabled ? "前台显示" : "前台隐藏"}
              </button>
              <button type="button" className={item.featured ? "active" : ""} onClick={() => updateItem(item.id, { featured: !item.featured })}>
                <Star size={15} />{item.featured ? "重点推荐" : "普通内容"}
              </button>
              <button type="button" onClick={() => void saveItem(item)} disabled={pendingId === item.id}><Save size={15} />{pendingId === item.id ? "发布中" : savedId === item.id ? "已发布" : "保存并发布"}</button>
              <button type="button" onClick={() => window.open(`/${previewHash}`, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />前台预览</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
