import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import {
  ArrowDownUp,
  ChevronRight,
  Clock3,
  Footprints,
  Layers3,
  LocateFixed,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  PanelLeftOpen,
  Route,
  Sparkles,
  X,
} from "lucide-react";
import type { VisitorEventType } from "./visitorEvents";
import {
  recommendRoute,
  type RouteCompanion,
  type RouteInterest,
  type RoutePreferences,
  type RouteRecommendation,
  type RouteTime,
} from "./routeRecommendation";

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  AutoComplete?: new (options: Record<string, unknown>) => AMapAutoComplete;
  Geolocation?: new (options: Record<string, unknown>) => AMapGeolocation;
  TileLayer: AMapTileLayerFactory;
  Buildings: new (options?: Record<string, unknown>) => unknown;
  Marker: new (options: Record<string, unknown>) => AMapOverlay;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  plugin: (plugins: string | string[], callback: () => void) => void;
};

type AMapLayer = unknown;
type AMapOverlay = unknown;
type AMapTileLayerFactory = (new (options?: Record<string, unknown>) => AMapLayer) & {
  Satellite: new (options?: Record<string, unknown>) => AMapLayer;
  RoadNet: new (options?: Record<string, unknown>) => AMapLayer;
};
type AMapMap = {
  setLayers: (layers: AMapLayer[]) => void;
  setPitch: (pitch: number) => void;
  setRotation: (rotation: number) => void;
  setZoom: (zoom: number) => void;
  setMapStyle: (style: string) => void;
  setCenter: (center: [number, number]) => void;
  destroy: () => void;
  addControl: (control: unknown) => void;
  add: (overlay: AMapOverlay | AMapOverlay[]) => void;
  remove: (overlay: AMapOverlay | AMapOverlay[]) => void;
  setFitView: (
    overlays?: AMapOverlay[],
    immediately?: boolean,
    avoid?: [number, number, number, number],
    maxZoom?: number,
  ) => void;
};
type AMapAutoComplete = {
  search: (
    keyword: string,
    callback: (status: string, result: { tips?: AMapTip[] } | string) => void,
  ) => void;
  on?: (event: "select", callback: (payload: { poi?: AMapTip }) => void) => void;
};
type AMapGeolocation = {
  getCurrentPosition: (
    callback: (status: string, result: AMapGeolocationResult | string) => void,
  ) => void;
};

type AMapGeolocationResult = {
  position?: {
    lng?: number;
    lat?: number;
  };
  formattedAddress?: string;
};

type AMapTip = {
  id?: string;
  name?: string;
  district?: string;
  address?: string;
  adcode?: string;
  aliases?: string[];
  location?: string | [number, number] | { lng?: number; lat?: number };
};

type ScenicRoute = {
  id: string;
  name: string;
  helper: string;
  duration: string;
  audience: string;
  pace: string;
  summary: string;
  stops: string[];
  notes: string[];
  durationMinutes: number;
  audienceTags: string[];
  interestTags: string[];
  distanceKm: number;
  tags: string[];
  routeStops: Array<{ id: string; name: string; lat: number; lng: number; order: number }>;
  path: [number, number][];
};

type FacilityCategory = {
  id: string;
  title: string;
  isCommon: boolean;
  enabled: boolean;
};

type ScenicFacility = {
  id: string;
  title: string;
  categoryId: string;
  lat: number;
  lng: number;
  enabled: boolean;
};

type WalkingRouteStep = {
  instruction: string;
  distance: number;
  duration: number;
  polyline: [number, number][];
};

type WalkingRouteResponse = {
  distance: number;
  duration: number;
  polyline: [number, number][];
  steps: WalkingRouteStep[];
};

type WalkingRouteSummary = {
  start: string;
  end: string;
  distance: number;
  duration: number;
};

type AmapDisplayMode = "standard" | "satellite" | "three" | "street";
type MapLoadState = "loading" | "ready" | "error";

const AMAP_JS_KEY = "0c91c46696371d408fe7c3df5acb44dd";
const AMAP_SCRIPT_ID = "amap-js-api";
const LINGSHAN_CENTER: [number, number] = [120.0914, 31.4253];
const ROUTE_CITY = "无锡";
const MIN_SUGGESTION_LENGTH = 2;
const LOCAL_NAVIGATION_SUGGESTIONS: AMapTip[] = [
  {
    id: "local-lingshan-scenic",
    name: "灵山胜境",
    district: "江苏省无锡市滨湖区",
    address: "马山镇古竹路18号",
    adcode: "320211",
    location: [120.100925, 31.42592],
    aliases: ["灵山", "景区", "灵山景区"],
  },
  {
    id: "local-ticket-gate",
    name: "灵山胜境售票处",
    district: "江苏省无锡市滨湖区",
    address: "新龙路与群灵路交叉路口北侧（灵山胜境）",
    adcode: "320211",
    location: [120.102934, 31.420115],
    aliases: ["检票口", "景区入口", "灵山胜境检票口"],
  },
  {
    id: "local-lingshan-buddha",
    name: "灵山胜境-灵山大佛",
    district: "江苏省无锡市滨湖区",
    address: "马山街道灵山路1号",
    adcode: "320211",
    location: [120.096477, 31.430194],
    aliases: ["灵山", "大佛", "灵山大佛"],
  },
  {
    id: "local-jiulong",
    name: "九龙灌浴",
    district: "江苏省无锡市滨湖区",
    address: "马山灵山胜境景区内",
    adcode: "320211",
    location: [120.099984, 31.424601],
    aliases: ["九龙", "九龙灌浴广场"],
  },
  {
    id: "local-buddha-hand",
    name: "灵山胜境-佛手广场",
    district: "江苏省无锡市滨湖区",
    address: "古竹路18号灵山大佛",
    adcode: "320211",
    location: [120.098781, 31.427066],
    aliases: ["灵山佛手", "佛手广场", "天下第一掌"],
  },
  {
    id: "local-maitreya",
    name: "灵山胜境-百子戏弥勒",
    district: "江苏省无锡市滨湖区",
    address: "马山镇古竹路灵山胜境景区内",
    adcode: "320211",
    location: [120.098844, 31.42719],
    aliases: ["百子戏弥勒", "弥勒", "弥勒广场"],
  },
  {
    id: "local-fangong",
    name: "灵山胜境-灵山梵宫",
    district: "江苏省无锡市滨湖区",
    address: "马山镇灵山路1号灵山胜境东北角",
    adcode: "320211",
    location: [120.10242, 31.428218],
    aliases: ["梵宫", "梵宫广场", "灵山梵宫"],
  },
  {
    id: "local-xiangfu",
    name: "灵山胜境-祥符禅寺",
    district: "江苏省无锡市滨湖区",
    address: "马山灵山胜境景区内",
    adcode: "320211",
    location: [120.098012, 31.427949],
    aliases: ["祥符禅寺", "禅寺", "祥符寺"],
  },
  {
    id: "local-fozutan",
    name: "灵山胜境-佛足坛",
    district: "江苏省无锡市滨湖区",
    address: "马山灵山胜境景区内",
    adcode: "320211",
    location: [120.101497, 31.422725],
    aliases: ["佛足坛", "佛足", "佛足步道"],
  },
  {
    id: "local-wuyin",
    name: "五印坛城",
    district: "江苏省无锡市滨湖区",
    address: "马山灵山胜境景区内",
    adcode: "320211",
    location: [120.103054, 31.424676],
    aliases: ["五印", "坛城"],
  },
  {
    id: "local-tourist-center",
    name: "灵山胜境游客中心",
    district: "江苏省无锡市滨湖区",
    address: "马山古竹路1号停车场内",
    adcode: "320211",
    location: [120.103651, 31.420196],
    aliases: ["游客中心", "服务中心", "游客服务中心"],
  },
  {
    id: "local-scenic-exit",
    name: "灵山胜境停车场（出口）",
    district: "江苏省无锡市滨湖区",
    address: "马山镇古竹路灵山胜境景区内",
    adcode: "320211",
    location: [120.105767, 31.421824],
    aliases: ["景区出口", "灵山胜境出口", "出口"],
  },
];

const DEFAULT_START_TIP = LOCAL_NAVIGATION_SUGGESTIONS.find(
  (tip) => tip.id === "local-tourist-center",
) ?? LOCAL_NAVIGATION_SUGGESTIONS[0];
const DEFAULT_END_TIP = LOCAL_NAVIGATION_SUGGESTIONS.find(
  (tip) => tip.id === "local-lingshan-buddha",
) ?? LOCAL_NAVIGATION_SUGGESTIONS[0];
const QUICK_DESTINATION_IDS = [
  "local-lingshan-buddha",
  "local-jiulong",
  "local-fangong",
  "local-wuyin",
];
const QUICK_DESTINATIONS = QUICK_DESTINATION_IDS.map(
  (id) => LOCAL_NAVIGATION_SUGGESTIONS.find((tip) => tip.id === id),
).filter((tip): tip is AMapTip => Boolean(tip?.name));
const SCENIC_MAP_LANDMARK_IDS = [
  "local-tourist-center",
  "local-jiulong",
  "local-buddha-hand",
  "local-lingshan-buddha",
  "local-fangong",
  "local-wuyin",
];
const SCENIC_MAP_LANDMARKS = SCENIC_MAP_LANDMARK_IDS.map(
  (id) => LOCAL_NAVIGATION_SUGGESTIONS.find((tip) => tip.id === id),
).filter((tip): tip is AMapTip => Boolean(tip?.name));

