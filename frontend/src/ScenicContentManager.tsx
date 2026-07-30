import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  Eye,
  EyeOff,
  ListFilter,
  MapPinned,
  RefreshCw,
  Route,
  Save,
  Search,
  Star,
  Tags,
} from "lucide-react";

type ContentKind = "poi" | "route" | "performance" | "facility_category" | "facility";
type Schedule = { label: string; times: string[] };

type ScenicContentItem = {
  id: string;
  title: string;
  enabled: boolean;
  featured?: boolean;
  order: number;
  category?: string;
  category_id?: string;
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
  lat?: number;
  lng?: number;
};

type ScenicContentResponse = { items: Record<ContentKind, ScenicContentItem[]> };

const contentTabs: Array<{
  id: ContentKind;
  label: string;
  helper: string;
  icon: typeof MapPinned;
}> = [
  { id: "route", label: "游览路线", helper: "6 条主题路线", icon: Route },
  { id: "performance", label: "演出场次", helper: "图集与有效期", icon: CalendarClock },
  { id: "poi", label: "重点景点", helper: "前台推荐内容", icon: MapPinned },
  { id: "facility_category", label: "设施分类", helper: "地图筛选目录", icon: Tags },
  { id: "facility", label: "设施点位", helper: "214 个地图点", icon: ListFilter },
];

const editableFields: Record<ContentKind, Array<keyof ScenicContentItem>> = {
  poi: ["title", "category", "summary", "enabled", "featured", "order"],
  route: ["title", "helper", "duration", "duration_minutes", "audience", "pace", "summary", "stops", "notes", "audience_tags", "interest_tags", "enabled", "featured", "order"],
  performance: ["title", "subtitle", "location", "map_destination", "description", "arrival_notice", "valid_from", "valid_until", "schedules", "enabled", "featured", "order"],
  facility_category: ["title", "enabled", "order"],
  facility: ["title", "enabled", "order"],
};

function splitList(value: string) {
  return value.split(/[、，,\n]/).map((item) => item.trim()).filter(Boolean);
}

function formatSchedules(schedules: Schedule[] | undefined) {
  return (schedules ?? []).map((item) => `${item.label}：${item.times.join("、")}`).join("\n");
}

function parseSchedules(value: string): Schedule[] {
  return value.split("\n").map((line) => {
    const separator = line.indexOf("：") >= 0 ? "：" : ":";
    const [label, ...timeParts] = line.split(separator);
    return { label: label.trim(), times: splitList(timeParts.join(separator)) };
  }).filter((item) => item.label);
}

function dateValue(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}

function itemMeta(kind: ContentKind, item: ScenicContentItem, categories: Map<string, string>) {
  if (kind === "route") return `${item.stops?.length ?? 0} 个景点 · ${item.duration ?? "时长待定"}`;
  if (kind === "performance") return `${item.location ?? "地点待定"} · ${dateValue(item.valid_until) || "长期"}`;
  if (kind === "facility") return categories.get(item.category_id ?? "") ?? "其他设施";
  if (kind === "facility_category") return `排序 ${item.order}`;
  return item.category ?? "景点";
}