const routeStopNoteRules: Array<{ keywords: string[]; note: string }> = [
  { keywords: ["检票", "入口"], note: "从入口进入园区，确认路线与讲解节奏。" },
  { keywords: ["佛足"], note: "中轴起点景观，适合短暂停留拍照。" },
  { keywords: ["九龙", "灌浴"], note: "核心动态景观，可结合演出时间停留。" },
  { keywords: ["佛手", "天下第一掌"], note: "标志性互动点，距离大佛核心区较近。" },
  { keywords: ["祥符禅寺"], note: "礼佛参观节点，游览节奏建议放慢。" },
  { keywords: ["大佛"], note: "路线核心景点，预留登高与观景时间。" },
  { keywords: ["梵宫"], note: "室内艺术与演艺空间，适合避开日晒。" },
  { keywords: ["五印坛城"], note: "藏式建筑群，可与梵宫连线游览。" },
  { keywords: ["曼飞龙塔"], note: "外观打卡点，适合作为路线转场。" },
  { keywords: ["降魔浮雕"], note: "沿线文化景观，适合快速浏览。" },
  { keywords: ["百子戏弥勒"], note: "轻松拍照点，亲子游客可多停留。" },
  { keywords: ["涅槃堂"], note: "室内参观节点，注意开放时间。" },
  { keywords: ["平台"], note: "登高观景位置，适合回望景区轴线。" },
  { keywords: ["出口"], note: "结束游览，可衔接返程或服务点。" },
];

function getRouteStopNote(stop: string) {
  return routeStopNoteRules.find((rule) => rule.keywords.some((keyword) => stop.includes(keyword)))?.note
    ?? "按当前游线继续前进，保持从容游览节奏。";
}

const scenicRoutes: ScenicRoute[] = [
  {
    id: "classic",
    name: "经典一日游",
    helper: "首次到访 / 核心景点全覆盖",
    duration: "6–7 小时",
    audience: "首次到访",
    pace: "从容深度",
    summary: "沿景区中轴进入大佛核心区，再前往梵宫与五印坛城，完整感受灵山代表性景观。",
    stops: [
      "检票口",
      "佛足坛",
      "九龙灌浴",
      "灵山佛手",
      "祥符禅寺",
      "灵山大佛",
      "梵宫",
      "五印坛城",
      "景区出口",
    ],
    notes: ["先看核心佛教文化景观", "梵宫与五印坛城安排在后半程", "适合 6-7 小时游览"],
    durationMinutes: 390,
    audienceTags: ["个人", "朋友"],
    interestTags: ["佛教文化", "建筑艺术"],
    distanceKm: 0,
    tags: [],
    routeStops: [],
    path: [],
  },
  {
    id: "family",
    name: "亲子轻松游",
    helper: "互动拍照 / 步行压力较低",
    duration: "约 4 小时",
    audience: "亲子家庭",
    pace: "轻松少折返",
    summary: "减少登高与长距离折返，把互动景观、拍照点和室内空间安排在同一条轻松动线上。",
    stops: ["检票口", "九龙灌浴", "灵山佛手", "百子戏弥勒", "梵宫", "游客中心"],
    notes: ["减少登高与长距离折返", "优先选择互动性强的点位", "适合 4 小时左右"],
    durationMinutes: 240,
    audienceTags: ["亲子"],
    interestTags: ["演出体验", "轻松休闲", "拍照打卡"],
    distanceKm: 0,
    tags: [],
    routeStops: [],
    path: [],
  },
  {
    id: "halfday",
    name: "半日精华游",
    helper: "时间有限 / 快速看重点",
    duration: "3–4 小时",
    audience: "时间有限",
    pace: "重点优先",
    summary: "压缩支线停留，优先串联九龙灌浴、灵山大佛、梵宫和五印坛城四处核心景观。",
    stops: ["检票口", "九龙灌浴", "灵山大佛", "梵宫", "五印坛城", "景区出口"],
    notes: ["压缩支线停留", "优先保证大佛、梵宫、五印坛城", "适合 3-4 小时"],
    durationMinutes: 210,
    audienceTags: ["个人", "朋友", "长者同行"],
    interestTags: ["佛教文化", "建筑艺术"],
    distanceKm: 0,
    tags: [],
    routeStops: [],
    path: [],
  },
];

function buildNarration(route: ScenicRoute) {
  return [
    `为您推荐${route.name}。`,
    `${route.summary}`,
    `预计用时${route.duration}，适合${route.audience}，游览节奏${route.pace}。`,
    `讲解重点：${route.notes.join("；")}。`,
    "您可以结合景区图确认大致方位，具体点到点导航可在地图导航页输入起点和终点规划。",
  ].join("");
}

function loadAmapScript() {
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }

  return new Promise<AMapNamespace>((resolve, reject) => {
    const existingScript = document.getElementById(AMAP_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      const readyState = (existingScript as HTMLScriptElement & { readyState?: string }).readyState;
      if (
        existingScript.dataset.amapLoaded === "true" ||
        readyState === "complete" ||
        readyState === "loaded"
      ) {
        existingScript.remove();
        loadAmapScript().then(resolve, reject);
        return;
      }
      existingScript.addEventListener("load", () => {
        existingScript.dataset.amapLoaded = "true";
        if (window.AMap) {
          resolve(window.AMap);
        } else {
          existingScript.remove();
          reject(new Error("高德地图加载失败"));
        }
      });
      existingScript.addEventListener("error", () => {
        existingScript.remove();
        reject(new Error("高德地图脚本加载失败"));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = AMAP_SCRIPT_ID;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}&plugin=AMap.Geolocation,AMap.AutoComplete`;
    script.async = true;
    script.onload = () => {
      script.dataset.amapLoaded = "true";
      if (window.AMap) {
        resolve(window.AMap);
      } else {
        script.remove();
        reject(new Error("高德地图加载失败"));
      }
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("高德地图脚本加载失败"));
    };
    document.head.appendChild(script);
  });
}

function loadAmapPlugin(plugin: string | string[]) {
  return new Promise<AMapNamespace>((resolve, reject) => {
    if (!window.AMap) {
      reject(new Error("高德地图尚未加载完成"));
      return;
    }

    window.AMap.plugin(plugin, () => resolve(window.AMap as AMapNamespace));
  });
}

function normalizeTips(result: { tips?: AMapTip[] } | string) {
  if (typeof result === "string" || !Array.isArray(result.tips)) {
    return [];
  }

  return result.tips
    .filter((tip) => typeof tip.name === "string" && tip.name.trim().length > 0)
    .slice(0, 6);
}

function getLocalSuggestions(keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return [];
  }

  return LOCAL_NAVIGATION_SUGGESTIONS.filter((tip) => {
    const searchable = [tip.name, tip.district, tip.address, ...(tip.aliases ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedKeyword);
  });
}

function mergeSuggestions(keyword: string, amapTips: AMapTip[]) {
  const seen = new Set<string>();
  return [...getLocalSuggestions(keyword), ...amapTips]
    .filter((tip) => {
      const key = `${tip.name ?? ""}-${tip.district ?? ""}-${tip.address ?? ""}`;
      if (!tip.name || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function getTipDetail(tip: AMapTip) {
  const detail = [tip.district, tip.address].filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return detail.join(" · ");
}

function findLocalTip(input: string) {
  const normalizedInput = input.trim().toLowerCase();
  if (!normalizedInput) {
    return null;
  }

  return (
    LOCAL_NAVIGATION_SUGGESTIONS.find((tip) =>
      [tip.name, ...(tip.aliases ?? [])]
        .filter((item): item is string => typeof item === "string")
        .some((item) => item.trim().toLowerCase() === normalizedInput),
    ) ?? null
  );
}

function getTipCoordinate(tip: AMapTip | null): [number, number] | null {
  const location = tip?.location;
  if (!location) {
    return null;
  }

  if (Array.isArray(location)) {
    const [lng, lat] = location;
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  if (typeof location === "string") {
    const [lng, lat] = location.split(",").map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  return Number.isFinite(location.lng) && Number.isFinite(location.lat)
    ? [location.lng as number, location.lat as number]
    : null;
}

function isSameRoutePoint(
  startName: string,
  endName: string,
  startCoordinate: [number, number] | null,
  endCoordinate: [number, number] | null,
) {
  if (startCoordinate && endCoordinate) {
    return (
      Math.abs(startCoordinate[0] - endCoordinate[0]) < 0.000001 &&
      Math.abs(startCoordinate[1] - endCoordinate[1]) < 0.000001
    );
  }
  return startName.trim().toLowerCase() === endName.trim().toLowerCase();
}

function buildAmapNavigationUrl(
  startName: string,
  endName: string,
  startCoordinate: [number, number] | null,
  endCoordinate: [number, number] | null,
) {
  if (!startCoordinate || !endCoordinate) {
    return "";
  }
  const params = new URLSearchParams({
    from: `${startCoordinate[0]},${startCoordinate[1]},${startName}`,
    to: `${endCoordinate[0]},${endCoordinate[1]},${endName}`,
    mode: "walk",
    policy: "1",
    src: "灵山智慧导览",
    coordinate: "gaode",
    callnative: "0",
  });
  return `https://uri.amap.com/navigation?${params.toString()}`;
}

function isWalkingRouteResponse(value: unknown): value is WalkingRouteResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<WalkingRouteResponse>;
  return (
    typeof candidate.distance === "number" &&
    typeof candidate.duration === "number" &&
    Array.isArray(candidate.polyline) &&
    Array.isArray(candidate.steps)
  );
}

export function ScenicMapPanel({
  defaultMode,
  immersive = false,
  initialDestination = "",
  onAskRouteStop,
  onOpenMapDestination,
  onNarrationChange,
  onVisitorEvent,
  onRouteContextChange,
}: {
  defaultMode: "route_guide" | "map_guide";
  immersive?: boolean;
  initialDestination?: string;
  onAskRouteStop?: (stop: string) => void;
  onOpenMapDestination?: (stop: string) => void;
  onNarrationChange?: (payload: { key: string; text: string }) => void;
  onVisitorEvent?: (
    eventType: VisitorEventType,
    metadata: Record<string, string | number | boolean | string[]>,
  ) => void;
  onRouteContextChange?: (context: {
    routeId: string;
    routeName: string;
    summary: string;
    duration: string;
    audience: string;
    pace: string;
    stops: string[];
    preferences: RoutePreferences;
  }) => void;
}) {
  const [activeRouteId, setActiveRouteId] = useState(
    defaultMode === "map_guide" ? "halfday" : "blessing-zen",
  );
  const [displayMode, setDisplayMode] = useState<AmapDisplayMode>("standard");
  const [mapState, setMapState] = useState<MapLoadState>("loading");
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [mapStatus, setMapStatus] = useState("正在加载高德地图...");
  const [locationStatus, setLocationStatus] = useState("未使用浏览器定位");
  const [routeStart, setRouteStart] = useState(DEFAULT_START_TIP.name ?? "灵山胜境游客中心");
  const [routeEnd, setRouteEnd] = useState(DEFAULT_END_TIP.name ?? "灵山胜境-灵山大佛");
  const [selectedStartTip, setSelectedStartTip] = useState<AMapTip | null>(DEFAULT_START_TIP);
  const [selectedEndTip, setSelectedEndTip] = useState<AMapTip | null>(DEFAULT_END_TIP);
  const [startSuggestions, setStartSuggestions] = useState<AMapTip[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<AMapTip[]>([]);
  const [activeSuggestionField, setActiveSuggestionField] = useState<"start" | "end" | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [routePlanStatus, setRoutePlanStatus] = useState(
    "已准备游客中心至灵山大佛路线，点击即可规划。",
  );
  const [routeSteps, setRouteSteps] = useState<WalkingRouteStep[]>([]);
  const [routeSummary, setRouteSummary] = useState<WalkingRouteSummary | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(!immersive);
  const [suggestionStatus, setSuggestionStatus] = useState("输入两个字以上可查看高德地点联想。");
  const [publishedPois, setPublishedPois] = useState<Array<{ id: string; title: string; enabled: boolean }> | null>(null);
  const [publishedRoutes, setPublishedRoutes] = useState<ScenicRoute[] | null>(null);
  const [facilityCategories, setFacilityCategories] = useState<FacilityCategory[]>([]);
  const [facilities, setFacilities] = useState<ScenicFacility[]>([]);
  const [selectedFacilityCategoryId, setSelectedFacilityCategoryId] = useState("");
  const [routePreferences, setRoutePreferences] = useState<RoutePreferences>({
    companion: "",
    time: "",
    interests: [],
  });
  const [confirmedRecommendationId, setConfirmedRecommendationId] = useState("");
  const panelRef = useRef<HTMLElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const routePanelRef = useRef<HTMLDivElement | null>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);
  const amapNamespaceRef = useRef<AMapNamespace | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const routeOverlaysRef = useRef<AMapOverlay[]>([]);
  const landmarkMarkersRef = useRef<AMapOverlay[]>([]);
  const facilityMarkersRef = useRef<AMapOverlay[]>([]);
  const routeRequestRef = useRef<AbortController | null>(null);
  const routeRequestSeqRef = useRef(0);
  const locationRequestSeqRef = useRef(0);
  const lastRecommendationEventRef = useRef("");
  const startAutoCompleteRef = useRef<AMapAutoComplete | null>(null);
  const endAutoCompleteRef = useRef<AMapAutoComplete | null>(null);
  const startSuggestionSeqRef = useRef(0);
  const endSuggestionSeqRef = useRef(0);

  const availableRoutes = publishedRoutes ?? scenicRoutes;
  const activeRoute = useMemo(
    () => availableRoutes.find((route) => route.id === activeRouteId) ?? availableRoutes[0] ?? scenicRoutes[0],
    [activeRouteId, availableRoutes],
  );
  const visibleLandmarks = useMemo(
    () => publishedPois
      ? SCENIC_MAP_LANDMARKS.flatMap((tip) => {
          const content = publishedPois.find((item) => item.id === tip.id);
          return content?.enabled ? [{ ...tip, name: content.title }] : [];
        })
      : SCENIC_MAP_LANDMARKS,
    [publishedPois],
  );
  const visibleQuickDestinations = useMemo(
    () => publishedPois
      ? QUICK_DESTINATIONS.flatMap((tip) => {
          const content = publishedPois.find((item) => item.id === tip.id);
          return content?.enabled ? [{ ...tip, name: content.title }] : [];
        })
      : QUICK_DESTINATIONS,
    [publishedPois],
  );
  const routeRecommendation = useMemo(
    () => recommendRoute(
      availableRoutes.map((route) => ({
        id: route.id,
        name: route.name,
        durationMinutes: route.durationMinutes,
        audienceTags: route.audienceTags,
        interestTags: route.interestTags,
      })),
      routePreferences,
    ),
    [availableRoutes, routePreferences],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/scenic/content", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((payload: {
        items?: {
          poi?: Array<{ id: string; title: string; enabled: boolean }>;
          route?: Array<{
            id: string;
            title: string;
            helper: string;
            duration: string;
            duration_minutes: number;
            audience: string;
            pace: string;
            summary: string;
            stops: string[];
            notes: string[];
            audience_tags: string[];
            interest_tags: string[];
            distance_km?: number;
            tags?: string[];
            route_stops?: Array<{ id: string; name: string; lat: number; lng: number; order: number }>;
            path?: Array<{ lat: number; lng: number }>;
            enabled: boolean;
            order?: number;
          }>;
          facility_category?: Array<{ id: string; title: string; is_common?: boolean; enabled: boolean }>;
          facility?: Array<{ id: string; title: string; category_id: string; lat: number; lng: number; enabled: boolean }>;
        };
      }) => {
        if (payload.items?.poi) setPublishedPois(payload.items.poi);
        if (payload.items?.route) {
          setPublishedRoutes(
            payload.items.route
              .filter((route) => route.enabled)
              .map((route) => ({
                id: route.id,
                name: route.title,
                helper: route.helper,
                duration: route.duration,
                durationMinutes: route.duration_minutes,
                audience: route.audience,
                pace: route.pace,
                summary: route.summary,
                stops: route.stops,
                notes: route.notes,
                audienceTags: route.audience_tags,
                interestTags: route.interest_tags,
                distanceKm: route.distance_km ?? 0,
                tags: route.tags ?? [],
                routeStops: route.route_stops ?? [],
                path: (route.path ?? []).map((point) => [point.lng, point.lat]),
              })),
          );
        }
        if (payload.items?.facility_category) {
          setFacilityCategories(
            payload.items.facility_category
              .filter((category) => category.enabled)
              .map((category) => ({
                id: category.id,
                title: category.title,
                isCommon: Boolean(category.is_common),
                enabled: category.enabled,
              })),
          );
        }
        if (payload.items?.facility) {
          setFacilities(
            payload.items.facility
              .filter((facility) => facility.enabled)
              .map((facility) => ({
                id: facility.id,
                title: facility.title,
                categoryId: facility.category_id,
                lat: facility.lat,
                lng: facility.lng,
                enabled: facility.enabled,
              })),
          );
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setActiveRouteId(defaultMode === "map_guide" ? "halfday" : "blessing-zen");
  }, [defaultMode]);

  useEffect(() => {
    if (defaultMode !== "map_guide" || !initialDestination.trim() || facilityCategories.length === 0) return;
    const destination = initialDestination.trim();
    const category = facilityCategories.find((item) =>
      destination.includes(item.title) || item.title.includes(destination),
    );
    if (category) setSelectedFacilityCategoryId(category.id);
  }, [defaultMode, facilityCategories, initialDestination]);

  useEffect(() => {
    const destination = initialDestination.trim();
    if (defaultMode !== "map_guide" || !destination) {
      return;
    }
    const localTip = findLocalTip(destination);
    invalidateRoute(`已带入目的地“${destination}”，请确认后规划步行路线。`);
    setRouteEnd(destination);
    setSelectedEndTip(localTip);
    setEndSuggestions([]);
    setIsPlannerOpen(true);
  }, [defaultMode, initialDestination]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeSuggestionField, startSuggestions, endSuggestions]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultMode]);

  useEffect(() => {
    if (defaultMode === "route_guide") {
      onNarrationChange?.({
        key: `route-${activeRoute.id}`,
        text: buildNarration(activeRoute),
      });
    }
  }, [activeRoute, defaultMode, onNarrationChange]);

  useEffect(() => {
    if (defaultMode !== "route_guide") return;
    onRouteContextChange?.({
      routeId: activeRoute.id,
      routeName: activeRoute.name,
      summary: activeRoute.summary,
      duration: activeRoute.duration,
      audience: activeRoute.audience,
      pace: activeRoute.pace,
      stops: activeRoute.stops,
      preferences: routePreferences,
    });
  }, [activeRoute, defaultMode, onRouteContextChange, routePreferences]);

  useEffect(() => {
    if (defaultMode !== "route_guide" || !routeRecommendation) return;
    const eventKey = `${routeRecommendation.routeId}:${routeRecommendation.score}:${routePreferences.companion}:${routePreferences.time}:${routePreferences.interests.join(",")}`;
    if (lastRecommendationEventRef.current === eventKey) return;
    lastRecommendationEventRef.current = eventKey;
    const recommendedRoute = availableRoutes.find((route) => route.id === routeRecommendation.routeId);
    onVisitorEvent?.("route_generate", {
      routeId: routeRecommendation.routeId,
      score: routeRecommendation.score,
      durationMinutes: recommendedRoute?.durationMinutes ?? 0,
    });
  }, [availableRoutes, defaultMode, onVisitorEvent, routePreferences, routeRecommendation]);

  useEffect(() => {
    const sequence = startSuggestionSeqRef.current + 1;
    startSuggestionSeqRef.current = sequence;
    if (defaultMode !== "map_guide" && defaultMode !== "route_guide") {
      return undefined;
    }

    const keyword = routeStart.trim();
    if (selectedStartTip?.name === keyword || keyword.length < MIN_SUGGESTION_LENGTH) {
      setStartSuggestions([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        await loadAmapScript();
        const AMap = await loadAmapPlugin("AMap.AutoComplete");
        if (!AMap.AutoComplete || startSuggestionSeqRef.current !== sequence) {
          return;
        }

        startAutoCompleteRef.current ??= new AMap.AutoComplete({
          city: ROUTE_CITY,
          citylimit: false,
        });
        startAutoCompleteRef.current.search(keyword, (status, result) => {
          if (startSuggestionSeqRef.current !== sequence) {
            return;
          }
          const tips = mergeSuggestions(keyword, status === "complete" ? normalizeTips(result) : []);
          setStartSuggestions(tips);
          setSuggestionStatus(tips.length > 0 ? "请选择准确地点后再规划路线。" : "未找到匹配地点，可补充更完整名称。");
        });
      } catch {
        if (startSuggestionSeqRef.current !== sequence) {
          return;
        }
        const tips = getLocalSuggestions(keyword);
        setStartSuggestions(tips);
        setSuggestionStatus(tips.length > 0 ? "已显示景区内常用地点候选。" : "地点联想组件加载失败，请稍后重试。");
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [defaultMode, routeStart, selectedStartTip]);

  useEffect(() => {
    const sequence = endSuggestionSeqRef.current + 1;
    endSuggestionSeqRef.current = sequence;
    if (defaultMode !== "map_guide" && defaultMode !== "route_guide") {
      return undefined;
    }

    const keyword = routeEnd.trim();
    if (selectedEndTip?.name === keyword || keyword.length < MIN_SUGGESTION_LENGTH) {
      setEndSuggestions([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        await loadAmapScript();
        const AMap = await loadAmapPlugin("AMap.AutoComplete");
        if (!AMap.AutoComplete || endSuggestionSeqRef.current !== sequence) {
          return;
        }

        endAutoCompleteRef.current ??= new AMap.AutoComplete({
          city: ROUTE_CITY,
          citylimit: false,
        });
        endAutoCompleteRef.current.search(keyword, (status, result) => {
          if (endSuggestionSeqRef.current !== sequence) {
            return;
          }
          const tips = mergeSuggestions(keyword, status === "complete" ? normalizeTips(result) : []);
          setEndSuggestions(tips);
          setSuggestionStatus(tips.length > 0 ? "请选择准确地点后再规划路线。" : "未找到匹配地点，可补充更完整名称。");
        });
      } catch {
        if (endSuggestionSeqRef.current !== sequence) {
          return;
        }
        const tips = getLocalSuggestions(keyword);
        setEndSuggestions(tips);
        setSuggestionStatus(tips.length > 0 ? "已显示景区内常用地点候选。" : "地点联想组件加载失败，请稍后重试。");
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [defaultMode, routeEnd, selectedEndTip]);

  useEffect(() => {
    let disposed = false;
    if (defaultMode !== "map_guide" && defaultMode !== "route_guide") {
      return undefined;
    }

    async function initMap() {
      setMapState("loading");
      setMapStatus("正在连接高德地图服务...");
      try {
        const AMap = await loadAmapScript();
        if (disposed || !mapContainerRef.current) {
          return;
        }

        const map = new AMap.Map(mapContainerRef.current, {
          center: LINGSHAN_CENTER,
          zoom: 15,
          viewMode: "3D",
          resizeEnable: true,
        });
        amapNamespaceRef.current = AMap;
        mapRef.current = map;

        setDisplayMode("standard");
        setMapState("ready");
        setMapStatus("高德地图已加载，可拖拽缩放并切换地图类型。");
      } catch (error) {
        if (disposed) {
          return;
        }
        setMapState("error");
        setMapStatus(error instanceof Error ? error.message : "高德地图加载失败");
      }
    }

    void initMap();
    return () => {
      disposed = true;
      routeRequestSeqRef.current += 1;
      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
      if (routeOverlaysRef.current.length > 0 && mapRef.current) {
        mapRef.current.remove(routeOverlaysRef.current);
      }
      routeOverlaysRef.current = [];
      landmarkMarkersRef.current = [];
      facilityMarkersRef.current = [];
      amapNamespaceRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [defaultMode, mapRetryKey]);

  useEffect(() => {
    const AMap = amapNamespaceRef.current;
    const map = mapRef.current;
    if (defaultMode !== "map_guide" || mapState !== "ready" || !AMap?.Marker || !map) {
      return undefined;
    }

    if (landmarkMarkersRef.current.length > 0) {
      map.remove(landmarkMarkersRef.current);
    }

    const markers = visibleLandmarks.flatMap((tip) => {
      const coordinate = getTipCoordinate(tip);
      const name = tip.name?.trim();
      if (!coordinate || !name) {
        return [];
      }

      const markerButton = document.createElement("button");
      markerButton.type = "button";
      markerButton.className = [
        "amap-landmark-pin",
        selectedEndTip?.id === tip.id ? "is-active" : "",
        tip.id === "local-wuyin" ? "is-offset-right" : "",
      ].filter(Boolean).join(" ");
      const displayName = name.replace(/^灵山胜境-?/, "");
      markerButton.setAttribute("aria-label", `将${displayName}设为目的地`);
      markerButton.title = `导航到${displayName}`;

      const markerDot = document.createElement("span");
      markerDot.setAttribute("aria-hidden", "true");
      const markerLabel = document.createElement("strong");
      markerLabel.textContent = displayName;
      markerButton.append(markerDot, markerLabel);
      markerButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      markerButton.addEventListener("click", (event) => {
        event.stopPropagation();
        invalidateRoute(`已在地图中选择${displayName}，请确认后规划步行路线。`);
        setRouteEnd(name);
        setSelectedEndTip(tip);
        setEndSuggestions([]);
        setIsPlannerOpen(true);
        map.setCenter(coordinate);
        map.setZoom(17);
        onVisitorEvent?.("map_search", { destination: displayName, source: "marker" });
      });

      return [
        new AMap.Marker({
          position: coordinate,
          anchor: "bottom-center",
          content: markerButton,
          zIndex: selectedEndTip?.id === tip.id ? 130 : 110,
        }),
      ];
    });

    map.add(markers);
    landmarkMarkersRef.current = markers;
    return () => {
      if (mapRef.current === map) {
        map.remove(markers);
      }
      if (landmarkMarkersRef.current === markers) {
        landmarkMarkersRef.current = [];
      }
    };
  }, [defaultMode, mapRetryKey, mapState, selectedEndTip?.id, visibleLandmarks]);

  const selectedFacilityCategory = facilityCategories.find((item) => item.id === selectedFacilityCategoryId) ?? null;
  const selectedFacilities = useMemo(
    () => selectedFacilityCategoryId
      ? facilities.filter((facility) => facility.categoryId === selectedFacilityCategoryId)
      : [],
    [facilities, selectedFacilityCategoryId],
  );

  useEffect(() => {
    const AMap = amapNamespaceRef.current;
    const map = mapRef.current;
    if (defaultMode !== "map_guide" || mapState !== "ready" || !AMap?.Marker || !map) {
      return undefined;
    }
    if (facilityMarkersRef.current.length > 0) {
      map.remove(facilityMarkersRef.current);
    }
    if (!selectedFacilityCategory) return undefined;

    const markers = selectedFacilities.flatMap((facility, index) => {
      const markerButton = document.createElement("button");
      markerButton.type = "button";
      markerButton.className = "amap-facility-pin";
      markerButton.setAttribute("aria-label", `选择${facility.title}作为导航终点`);
      markerButton.title = facility.title;
      const markerIndex = document.createElement("span");
      markerIndex.textContent = String(index + 1);
      const markerLabel = document.createElement("b");
      markerLabel.textContent = selectedFacilityCategory.title;
      markerButton.append(markerIndex, markerLabel);
      markerButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      markerButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const tip: AMapTip = {
          id: facility.id,
          name: facility.title,
          location: [facility.lng, facility.lat],
          address: selectedFacilityCategory.title,
        };
        invalidateRoute(`已选择${facility.title}，请确认后规划步行路线。`);
        setRouteEnd(facility.title);
        setSelectedEndTip(tip);
        setEndSuggestions([]);
        setIsPlannerOpen(true);
        map.setCenter([facility.lng, facility.lat]);
        map.setZoom(17);
        onVisitorEvent?.("map_search", {
          destination: facility.title,
          source: "facility_marker",
          category: selectedFacilityCategory.title,
        });
      });
      return [new AMap.Marker({
        position: [facility.lng, facility.lat],
        anchor: "bottom-center",
        content: markerButton,
        zIndex: 115,
      })];
    });
    map.add(markers);
    facilityMarkersRef.current = markers;
    if (markers.length > 0) map.setFitView(markers, false, [86, 36, 40, 370], 17);
    return () => {
      if (mapRef.current === map) map.remove(markers);
      if (facilityMarkersRef.current === markers) facilityMarkersRef.current = [];
    };
  }, [defaultMode, mapState, onVisitorEvent, selectedFacilityCategory, selectedFacilities]);

  useEffect(() => {
    const AMap = amapNamespaceRef.current;
    const map = mapRef.current;
    if (defaultMode !== "route_guide" || mapState !== "ready" || !AMap?.Marker || !AMap?.Polyline || !map) {
      return undefined;
    }

    if (routeOverlaysRef.current.length > 0) {
      map.remove(routeOverlaysRef.current);
    }

    const line = activeRoute.path.length > 1
      ? new AMap.Polyline({
          path: activeRoute.path,
          strokeColor: "#14735d",
          strokeWeight: 6,
          strokeOpacity: 0.9,
          strokeStyle: "dashed",
          strokeDasharray: [12, 7],
          lineJoin: "round",
          lineCap: "round",
          zIndex: 120,
        })
      : null;
    const markers = activeRoute.routeStops.flatMap((stop) => {
      if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) return [];
      const markerButton = document.createElement("button");
      markerButton.type = "button";
      markerButton.className = "amap-route-stop-pin";
      markerButton.textContent = String(stop.order);
      markerButton.setAttribute("aria-label", `在地图中查看第 ${stop.order} 站：${stop.name}`);
      markerButton.title = stop.name;
      markerButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      markerButton.addEventListener("click", (event) => {
        event.stopPropagation();
        map.setCenter([stop.lng, stop.lat]);
        map.setZoom(17);
        onOpenMapDestination?.(stop.name);
      });
      return [new AMap.Marker({
        position: [stop.lng, stop.lat],
        anchor: "bottom-center",
        content: markerButton,
        zIndex: 130,
      })];
    });
    const overlays = [...(line ? [line] : []), ...markers];
    map.add(overlays);
    routeOverlaysRef.current = overlays;
    if (overlays.length > 0) {
      map.setFitView(overlays, false, [38, 38, 38, 430], 16);
    }
    return () => {
      if (mapRef.current === map) map.remove(overlays);
      if (routeOverlaysRef.current === overlays) routeOverlaysRef.current = [];
    };
  }, [activeRoute, defaultMode, mapState, onOpenMapDestination]);

  function clearRenderedRoute() {
    routeRequestSeqRef.current += 1;
    routeRequestRef.current?.abort();
    routeRequestRef.current = null;
    if (routeOverlaysRef.current.length > 0 && mapRef.current) {
      mapRef.current.remove(routeOverlaysRef.current);
    }
    routeOverlaysRef.current = [];
    setRouteSummary(null);
    setRouteSteps([]);
    setIsPlanning(false);
  }

  function invalidateRoute(reason: string) {
    clearRenderedRoute();
    setRoutePlanStatus(reason);
  }

  function retryMapLoad() {
    invalidateRoute("地图正在重新连接，请稍候。");
    setMapRetryKey((value) => value + 1);
  }

  function locateWithAmap() {
    const AMap = window.AMap;
    if (mapState !== "ready" || !AMap?.Geolocation || !mapRef.current) {
      setLocationStatus("地图尚未就绪，暂时无法定位");
      return;
    }

    const locationSequence = locationRequestSeqRef.current + 1;
    locationRequestSeqRef.current = locationSequence;
    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 8000,
      zoomToAccuracy: true,
    });
    mapRef.current.addControl(geolocation);
    setLocationStatus("正在通过高德地图读取当前位置...");
    geolocation.getCurrentPosition((status, result) => {
      if (locationRequestSeqRef.current !== locationSequence) {
        return;
      }
      if (status !== "complete" || typeof result === "string") {
        setLocationStatus("定位失败，请检查浏览器定位权限");
        return;
      }

      const lng = result.position?.lng;
      const lat = result.position?.lat;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        setLocationStatus("已获得定位结果，但坐标不可用");
        return;
      }

      const currentLocationTip: AMapTip = {
        id: "browser-current-location",
        name: "我的位置",
        district: result.formattedAddress || "浏览器实时定位",
        location: [lng as number, lat as number],
      };
      invalidateRoute("当前位置已设为起点，请选择目的地后重新规划。");
      setRouteStart("我的位置");
      setSelectedStartTip(currentLocationTip);
      setLocationStatus("定位成功，已设为路线起点");
    });
  }

  function handleRouteStartChange(value: string) {
    locationRequestSeqRef.current += 1;
    invalidateRoute("起点已变化，请从候选中确认后重新规划。");
    setRouteStart(value);
    setSelectedStartTip(null);
    setActiveSuggestionField("start");
  }

  function handleRouteEndChange(value: string) {
    invalidateRoute("终点已变化，请从候选中确认后重新规划。");
    setRouteEnd(value);
    setSelectedEndTip(null);
    setActiveSuggestionField("end");
  }

  function selectRouteSuggestion(field: "start" | "end", tip: AMapTip) {
    const name = tip.name?.trim();
    if (!name) {
      return;
    }

    invalidateRoute(`${field === "start" ? "起点" : "终点"}已更新，请重新规划路线。`);
    if (field === "start") {
      locationRequestSeqRef.current += 1;
      setRouteStart(name);
      setSelectedStartTip(tip);
      setStartSuggestions([]);
      setSuggestionStatus(`已选择起点：${name}`);
    } else {
      setRouteEnd(name);
      setSelectedEndTip(tip);
      setEndSuggestions([]);
      setSuggestionStatus(`已选择终点：${name}`);
      onVisitorEvent?.("map_search", { destination: name, source: "suggestion" });
    }
    setActiveSuggestionField(null);
  }

  function swapRoutePoints() {
    locationRequestSeqRef.current += 1;
    invalidateRoute("已交换起点和终点，请重新规划路线。");
    setRouteStart(routeEnd);
    setRouteEnd(routeStart);
    setSelectedStartTip(selectedEndTip);
    setSelectedEndTip(selectedStartTip);
    setStartSuggestions([]);
    setEndSuggestions([]);
  }

  function selectQuickDestination(tip: AMapTip) {
    const name = tip.name?.trim();
    if (!name) {
      return;
    }
    invalidateRoute(`已选择${name}，请重新规划步行路线。`);
    setRouteEnd(name);
    setSelectedEndTip(tip);
    setEndSuggestions([]);
    onVisitorEvent?.("map_search", { destination: name, source: "quick_destination" });
  }

  function handleSuggestionKeyDown(
    field: "start" | "end",
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    const suggestions = field === "start" ? startSuggestions : endSuggestions;
    if (event.key === "Escape") {
      setActiveSuggestionField(null);
      return;
    }
    if (suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionField(field);
      setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionField(field);
      setActiveSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter" && activeSuggestionField === field) {
      const suggestion = suggestions[activeSuggestionIndex];
      if (suggestion) {
        event.preventDefault();
        selectRouteSuggestion(field, suggestion);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void planWalkingRoute();
    }
  }

  async function planWalkingRoute() {
    const startTip = selectedStartTip ?? findLocalTip(routeStart);
    const endTip = selectedEndTip ?? findLocalTip(routeEnd);
    const startName = routeStart.trim();
    const endName = routeEnd.trim();
    if (!startName || !endName) {
      setRoutePlanStatus("请先输入起点和终点。");
      return;
    }
    const startCoordinate = getTipCoordinate(startTip);
    const endCoordinate = getTipCoordinate(endTip);
    if (!startCoordinate || !endCoordinate) {
      setRoutePlanStatus("请从地点候选中确认带坐标的起点和终点。");
      return;
    }
    if (isSameRoutePoint(startName, endName, startCoordinate, endCoordinate)) {
      setRoutePlanStatus("起点和终点不能相同，请重新选择。");
      return;
    }
    if (mapState !== "ready" || !mapRef.current) {
      setRoutePlanStatus("地图尚未加载完成，请稍后再试。");
      return;
    }

    clearRenderedRoute();
    const requestSequence = routeRequestSeqRef.current;
    const controller = new AbortController();
    routeRequestRef.current = controller;
    setIsPlanning(true);
    setRoutePlanStatus(`正在规划：${startName} → ${endName}`);
    onVisitorEvent?.("navigation_request", {
      startMode: startName === "我的位置" ? "current_location" : "selected_place",
      destination: endName,
    });
    try {
      const AMap = await loadAmapScript();
      const response = await fetch("/api/navigation/walking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin: { lng: startCoordinate[0], lat: startCoordinate[1] },
          destination: { lng: endCoordinate[0], lat: endCoordinate[1] },
        }),
      });
      if (requestSequence !== routeRequestSeqRef.current || controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(errorPayload?.detail || "路线服务暂时不可用");
      }

      const route: unknown = await response.json();
      if (requestSequence !== routeRequestSeqRef.current || controller.signal.aborted) {
        return;
      }
      if (!isWalkingRouteResponse(route) || route.polyline.length < 2) {
        throw new Error("高德未返回可绘制的步行路线");
      }
      const map = mapRef.current;
      if (!map) {
        throw new Error("地图已断开，请重新连接后规划。");
      }
      const polyline = new AMap.Polyline({
        path: route.polyline,
        strokeColor: "#167a6a",
        strokeWeight: 7,
        strokeOpacity: 0.9,
        lineJoin: "round",
        lineCap: "round",
        showDir: true,
      });
      const createEndpointMarker = (
        kind: "start" | "end",
        label: string,
        position: [number, number],
      ) => {
        const content = document.createElement("div");
        content.className = `amap-route-endpoint is-${kind}`;
        const badge = document.createElement("i");
        badge.textContent = kind === "start" ? "起" : "终";
        const text = document.createElement("strong");
        text.textContent = label.replace(/^灵山胜境-?/, "");
        content.append(badge, text);
        return new AMap.Marker({
          position,
          anchor: "bottom-center",
          content,
          zIndex: 150,
        });
      };
      const startMarker = createEndpointMarker("start", startName, startCoordinate);
      const endMarker = createEndpointMarker("end", endName, endCoordinate);
      const routeOverlays = [polyline, startMarker, endMarker];
      map.add(routeOverlays);
      map.setFitView(routeOverlays, false, [64, 64, 92, 64], 17);
      routeOverlaysRef.current = routeOverlays;
      setRouteSteps(route.steps);
      setRouteSummary({
        start: startName,
        end: endName,
        distance: route.distance,
        duration: route.duration,
      });
      const minutes = Math.max(1, Math.round((route.duration || 0) / 60));
      setRoutePlanStatus(
        `路线已生成：约 ${route.distance} 米 / ${minutes} 分钟，现场请留意开放区域。`,
      );
      onVisitorEvent?.("navigation_success", {
        destination: endName,
        distance: route.distance,
        duration: route.duration,
      });
    } catch (error) {
      if (
        requestSequence !== routeRequestSeqRef.current ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setRoutePlanStatus(error instanceof Error ? error.message : "路线规划组件加载失败");
      onVisitorEvent?.("navigation_failure", {
        destination: endName,
        reason: error instanceof Error ? error.message : "路线规划组件加载失败",
      });
    } finally {
      if (
        requestSequence === routeRequestSeqRef.current &&
        routeRequestRef.current === controller
      ) {
        routeRequestRef.current = null;
        setIsPlanning(false);
      }
    }
  }

  function selectCompanion(companion: RouteCompanion) {
    const nextCompanion: RouteCompanion | "" = routePreferences.companion === companion ? "" : companion;
    const nextPreferences = { ...routePreferences, companion: nextCompanion };
    setRoutePreferences(nextPreferences);
    setConfirmedRecommendationId("");
    onVisitorEvent?.("preference_select", {
      category: "companion",
      values: nextCompanion ? [nextCompanion] : [],
    });
  }

  function selectTime(time: RouteTime) {
    const nextTime: RouteTime | "" = routePreferences.time === time ? "" : time;
    const nextPreferences = { ...routePreferences, time: nextTime };
    setRoutePreferences(nextPreferences);
    setConfirmedRecommendationId("");
    onVisitorEvent?.("preference_select", {
      category: "time",
      values: nextTime ? [nextTime] : [],
    });
  }

  function toggleInterest(interest: RouteInterest) {
    const interests = routePreferences.interests.includes(interest)
      ? routePreferences.interests.filter((item) => item !== interest)
      : [...routePreferences.interests, interest];
    setRoutePreferences({ ...routePreferences, interests });
    setConfirmedRecommendationId("");
    onVisitorEvent?.("preference_select", {
      category: "interest",
      values: interests,
    });
  }

  function applyRouteRecommendation(recommendation: RouteRecommendation) {
    const route = availableRoutes.find((item) => item.id === recommendation.routeId);
    if (!route) return;
    setActiveRouteId(route.id);
    setConfirmedRecommendationId(route.id);
    onVisitorEvent?.("route_confirm", {
      routeId: route.id,
      durationMinutes: route.durationMinutes,
    });
  }

  function selectRouteManually(routeId: string) {
    setActiveRouteId(routeId);
    setConfirmedRecommendationId("");
    onVisitorEvent?.("route_adjust", { routeId, adjustment: "manual_selection" });
  }

  if (defaultMode === "route_guide") {
    return (
      <RouteGuideView
        activeRoute={activeRoute}
        routes={availableRoutes}
        onAskRouteStop={onAskRouteStop}
        onOpenMapDestination={onOpenMapDestination}
        onRouteChange={selectRouteManually}
        preferences={routePreferences}
        recommendation={routeRecommendation}
        confirmedRecommendationId={confirmedRecommendationId}
        onCompanionSelect={selectCompanion}
        onTimeSelect={selectTime}
        onInterestToggle={toggleInterest}
        onRecommendationApply={applyRouteRecommendation}
        panelRef={panelRef}
        mapContainerRef={mapContainerRef}
        mapState={mapState}
        onRetryMap={retryMapLoad}
      />
    );
  }

  function applyDisplayMode(nextMode: AmapDisplayMode) {
    const AMap = window.AMap;
    const map = mapRef.current;
    if (mapState !== "ready" || !AMap || !map) {
      setMapStatus("地图尚未就绪，暂时无法切换图层。");
      return;
    }
    setDisplayMode(nextMode);

    if (nextMode === "standard") {
      map.setLayers([new AMap.TileLayer()]);
      map.setMapStyle("amap://styles/normal");
      map.setPitch(0);
      map.setRotation(0);
      map.setZoom(15);
      setMapStatus("已切换为标准地图。");
      return;
    }

    if (nextMode === "satellite") {
      map.setLayers([new AMap.TileLayer.Satellite(), new AMap.TileLayer.RoadNet()]);
      map.setPitch(0);
      map.setRotation(0);
      map.setZoom(15);
      setMapStatus("已切换为卫星图和路网叠加。");
      return;
    }

    if (nextMode === "three") {
      map.setLayers([new AMap.TileLayer(), new AMap.Buildings({ zooms: [15, 20] })]);
      map.setMapStyle("amap://styles/normal");
      map.setZoom(16);
      map.setPitch(58);
      map.setRotation(-18);
      setMapStatus("已切换为 3D 倾斜视角。");
      return;
    }

    map.setLayers([new AMap.TileLayer.Satellite(), new AMap.TileLayer.RoadNet()]);
    map.setZoom(17);
    map.setPitch(70);
    map.setRotation(-22);
    setMapStatus("已切换为卫星底图倾斜视角；这不是街景或倾斜摄影模型。");
  }

  const currentStartTip = selectedStartTip ?? findLocalTip(routeStart);
  const currentEndTip = selectedEndTip ?? findLocalTip(routeEnd);
  const currentStartCoordinate = getTipCoordinate(currentStartTip);
  const currentEndCoordinate = getTipCoordinate(currentEndTip);
  const canPlanRoute = Boolean(
    mapState === "ready" &&
    routeStart.trim() &&
    routeEnd.trim() &&
    currentStartCoordinate &&
    currentEndCoordinate,
  );
  const amapNavigationUrl = routeSummary
    ? buildAmapNavigationUrl(
        routeSummary.start,
        routeSummary.end,
        currentStartCoordinate,
        currentEndCoordinate,
      )
    : "";

  return (
    <AmapNavigationView
      activeSuggestionIndex={activeSuggestionIndex}
      displayMode={displayMode}
      locationStatus={locationStatus}
      mapContainerRef={mapContainerRef}
      mapState={mapState}
      panelRef={panelRef}
      mapStatus={mapStatus}
      activeSuggestionField={activeSuggestionField}
      routeEnd={routeEnd}
      routeEndSuggestions={endSuggestions}
      routePanelRef={routePanelRef}
      routePlanStatus={routePlanStatus}
      routeSteps={routeSteps}
      routeSummary={routeSummary}
      quickDestinations={visibleQuickDestinations}
      facilityCategories={facilityCategories}
      selectedFacilityCategory={selectedFacilityCategory}
      selectedFacilityCount={selectedFacilities.length}
      routeStart={routeStart}
      routeStartSuggestions={startSuggestions}
      endInputRef={endInputRef}
      startInputRef={startInputRef}
      suggestionStatus={suggestionStatus}
      isPlanning={isPlanning}
      immersive={immersive}
      isPlannerOpen={isPlannerOpen}
      canPlan={canPlanRoute}
      amapNavigationUrl={amapNavigationUrl}
      onDisplayModeChange={applyDisplayMode}
      onFacilityCategoryChange={setSelectedFacilityCategoryId}
      onLocate={locateWithAmap}
      onPlannerOpenChange={setIsPlannerOpen}
      onQuickDestination={selectQuickDestination}
      onRetryMap={retryMapLoad}
      onRouteEndChange={handleRouteEndChange}
      onRoutePlan={planWalkingRoute}
      onRouteStartChange={handleRouteStartChange}
      onSwapRoutePoints={swapRoutePoints}
      onSuggestionBlur={() => setActiveSuggestionField(null)}
      onSuggestionFocus={(field) => {
        setActiveSuggestionField(field);
        setActiveSuggestionIndex(0);
      }}
      onSuggestionKeyDown={handleSuggestionKeyDown}
      onSuggestionSelect={selectRouteSuggestion}
    />
  );
}

function RouteGuideView({
  activeRoute,
  routes,
  onAskRouteStop,
  onOpenMapDestination,
  onRouteChange,
  preferences,
  recommendation,
  confirmedRecommendationId,
  onCompanionSelect,
  onTimeSelect,
  onInterestToggle,
  onRecommendationApply,
  panelRef,
  mapContainerRef,
  mapState,
  onRetryMap,
}: {
  activeRoute: ScenicRoute;
  routes: ScenicRoute[];
  onAskRouteStop?: (stop: string) => void;
  onOpenMapDestination?: (stop: string) => void;
  onRouteChange: (routeId: string) => void;
  preferences: RoutePreferences;
  recommendation: RouteRecommendation | null;
  confirmedRecommendationId: string;
  onCompanionSelect: (value: RouteCompanion) => void;
  onTimeSelect: (value: RouteTime) => void;
  onInterestToggle: (value: RouteInterest) => void;
  onRecommendationApply: (recommendation: RouteRecommendation) => void;
  panelRef: RefObject<HTMLElement | null>;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapState: MapLoadState;
  onRetryMap: () => void;
}) {
  const recommendedRoute = recommendation
    ? routes.find((route) => route.id === recommendation.routeId) ?? null
    : null;

  return (
    <section ref={panelRef} className="route-guide-experience" aria-label="灵山推荐游览路线">
      <div className="route-amap-stage" aria-label={`${activeRoute.name}路线地图`}>
        <div ref={mapContainerRef} className="route-amap-canvas" />
        <div className="route-amap-caption">
          <span><i aria-hidden="true" /> {activeRoute.name}</span>
          <small>{activeRoute.distanceKm ? `约 ${activeRoute.distanceKm} 公里 · ${activeRoute.stops.length} 个站点` : "加载路线中"}</small>
        </div>
        {mapState === "loading" ? <div className="route-amap-loading">正在加载高德地图…</div> : null}
        {mapState === "error" ? (
          <div className="route-amap-error">
            <span>地图暂时无法加载，可重试或查看完整站点。</span>
            <button type="button" onClick={onRetryMap}>重新加载</button>
          </div>
        ) : null}
      </div>

      <aside className="route-plan-panel" aria-label="路线选择与景点顺序">
        <header className="route-plan-head">
          <p className="eyebrow">SCENIC ROUTE · LINGSHAN</p>
          <div>
            <h2>{activeRoute.name}</h2>
            <span>{activeRoute.helper}</span>
          </div>
        </header>

        <section className="route-personalizer" aria-label="个性化路线偏好">
          <header>
            <div><strong>按偏好推荐</strong></div>
            {recommendation ? <em>{recommendation.score}% 匹配</em> : null}
          </header>
          <div className="route-preference-row">
            <small>同行</small>
            <div>{(["个人", "朋友", "亲子", "长者同行"] as RouteCompanion[]).map((item) => (
              <button key={item} type="button" className={preferences.companion === item ? "active" : ""} onClick={() => onCompanionSelect(item)} aria-pressed={preferences.companion === item}>{item}</button>
            ))}</div>
          </div>
          <div className="route-preference-row">
            <small>时间</small>
            <div>{(["2 小时", "4 小时", "一日"] as RouteTime[]).map((item) => (
              <button key={item} type="button" className={preferences.time === item ? "active" : ""} onClick={() => onTimeSelect(item)} aria-pressed={preferences.time === item}>{item}</button>
            ))}</div>
          </div>
          <div className="route-preference-row is-interest">
            <small>兴趣</small>
            <div>{(["佛教文化", "建筑艺术", "演出体验", "轻松休闲", "拍照打卡"] as RouteInterest[]).map((item) => (
              <button key={item} type="button" className={preferences.interests.includes(item) ? "active" : ""} onClick={() => onInterestToggle(item)} aria-pressed={preferences.interests.includes(item)}>{item}</button>
            ))}</div>
          </div>
          {recommendation && recommendedRoute ? (
            <div className="route-recommendation-result">
              <div>
                <span>推荐 {recommendedRoute.name}</span>
                <small>{recommendation.reasons.join(" · ") || "综合匹配当前偏好"}</small>
              </div>
              <button type="button" className={confirmedRecommendationId === recommendedRoute.id ? "confirmed" : ""} onClick={() => onRecommendationApply(recommendation)}>
                {confirmedRecommendationId === recommendedRoute.id ? "已采用" : "采用推荐"}
              </button>
            </div>
          ) : null}
        </section>

        <nav className="route-plan-tabs" aria-label="推荐路线">
          {routes.map((route) => (
            <button
              key={route.id}
              type="button"
              className={route.id === activeRoute.id ? "active" : ""}
              onClick={() => onRouteChange(route.id)}
              aria-pressed={route.id === activeRoute.id}
            >
              <Route size={15} aria-hidden="true" />
              <span>
                <strong>{route.name}</strong>
                <small>{route.duration}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="route-stop-head">
          <strong>景点顺序</strong>
          <span>{activeRoute.stops.length} 站 · 完整展示</span>
        </div>
        <ol className="route-stop-list">
          {activeRoute.stops.map((stop, index) => (
            <li key={stop}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <span className="route-stop-copy">
                <strong>{stop}</strong>
                <small>{getRouteStopNote(stop)}</small>
              </span>
              <div className="route-stop-actions">
                <button
                  type="button"
                  onClick={() => onOpenMapDestination?.(stop)}
                  aria-label={`在地图中查看${stop}`}
                  title="地图定位"
                >
                  <MapPin size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onAskRouteStop?.(stop)}
                  aria-label={`向数字人询问${stop}`}
                  title="咨询数字人"
                >
                  <MessageCircleQuestion size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>

      </aside>
    </section>
  );
}

function formatRouteDistance(distance: number) {
  if (distance < 1000) {
    return `${Math.max(0, Math.round(distance))} 米`;
  }
  return `${(distance / 1000).toFixed(1)} 公里`;
}

function formatRouteDuration(duration: number) {
  return `${Math.max(1, Math.round(duration / 60))} 分钟`;
}

function simplifyRouteInstruction(instruction: string) {
  return instruction
    .replace(/步行\s*\d+\s*米/g, "前行")
    .replace(/\d+\s*米/g, "")
    .replace(/\s+/g, " ")
    .replace(/前行后/g, "前行后")
    .trim();
}

function buildRouteHighlights(
  steps: WalkingRouteStep[],
  summary: WalkingRouteSummary | null,
  maxHighlights = 5,
) {
  if (steps.length === 0) {
    return [];
  }
  const highlightCount = Math.min(maxHighlights, steps.length);
  return Array.from({ length: highlightCount }, (_, index) => {
    const startIndex = Math.floor((index * steps.length) / highlightCount);
    const endIndex = Math.max(startIndex + 1, Math.floor(((index + 1) * steps.length) / highlightCount));
    const group = steps.slice(startIndex, endIndex);
    const representative = group[Math.floor(group.length / 2)] ?? group[0];
    const distance = group.reduce((total, step) => total + step.distance, 0);
    const duration = group.reduce((total, step) => total + step.duration, 0);
    const startName = summary?.start.replace("灵山胜境-", "") ?? "起点";
    const endName = summary?.end.replace("灵山胜境-", "") ?? "目的地";
    const instruction = index === 0
      ? `从${startName}出发`
      : index === highlightCount - 1
        ? `抵达${endName}`
        : simplifyRouteInstruction(representative.instruction) || "沿地图路线继续前行";
    return { instruction, distance, duration };
  });
}

function AmapNavigationView({
  activeSuggestionIndex,
  activeSuggestionField,
  amapNavigationUrl,
  canPlan,
  displayMode,
  facilityCategories,
  endInputRef,
  immersive,
  isPlanning,
  isPlannerOpen,
  locationStatus,
  mapContainerRef,
  mapState,
  mapStatus,
  panelRef,
  onDisplayModeChange,
  onFacilityCategoryChange,
  onLocate,
  onPlannerOpenChange,
  onQuickDestination,
  onRetryMap,
  onRouteEndChange,
  onRoutePlan,
  onRouteStartChange,
  onSuggestionBlur,
  onSuggestionFocus,
  onSuggestionKeyDown,
  onSuggestionSelect,
  onSwapRoutePoints,
  routeEnd,
  routeEndSuggestions,
  routePanelRef,
  routePlanStatus,
  routeStart,
  routeStartSuggestions,
  routeSteps,
  routeSummary,
  quickDestinations,
  selectedFacilityCategory,
  selectedFacilityCount,
  startInputRef,
  suggestionStatus,
}: {
  activeSuggestionIndex: number;
  activeSuggestionField: "start" | "end" | null;
  amapNavigationUrl: string;
  canPlan: boolean;
  displayMode: AmapDisplayMode;
  facilityCategories: FacilityCategory[];
  endInputRef: RefObject<HTMLInputElement | null>;
  immersive: boolean;
  isPlanning: boolean;
  isPlannerOpen: boolean;
  locationStatus: string;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapState: MapLoadState;
  mapStatus: string;
  panelRef: RefObject<HTMLElement | null>;
  onDisplayModeChange: (mode: AmapDisplayMode) => void;
  onFacilityCategoryChange: (categoryId: string) => void;
  onLocate: () => void;
  onPlannerOpenChange: (isOpen: boolean) => void;
  onQuickDestination: (tip: AMapTip) => void;
  onRetryMap: () => void;
  onRouteEndChange: (value: string) => void;
  onRoutePlan: () => void;
  onRouteStartChange: (value: string) => void;
  onSuggestionBlur: () => void;
  onSuggestionFocus: (field: "start" | "end") => void;
  onSuggestionKeyDown: (field: "start" | "end", event: KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionSelect: (field: "start" | "end", tip: AMapTip) => void;
  onSwapRoutePoints: () => void;
  routeEnd: string;
  routeEndSuggestions: AMapTip[];
  routePanelRef: RefObject<HTMLDivElement | null>;
  routePlanStatus: string;
  routeStart: string;
  routeStartSuggestions: AMapTip[];
  routeSteps: WalkingRouteStep[];
  routeSummary: WalkingRouteSummary | null;
  quickDestinations: AMapTip[];
  selectedFacilityCategory: FacilityCategory | null;
  selectedFacilityCount: number;
  startInputRef: RefObject<HTMLInputElement | null>;
  suggestionStatus: string;
}) {
  const displayModes: Array<{ id: AmapDisplayMode; label: string }> = [
    { id: "standard", label: "标准" },
    { id: "satellite", label: "卫星" },
    { id: "three", label: "3D" },
    { id: "street", label: "卫星倾斜" },
  ];
  const providerLabel =
    mapState === "ready"
      ? "高德地图可用"
      : mapState === "error"
        ? "高德地图暂不可用"
        : "正在连接高德地图";
  const routeHighlights = buildRouteHighlights(routeSteps, routeSummary);

  function renderSuggestions(field: "start" | "end", suggestions: AMapTip[]) {
    if (activeSuggestionField !== field || suggestions.length === 0) {
      return null;
    }
    const listId = `amap-${field}-suggestions`;
    return (
      <div id={listId} className="amap-suggestions" role="listbox" aria-label={`${field === "start" ? "起点" : "终点"}地点候选`}>
        {suggestions.map((tip, index) => (
          <button
            id={`${listId}-${index}`}
            key={`${tip.id || tip.name || field}-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeSuggestionIndex}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSuggestionSelect(field, tip)}
          >
            <MapPin size={15} aria-hidden="true" />
            <span>
              <strong>{tip.name}</strong>
              <small>{getTipDetail(tip) || "高德地点候选"}</small>
            </span>
          </button>
        ))}
      </div>
    );
  }

  function handleFieldBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      onSuggestionBlur();
    }
  }

  return (
    <section
      ref={panelRef}
      className={`scenic-map-panel amap-product-panel${immersive ? " is-immersive" : ""}`}
      aria-label="高德地图步行路线规划"
    >
      <div className="scenic-map-head amap-product-head">
        <div>
          <p className="eyebrow">AMAP · LINGSHAN</p>
          <h3>灵山景区步行路线规划</h3>
          <span>选目的地、看路线总览，需要持续导航时交接高德地图</span>
        </div>
        <div className={`amap-provider-badge ${mapState}`}>
          <span className="provider-pulse" aria-hidden="true" />
          {providerLabel}
        </div>
      </div>

      <div className="amap-product-shell">
        <aside
          className={`amap-route-planner${isPlannerOpen ? " is-open" : ""}${routeSummary ? " has-route" : ""}`}
          aria-label="路线规划器"
          aria-hidden={immersive && !isPlannerOpen}
          inert={immersive && !isPlannerOpen}
        >
          <div className="planner-mode-row">
            <span><Footprints size={16} aria-hidden="true" /> 景区步行</span>
            <div className="planner-mode-actions">
              <em><Sparkles size={13} aria-hidden="true" /> 推荐方式</em>
              {immersive ? (
                <button
                  type="button"
                  className="planner-close-button"
                  onClick={() => onPlannerOpenChange(false)}
                  aria-label="收起路线规划"
                  title="收起路线规划"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <form
            className="amap-route-form product-route-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRoutePlan();
            }}
          >
            <div className="route-point-stack">
              <div className="amap-search-field start-point-field" onBlur={handleFieldBlur}>
                <label htmlFor="amap-route-start">从</label>
                <input
                  id="amap-route-start"
                  ref={startInputRef}
                  type="text"
                  value={routeStart}
                  onChange={(event) => onRouteStartChange(event.target.value)}
                  onFocus={() => onSuggestionFocus("start")}
                  onKeyDown={(event) => onSuggestionKeyDown("start", event)}
                  placeholder="输入或定位起点"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={activeSuggestionField === "start" && routeStartSuggestions.length > 0}
                  aria-controls="amap-start-suggestions"
                  aria-activedescendant={
                    activeSuggestionField === "start" && routeStartSuggestions.length > 0
                      ? `amap-start-suggestions-${activeSuggestionIndex}`
                      : undefined
                  }
                />
                {renderSuggestions("start", routeStartSuggestions)}
              </div>

              <button
                type="button"
                className="route-swap-button"
                onClick={onSwapRoutePoints}
                aria-label="交换起点和终点"
              >
                <ArrowDownUp size={16} aria-hidden="true" />
              </button>

              <div className="amap-search-field end-point-field" onBlur={handleFieldBlur}>
                <label htmlFor="amap-route-end">到</label>
                <input
                  id="amap-route-end"
                  ref={endInputRef}
                  type="text"
                  value={routeEnd}
                  onChange={(event) => onRouteEndChange(event.target.value)}
                  onFocus={() => onSuggestionFocus("end")}
                  onKeyDown={(event) => onSuggestionKeyDown("end", event)}
                  placeholder="搜索景点或服务设施"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={activeSuggestionField === "end" && routeEndSuggestions.length > 0}
                  aria-controls="amap-end-suggestions"
                  aria-activedescendant={
                    activeSuggestionField === "end" && routeEndSuggestions.length > 0
                      ? `amap-end-suggestions-${activeSuggestionIndex}`
                      : undefined
                  }
                />
                {renderSuggestions("end", routeEndSuggestions)}
              </div>
            </div>

            <div className="quick-destination-block">
              <span>热门目的地</span>
              <div className="quick-destination-list">
                {quickDestinations.map((tip) => (
                  <button
                    key={tip.id}
                    type="button"
                    className={routeEnd === tip.name ? "active" : ""}
                    onClick={() => onQuickDestination(tip)}
                    aria-pressed={routeEnd === tip.name}
                  >
                    {tip.name?.replace("灵山胜境-", "")}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="primary-action route-plan-button" disabled={!canPlan || isPlanning}>
              <Navigation size={17} className={isPlanning ? "spin" : ""} aria-hidden="true" />
              {isPlanning ? "正在规划" : "生成步行路线"}
            </button>
          </form>

          <section className="route-overview-card" aria-label="路线总览">
            {routeSummary ? (
              <>
                <div className="route-overview-head">
                  <div>
                    <span>预计步行</span>
                    <strong>{formatRouteDuration(routeSummary.duration)}</strong>
                  </div>
                  <b>{formatRouteDistance(routeSummary.distance)}</b>
                </div>
                <div className="route-overview-points">
                  <span>{routeSummary.start}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                  <span>{routeSummary.end}</span>
                </div>
                {amapNavigationUrl ? (
                  <a
                    className="amap-handoff-link"
                    href={amapNavigationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={14} aria-hidden="true" />
                    在高德地图中继续导航
                  </a>
                ) : null}
                <small className="route-safety-note">路线仅供步行参考，以景区现场开放区域和指示为准。</small>
              </>
            ) : (
              <div className="route-overview-empty">
                <Route size={20} aria-hidden="true" />
                <div>
                  <strong>一键查看路线总览</strong>
                  <span>{routePlanStatus}</span>
                </div>
              </div>
            )}
          </section>

          <section className="product-route-steps" aria-label="步行路线步骤">
            <div className="route-step-head">
              <div>
                <strong>关键引导</strong>
                <small>跟随地图路线即可，无需记忆全部转向</small>
              </div>
              <span>{routeHighlights.length > 0 ? `${routeHighlights.length} 个关键点` : "等待规划"}</span>
            </div>
            <div ref={routePanelRef} className="amap-route-result">
              {routeHighlights.length > 0 ? (
                <ol>
                  {routeHighlights.map((step, index) => (
                    <li key={`${step.instruction}-${index}`}>
                      <i>{index + 1}</i>
                      <div>
                        <span>{step.instruction}</span>
                        <small>
                          {step.distance > 0 ? `${step.distance} 米` : "继续步行"}
                          {step.duration > 0 ? ` · ${formatRouteDuration(step.duration)}` : ""}
                        </small>
                      </div>
                      <ChevronRight size={14} aria-hidden="true" />
                    </li>
                  ))}
                </ol>
              ) : (
                <p>路线生成后，将在这里按顺序展示高德步行指引。</p>
              )}
            </div>
          </section>
        </aside>

        <section className="amap-map-stage" aria-label="高德实时地图">
          <div ref={mapContainerRef} className="amap-container" />

          {immersive && !isPlannerOpen ? (
            <button
              type="button"
              className="map-planner-open-button"
              onClick={() => onPlannerOpenChange(true)}
              aria-label="打开路线规划"
            >
              <PanelLeftOpen size={18} aria-hidden="true" />
              路线规划
            </button>
          ) : null}

          {mapState !== "ready" ? (
            <div className={`map-load-panel ${mapState}`} role={mapState === "error" ? "alert" : "status"}>
              <div className="map-load-icon">
                <Layers3 size={23} className={mapState === "loading" ? "spin" : ""} aria-hidden="true" />
              </div>
              <strong>{providerLabel}</strong>
              <span>{mapStatus}</span>
              {mapState === "error" ? (
                <button type="button" onClick={onRetryMap}>重新连接地图</button>
              ) : null}
            </div>
          ) : null}

          <div className="map-layer-control" aria-label="地图图层">
            <Layers3 size={16} aria-hidden="true" />
            {displayModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={mode.id === displayMode ? "active" : ""}
                onClick={() => onDisplayModeChange(mode.id)}
                aria-pressed={mode.id === displayMode}
                disabled={mapState !== "ready"}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <button type="button" className="map-locate-control" onClick={onLocate} disabled={mapState !== "ready"}>
            <LocateFixed size={18} aria-hidden="true" />
            定位并设为起点
          </button>

          <section className="facility-map-control" aria-label="景区设施筛选">
            <div>
              <strong>景区设施</strong>
              <span>{selectedFacilityCategory ? `${selectedFacilityCount} 个${selectedFacilityCategory.title}` : "选择类别查看点位"}</span>
            </div>
            <button
              type="button"
              className={!selectedFacilityCategory ? "active" : ""}
              onClick={() => onFacilityCategoryChange("")}
              aria-pressed={!selectedFacilityCategory}
            >
              全部隐藏
            </button>
            {facilityCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={selectedFacilityCategory?.id === category.id ? "active" : ""}
                onClick={() => onFacilityCategoryChange(category.id)}
                aria-pressed={selectedFacilityCategory?.id === category.id}
              >
                {category.title}
              </button>
            ))}
          </section>

          <div className="map-route-status" role="status" aria-live="polite">
            <div className="map-route-status-icon"><Navigation size={17} aria-hidden="true" /></div>
            <div>
              <strong>{routePlanStatus}</strong>
              <span><Clock3 size={12} aria-hidden="true" /> {locationStatus} · {mapStatus}</span>
            </div>
          </div>

          <p className="map-suggestion-status">{suggestionStatus}</p>
        </section>
      </div>
    </section>
  );
}