export function ScenicContentManager() {
  const [content, setContent] = useState<ScenicContentResponse | null>(null);
  const [activeKind, setActiveKind] = useState<ContentKind>("route");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
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

  const categoryNames = useMemo(
    () => new Map((content?.items.facility_category ?? []).map((item) => [item.id, item.title])),
    [content],
  );
  const allItems = content?.items[activeKind] ?? [];
  const facilityFilters = useMemo(() => {
    if (activeKind !== "facility") return [];
    return [...new Set(allItems.map((item) => item.category_id).filter(Boolean) as string[])]
      .map((id) => ({ id, label: categoryNames.get(id) ?? id }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }, [activeKind, allItems, categoryNames]);
  const items = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return allItems.filter((item) => {
      if (activeKind === "facility" && categoryFilter !== "all" && item.category_id !== categoryFilter) return false;
      if (!keyword) return true;
      const haystack = `${item.title} ${item.id} ${item.category ?? ""} ${categoryNames.get(item.category_id ?? "") ?? ""}`.toLocaleLowerCase("zh-CN");
      return haystack.includes(keyword);
    });
  }, [activeKind, allItems, categoryFilter, categoryNames, query]);

  useEffect(() => {
    setSelectedId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ""));
  }, [items]);

  function changeKind(kind: ContentKind) {
    setActiveKind(kind);
    setQuery("");
    setCategoryFilter("all");
    setSavedId("");
  }

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
      const payload = Object.fromEntries(editableFields[activeKind].map((field) => [field, item[field]]));
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

  const selected = allItems.find((item) => item.id === selectedId) ?? null;
  const previewHash = activeKind === "route" ? "#route" : activeKind === "performance" ? "#performance" : activeKind === "facility_category" || activeKind === "facility" ? "#services" : "#map";
  const supportsFeatured = activeKind === "poi" || activeKind === "route" || activeKind === "performance";

  return (
    <section className="scenic-content-manager" aria-label="景区内容管理">
      <header className="operations-panel-head">
        <div>
          <p className="eyebrow">SCENIC CONTENT DESK</p>
          <h2>景区内容工作台</h2>
          <p>从目录定位内容，在一个编辑区完成修改、发布和前台核对。</p>
        </div>
        <button type="button" className="content-refresh-button" onClick={() => void loadContent()}><RefreshCw size={15} />刷新内容</button>
      </header>

      <nav className="content-kind-tabs" aria-label="景区内容分类">
        {contentTabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeKind === tab.id ? "active" : ""} onClick={() => changeKind(tab.id)}>
              <TabIcon size={17} aria-hidden="true" />
              <span><strong>{tab.label}</strong><small>{tab.helper}</small></span>
            </button>
          );
        })}
      </nav>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="content-workbench">
        <aside className="content-directory" aria-label="内容目录">
          <div className="content-directory-head">
            <div><strong>{contentTabs.find((tab) => tab.id === activeKind)?.label}</strong><span>{items.length} / {allItems.length} 项</span></div>
            <label className="content-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或编号" /></label>
            {activeKind === "facility" ? (
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="设施类别筛选">
                <option value="all">全部设施类别</option>
                {facilityFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
              </select>
            ) : null}
          </div>
          <div className="content-directory-list">
            {items.map((item, index) => (
              <button key={item.id} type="button" className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
                <span className="content-directory-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="content-directory-copy"><strong>{item.title}</strong><small>{itemMeta(activeKind, item, categoryNames)}</small></span>
                <i className={item.enabled ? "is-live" : ""} aria-label={item.enabled ? "前台显示" : "前台隐藏"} />
              </button>
            ))}
            {items.length === 0 ? <p className="content-directory-empty">没有符合条件的内容</p> : null}
          </div>
        </aside>

        <section className="content-editor" aria-live="polite">
          {selected ? <>
            <header className="content-editor-head">
              <span className="content-item-icon">{selected.title.slice(0, 1)}</span>
              <div><p>{contentTabs.find((tab) => tab.id === activeKind)?.label}</p><h3>{selected.title}</h3><small>{selected.id}</small></div>
              <span className={selected.enabled ? "content-status is-live" : "content-status"}>{selected.enabled ? "前台显示" : "前台隐藏"}</span>
            </header>

            <div className="content-form-grid">
              <label><span>名称</span><input value={selected.title} onChange={(event) => updateItem(selected.id, { title: event.target.value })} /></label>
              <label><span>排序</span><input type="number" min="0" max="999" value={selected.order} onChange={(event) => updateItem(selected.id, { order: Number(event.target.value) })} /></label>

              {activeKind === "poi" ? <>
                <label><span>分类</span><input value={selected.category ?? ""} onChange={(event) => updateItem(selected.id, { category: event.target.value })} /></label>
                <label className="span-2"><span>简介</span><textarea value={selected.summary ?? ""} onChange={(event) => updateItem(selected.id, { summary: event.target.value })} /></label>
              </> : null}

              {activeKind === "facility" ? <>
                <label><span>设施分类</span><input value={categoryNames.get(selected.category_id ?? "") ?? "其他设施"} readOnly /></label>
                <label><span>地图坐标</span><input value={selected.lat != null && selected.lng != null ? `${selected.lng.toFixed(6)}, ${selected.lat.toFixed(6)}` : "未设置"} readOnly /></label>
              </> : null}

              {activeKind === "facility_category" ? (
                <div className="content-data-note span-2"><Tags size={18} /><div><strong>分类名称将同步到游客服务与地图筛选</strong><span>该分类包含的具体点位仍保留各自坐标和显示状态。</span></div></div>
              ) : null}

              {activeKind === "route" ? <>
                <label><span>展示时长</span><input value={selected.duration ?? ""} onChange={(event) => updateItem(selected.id, { duration: event.target.value })} /></label>
                <label><span>分钟数</span><input type="number" min="30" max="720" value={selected.duration_minutes ?? 240} onChange={(event) => updateItem(selected.id, { duration_minutes: Number(event.target.value) })} /></label>
                <label><span>推荐人群</span><input value={selected.audience ?? ""} onChange={(event) => updateItem(selected.id, { audience: event.target.value })} /></label>
                <label><span>游览节奏</span><input value={selected.pace ?? ""} onChange={(event) => updateItem(selected.id, { pace: event.target.value })} /></label>
                <label className="span-2"><span>路线标签</span><input value={selected.helper ?? ""} onChange={(event) => updateItem(selected.id, { helper: event.target.value })} /></label>
                <label className="span-2"><span>路线简介</span><textarea value={selected.summary ?? ""} onChange={(event) => updateItem(selected.id, { summary: event.target.value })} /></label>
                <label className="span-2"><span>景点顺序（顿号分隔）</span><textarea value={(selected.stops ?? []).join("、")} onChange={(event) => updateItem(selected.id, { stops: splitList(event.target.value) })} /></label>
                <label className="span-2"><span>路线提示（顿号分隔）</span><input value={(selected.notes ?? []).join("、")} onChange={(event) => updateItem(selected.id, { notes: splitList(event.target.value) })} /></label>
                <label><span>同行类型</span><input value={(selected.audience_tags ?? []).join("、")} onChange={(event) => updateItem(selected.id, { audience_tags: splitList(event.target.value) })} /></label>
                <label><span>兴趣标签</span><input value={(selected.interest_tags ?? []).join("、")} onChange={(event) => updateItem(selected.id, { interest_tags: splitList(event.target.value) })} /></label>
              </> : null}

              {activeKind === "performance" ? <>
                <label><span>副标题</span><input value={selected.subtitle ?? ""} onChange={(event) => updateItem(selected.id, { subtitle: event.target.value })} /></label>
                <label><span>地点</span><input value={selected.location ?? ""} onChange={(event) => updateItem(selected.id, { location: event.target.value })} /></label>
                <label><span>地图目的地</span><input value={selected.map_destination ?? ""} onChange={(event) => updateItem(selected.id, { map_destination: event.target.value })} /></label>
                <label><span>到场提醒</span><input value={selected.arrival_notice ?? ""} onChange={(event) => updateItem(selected.id, { arrival_notice: event.target.value })} /></label>
                <label className="span-2"><span>介绍</span><textarea value={selected.description ?? ""} onChange={(event) => updateItem(selected.id, { description: event.target.value })} /></label>
                <label><span>有效开始</span><input type="date" value={dateValue(selected.valid_from)} onChange={(event) => updateItem(selected.id, { valid_from: `${event.target.value}T00:00:00+08:00` })} /></label>
                <label><span>有效结束</span><input type="date" value={dateValue(selected.valid_until)} onChange={(event) => updateItem(selected.id, { valid_until: `${event.target.value}T23:59:59+08:00` })} /></label>
                <label className="span-2"><span>场次（每行“日期类型：时间、时间”）</span><textarea value={formatSchedules(selected.schedules)} onChange={(event) => updateItem(selected.id, { schedules: parseSchedules(event.target.value) })} /></label>
              </> : null}
            </div>

            <div className="content-item-actions">
              <button type="button" className={selected.enabled ? "active" : ""} onClick={() => updateItem(selected.id, { enabled: !selected.enabled })}>{selected.enabled ? <Eye size={15} /> : <EyeOff size={15} />}{selected.enabled ? "前台显示" : "前台隐藏"}</button>
              {supportsFeatured ? <button type="button" className={selected.featured ? "active" : ""} onClick={() => updateItem(selected.id, { featured: !selected.featured })}><Star size={15} />{selected.featured ? "重点推荐" : "普通内容"}</button> : null}
              <button type="button" className="primary" onClick={() => void saveItem(selected)} disabled={pendingId === selected.id}><Save size={15} />{pendingId === selected.id ? "发布中" : savedId === selected.id ? "已发布" : "保存并发布"}</button>
              <button type="button" onClick={() => window.open(`/${previewHash}`, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />前台预览</button>
            </div>
          </> : <p className="content-editor-empty">从左侧目录选择一项内容</p>}
        </section>
      </div>
    </section>
  );
}
