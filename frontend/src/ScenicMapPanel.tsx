import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { LocateFixed, Navigation, Route } from "lucide-react";
import scenicMapImage from "./assets/lingshan-map.png";

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
  Walking?: new (options: Record<string, unknown>) => AMapWalking;
  AutoComplete?: new (options: Record<string, unknown>) => AMapAutoComplete;
  Geolocation?: new (options: Record<string, unknown>) => AMapGeolocation;
  TileLayer: AMapTileLayerFactory;
  Buildings: new (options?: Record<string, unknown>) => unknown;
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
type AMapWalking = {
  search: {
    (
      points: Array<{ keyword: string; city: string }>,
      callback: (status: string, result: unknown) => void,
    ): void;
    (
      origin: [number, number],
      destination: [number, number],
      callback: (status: string, result: unknown) => void,
    ): void;
  };
  clear?: () => void;
};
type AMapAutoComplete = {
  search: (
    keyword: string,
    callback: (status: string, result: { tips?: AMapTip[] } | string) => void,
  ) => void;
  on?: (event: "select", callback: (payload: { poi?: AMapTip }) => void) => void;
};
type AMapGeolocation = {
  getCurrentPosition: (callback: (status: string, result: unknown) => void) => void;
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
  stops: string[];
  notes: string[];
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

type AmapDisplayMode = "standard" | "satellite" | "three" | "street";

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
];

const scenicRoutes: ScenicRoute[] = [
  {
    id: "classic",
    name: "经典一日游",
    helper: "首次到访 / 核心景点全覆盖",
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
  },
  {
    id: "family",
    name: "亲子轻松游",
    helper: "互动拍照 / 步行压力较低",
    stops: ["检票口", "九龙灌浴", "灵山佛手", "百子戏弥勒", "梵宫", "游客中心"],
    notes: ["减少登高与长距离折返", "优先选择互动性强的点位", "适合 4 小时左右"],
  },
  {
    id: "halfday",
    name: "半日精华游",
    helper: "时间有限 / 快速看重点",
    stops: ["检票口", "九龙灌浴", "灵山大佛", "梵宫", "五印坛城", "景区出口"],
    notes: ["压缩支线停留", "优先保证大佛、梵宫、五印坛城", "适合 3-4 小时"],
  },
];

function buildNarration(route: ScenicRoute) {
  return [
    `为您推荐${route.name}。`,
    `游览顺序是：${route.stops.join("、")}。`,
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
      existingScript.addEventListener("load", () => {
        window.AMap ? resolve(window.AMap) : reject(new Error("高德地图加载失败"));
      });
      existingScript.addEventListener("error", () => reject(new Error("高德地图脚本加载失败")));
      return;
    }

    const script = document.createElement("script");
    script.id = AMAP_SCRIPT_ID;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}&plugin=AMap.Geolocation,AMap.Walking,AMap.AutoComplete`;
    script.async = true;
    script.onload = () => {
      window.AMap ? resolve(window.AMap) : reject(new Error("高德地图加载失败"));
    };
    script.onerror = () => reject(new Error("高德地图脚本加载失败"));
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

function getRouteKeyword(input: string, tip: AMapTip | null) {
  if (!tip?.name) {
    return input.trim();
  }

  return [tip.name, tip.district, tip.address]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" ");
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

export function ScenicMapPanel({
  defaultMode,
  onNarrationChange,
}: {
  defaultMode: "route_guide" | "map_guide";
  onNarrationChange?: (payload: { key: string; text: string }) => void;
}) {
  const [activeRouteId, setActiveRouteId] = useState(
    defaultMode === "map_guide" ? "halfday" : "classic",
  );
  const [displayMode, setDisplayMode] = useState<AmapDisplayMode>("standard");
  const [mapStatus, setMapStatus] = useState("正在加载高德地图...");
  const [locationStatus, setLocationStatus] = useState("可点击 GPS 定位读取浏览器当前位置。");
  const [routeStart, setRouteStart] = useState("");
  const [routeEnd, setRouteEnd] = useState("");
  const [selectedStartTip, setSelectedStartTip] = useState<AMapTip | null>(null);
  const [selectedEndTip, setSelectedEndTip] = useState<AMapTip | null>(null);
  const [startSuggestions, setStartSuggestions] = useState<AMapTip[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<AMapTip[]>([]);
  const [activeSuggestionField, setActiveSuggestionField] = useState<"start" | "end" | null>(null);
  const [routePlanStatus, setRoutePlanStatus] = useState(
    "输入起点和终点后，可在高德地图中规划步行路线。",
  );
  const [routeSteps, setRouteSteps] = useState<WalkingRouteStep[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState("输入两个字以上可查看高德地点联想。");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const routePanelRef = useRef<HTMLDivElement | null>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const walkingRef = useRef<AMapWalking | null>(null);
  const routePolylineRef = useRef<AMapOverlay | null>(null);
  const startAutoCompleteRef = useRef<AMapAutoComplete | null>(null);
  const endAutoCompleteRef = useRef<AMapAutoComplete | null>(null);
  const startSuggestionSeqRef = useRef(0);
  const endSuggestionSeqRef = useRef(0);

  const activeRoute = useMemo(
    () => scenicRoutes.find((route) => route.id === activeRouteId) ?? scenicRoutes[0],
    [activeRouteId],
  );
  useEffect(() => {
    setActiveRouteId(defaultMode === "map_guide" ? "halfday" : "classic");
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
    if (defaultMode !== "map_guide") {
      return undefined;
    }

    const keyword = routeStart.trim();
    if (selectedStartTip?.name === keyword || keyword.length < MIN_SUGGESTION_LENGTH) {
      setStartSuggestions([]);
      return undefined;
    }

    const sequence = startSuggestionSeqRef.current + 1;
    startSuggestionSeqRef.current = sequence;
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
          input: startInputRef.current ?? undefined,
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
        const tips = getLocalSuggestions(keyword);
        setStartSuggestions(tips);
        setSuggestionStatus(tips.length > 0 ? "已显示景区内常用地点候选。" : "地点联想组件加载失败，请稍后重试。");
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [defaultMode, routeStart, selectedStartTip]);

  useEffect(() => {
    if (defaultMode !== "map_guide") {
      return undefined;
    }

    const keyword = routeEnd.trim();
    if (selectedEndTip?.name === keyword || keyword.length < MIN_SUGGESTION_LENGTH) {
      setEndSuggestions([]);
      return undefined;
    }

    const sequence = endSuggestionSeqRef.current + 1;
    endSuggestionSeqRef.current = sequence;
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
          input: endInputRef.current ?? undefined,
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
        const tips = getLocalSuggestions(keyword);
        setEndSuggestions(tips);
        setSuggestionStatus(tips.length > 0 ? "已显示景区内常用地点候选。" : "地点联想组件加载失败，请稍后重试。");
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [defaultMode, routeEnd, selectedEndTip]);

  useEffect(() => {
    if (defaultMode !== "map_guide") {
      return undefined;
    }

    let disposed = false;
    async function bindInputAutocomplete() {
      try {
        const AMap = await loadAmapScript();
        await loadAmapPlugin("AMap.AutoComplete");
        if (disposed || !AMap.AutoComplete) {
          return;
        }

        if (!startAutoCompleteRef.current && startInputRef.current) {
          const startAutoComplete = new AMap.AutoComplete({
            city: ROUTE_CITY,
            citylimit: false,
            input: startInputRef.current,
          });
          startAutoComplete.on?.("select", ({ poi }) => {
            if (poi?.name) {
              selectRouteSuggestion("start", poi);
            }
          });
          startAutoCompleteRef.current = startAutoComplete;
        }

        if (!endAutoCompleteRef.current && endInputRef.current) {
          const endAutoComplete = new AMap.AutoComplete({
            city: ROUTE_CITY,
            citylimit: false,
            input: endInputRef.current,
          });
          endAutoComplete.on?.("select", ({ poi }) => {
            if (poi?.name) {
              selectRouteSuggestion("end", poi);
            }
          });
          endAutoCompleteRef.current = endAutoComplete;
        }
      } catch {
        setSuggestionStatus("地点联想组件加载失败，请稍后重试。");
      }
    }

    void bindInputAutocomplete();
    return () => {
      disposed = true;
    };
  }, [defaultMode]);

  useEffect(() => {
    let disposed = false;
    if (defaultMode !== "map_guide") {
      return undefined;
    }

    async function initMap() {
      try {
        const AMap = await loadAmapScript();
        if (disposed || !mapContainerRef.current) {
          return;
        }

        const map = new AMap.Map(mapContainerRef.current, {
          center: LINGSHAN_CENTER,
          zoom: 15,
          viewMode: "2D",
          resizeEnable: true,
        });
        mapRef.current = map;

        setMapStatus("高德地图已加载，可拖拽缩放并切换地图类型。");
      } catch (error) {
        setMapStatus(error instanceof Error ? error.message : "高德地图加载失败");
      }
    }

    void initMap();
    return () => {
      disposed = true;
      walkingRef.current?.clear?.();
      walkingRef.current = null;
      if (routePolylineRef.current && mapRef.current) {
        mapRef.current.remove(routePolylineRef.current);
      }
      routePolylineRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [defaultMode]);

  function locateWithAmap() {
    const AMap = window.AMap;
    if (!AMap?.Geolocation || !mapRef.current) {
      setLocationStatus("定位组件尚未加载完成。");
      return;
    }

    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 8000,
      zoomToAccuracy: true,
    });
    mapRef.current.addControl(geolocation);
    setLocationStatus("正在通过高德地图读取当前位置...");
    geolocation.getCurrentPosition((status) => {
      setLocationStatus(
        status === "complete"
          ? "已读取当前位置，并在高德地图中定位。"
          : "无法读取当前位置，请检查浏览器定位权限。",
      );
    });
  }

  function handleRouteStartChange(value: string) {
    setRouteStart(value);
    setSelectedStartTip(null);
    setActiveSuggestionField("start");
  }

  function handleRouteEndChange(value: string) {
    setRouteEnd(value);
    setSelectedEndTip(null);
    setActiveSuggestionField("end");
  }

  function selectRouteSuggestion(field: "start" | "end", tip: AMapTip) {
    const name = tip.name?.trim();
    if (!name) {
      return;
    }

    if (field === "start") {
      setRouteStart(name);
      setSelectedStartTip(tip);
      setStartSuggestions([]);
      setSuggestionStatus(`已选择起点：${name}`);
    } else {
      setRouteEnd(name);
      setSelectedEndTip(tip);
      setEndSuggestions([]);
      setSuggestionStatus(`已选择终点：${name}`);
    }
    setActiveSuggestionField(null);
  }

  async function planWalkingRoute() {
    const startTip = selectedStartTip ?? findLocalTip(routeStart);
    const endTip = selectedEndTip ?? findLocalTip(routeEnd);
    const startKeyword = getRouteKeyword(routeStart, startTip);
    const endKeyword = getRouteKeyword(routeEnd, endTip);
    if (!startKeyword || !endKeyword) {
      setRoutePlanStatus("请先输入起点和终点。");
      return;
    }

    if (!mapRef.current) {
      setRoutePlanStatus("地图尚未加载完成，请稍后再试。");
      return;
    }

    try {
      walkingRef.current?.clear?.();
      walkingRef.current = null;
      if (routePolylineRef.current) {
        mapRef.current.remove(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      setRouteSteps([]);
      setRoutePlanStatus(`正在规划：${startKeyword} → ${endKeyword}`);
      const startCoordinate = getTipCoordinate(startTip);
      const endCoordinate = getTipCoordinate(endTip);
      if (startCoordinate && endCoordinate) {
        const AMap = await loadAmapScript();
        const response = await fetch("/api/navigation/walking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { lng: startCoordinate[0], lat: startCoordinate[1] },
            destination: { lng: endCoordinate[0], lat: endCoordinate[1] },
          }),
        });
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(errorPayload?.detail || "路线服务暂时不可用");
        }

        const route = (await response.json()) as WalkingRouteResponse;
        if (!Array.isArray(route.polyline) || route.polyline.length < 2) {
          throw new Error("高德未返回可绘制的步行路线");
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
        mapRef.current.add(polyline);
        mapRef.current.setFitView([polyline], false, [56, 56, 56, 56], 17);
        routePolylineRef.current = polyline;
        setRouteSteps(route.steps ?? []);
        const minutes = Math.max(1, Math.round((route.duration || 0) / 60));
        setRoutePlanStatus(
          `已规划：${routeStart.trim()} → ${routeEnd.trim()}，约 ${route.distance} 米 / ${minutes} 分钟。`,
        );
        return;
      }

      const AMap = await loadAmapPlugin("AMap.Walking");
      if (!AMap.Walking || !mapRef.current) {
        setRoutePlanStatus("步行路线规划组件尚未加载完成。");
        return;
      }
      walkingRef.current = new AMap.Walking({
        map: mapRef.current,
        panel: routePanelRef.current ?? undefined,
      });
      const handleRouteResult = (status: string, result: unknown) => {
        if (status === "complete") {
          setRoutePlanStatus(`已规划：${routeStart.trim()} → ${routeEnd.trim()}`);
          return;
        }

        const info =
          typeof result === "string"
            ? result
            : typeof result === "object" && result && "info" in result
              ? String((result as { info?: unknown }).info ?? "")
              : "";
        setRoutePlanStatus(
          `路线规划失败${info ? `（${info}）` : ""}，请从地点候选中选择准确地点后重试。`,
        );
      };
      walkingRef.current.search(
        [
          { keyword: startKeyword, city: startTip?.adcode || ROUTE_CITY },
          { keyword: endKeyword, city: endTip?.adcode || ROUTE_CITY },
        ],
        handleRouteResult,
      );
    } catch (error) {
      setRoutePlanStatus(error instanceof Error ? error.message : "路线规划组件加载失败");
    }
  }

  if (defaultMode === "route_guide") {
    return (
      <RouteGuideView
        activeRoute={activeRoute}
        onRouteChange={setActiveRouteId}
      />
    );
  }

  function applyDisplayMode(nextMode: AmapDisplayMode) {
    setDisplayMode(nextMode);
    const AMap = window.AMap;
    const map = mapRef.current;
    if (!AMap || !map) {
      return;
    }

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
    setMapStatus("高德 JS API 2.0 不提供独立街景图层；当前使用卫星实景 + 3D 倾斜视角模拟实景查看。");
  }

  return (
    <AmapNavigationView
      displayMode={displayMode}
      locationStatus={locationStatus}
      mapContainerRef={mapContainerRef}
      mapStatus={mapStatus}
      activeSuggestionField={activeSuggestionField}
      routeEnd={routeEnd}
      routeEndSuggestions={endSuggestions}
      routePanelRef={routePanelRef}
      routePlanStatus={routePlanStatus}
      routeSteps={routeSteps}
      routeStart={routeStart}
      routeStartSuggestions={startSuggestions}
      endInputRef={endInputRef}
      startInputRef={startInputRef}
      suggestionStatus={suggestionStatus}
      onDisplayModeChange={applyDisplayMode}
      onLocate={locateWithAmap}
      onRouteEndChange={handleRouteEndChange}
      onRoutePlan={planWalkingRoute}
      onRouteStartChange={handleRouteStartChange}
      onSuggestionBlur={() => window.setTimeout(() => setActiveSuggestionField(null), 160)}
      onSuggestionFocus={setActiveSuggestionField}
      onSuggestionSelect={selectRouteSuggestion}
    />
  );
}

function RouteGuideView({
  activeRoute,
  onRouteChange,
}: {
  activeRoute: ScenicRoute;
  onRouteChange: (routeId: string) => void;
}) {
  return (
    <section className="scenic-map-panel" aria-label="景区地图与路线规划">
      <div className="scenic-map-head">
        <div>
          <p className="eyebrow">SCENIC MAP</p>
          <h3>游览路线方案</h3>
          <span>{activeRoute.helper}</span>
        </div>
      </div>

      <div className="route-tabs" aria-label="推荐路线">
        {scenicRoutes.map((route) => (
          <button
            key={route.id}
            type="button"
            className={route.id === activeRoute.id ? "active" : ""}
            onClick={() => onRouteChange(route.id)}
          >
            <Route size={16} aria-hidden="true" />
            <span>{route.name}</span>
          </button>
        ))}
      </div>

      <div className="map-display-grid route-guide-map-grid">
        <figure className="static-scenic-map route-guide-image">
          <img src={scenicMapImage} alt="灵山胜境景区导览图" />
        </figure>
        <article className="route-narration-card">
          <strong>数字人讲解稿</strong>
          <p>{buildNarration(activeRoute)}</p>
        </article>
      </div>

      <div className="map-info-grid">
        <article className="route-summary-card route-text-card">
          <strong>{activeRoute.name}</strong>
          <ol>
            {activeRoute.stops.map((stop) => (
              <li key={stop}>{stop}</li>
            ))}
          </ol>
        </article>
        <article className="route-summary-card">
          <strong>讲解提示</strong>
          <ul>
            {activeRoute.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
        <article className="route-summary-card">
          <strong>数字人播报文案</strong>
          <p>{buildNarration(activeRoute)}</p>
        </article>
      </div>
    </section>
  );
}

function AmapNavigationView({
  activeSuggestionField,
  displayMode,
  locationStatus,
  mapContainerRef,
  mapStatus,
  routeEnd,
  routeEndSuggestions,
  routePanelRef,
  routePlanStatus,
  routeSteps,
  routeStart,
  routeStartSuggestions,
  endInputRef,
  startInputRef,
  suggestionStatus,
  onDisplayModeChange,
  onLocate,
  onRouteEndChange,
  onRoutePlan,
  onRouteStartChange,
  onSuggestionBlur,
  onSuggestionFocus,
  onSuggestionSelect,
}: {
  activeSuggestionField: "start" | "end" | null;
  displayMode: AmapDisplayMode;
  locationStatus: string;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapStatus: string;
  routeEnd: string;
  routeEndSuggestions: AMapTip[];
  routePanelRef: RefObject<HTMLDivElement | null>;
  routePlanStatus: string;
  routeSteps: WalkingRouteStep[];
  routeStart: string;
  routeStartSuggestions: AMapTip[];
  endInputRef: RefObject<HTMLInputElement | null>;
  startInputRef: RefObject<HTMLInputElement | null>;
  suggestionStatus: string;
  onDisplayModeChange: (mode: AmapDisplayMode) => void;
  onLocate: () => void;
  onRouteEndChange: (value: string) => void;
  onRoutePlan: () => void;
  onRouteStartChange: (value: string) => void;
  onSuggestionBlur: () => void;
  onSuggestionFocus: (field: "start" | "end") => void;
  onSuggestionSelect: (field: "start" | "end", tip: AMapTip) => void;
}) {
  const displayModes: Array<{ id: AmapDisplayMode; label: string }> = [
    { id: "standard", label: "标准图" },
    { id: "satellite", label: "卫星图" },
    { id: "three", label: "3D 图" },
    { id: "street", label: "实景模式" },
  ];

  return (
    <section className="scenic-map-panel" aria-label="高德地图导航">
      <div className="scenic-map-head">
        <div>
          <p className="eyebrow">AMAP NAVIGATION</p>
          <h3>实时地图导航</h3>
          <span>起终点路线规划、地图模式和实时 GPS</span>
        </div>
        <div className="map-head-actions">
          <button type="button" className="secondary-action" onClick={onLocate}>
            <LocateFixed size={16} aria-hidden="true" />
            GPS 定位
          </button>
        </div>
      </div>

      <div className="map-mode-tabs" aria-label="地图类型">
        {displayModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={mode.id === displayMode ? "active" : ""}
            onClick={() => onDisplayModeChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <form
        className="amap-route-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRoutePlan();
        }}
      >
        <label className="amap-search-field">
          <span>起点</span>
          <input
            ref={startInputRef}
            type="text"
            value={routeStart}
            onChange={(event) => onRouteStartChange(event.target.value)}
            onFocus={() => onSuggestionFocus("start")}
            onBlur={onSuggestionBlur}
            placeholder="输入起点，如 灵山胜境游客中心"
            autoComplete="off"
          />
          {activeSuggestionField === "start" && routeStartSuggestions.length > 0 ? (
            <div className="amap-suggestions" role="listbox">
              {routeStartSuggestions.map((tip, index) => (
                <button
                  key={`${tip.id || tip.name || "start"}-${index}`}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSuggestionSelect("start", tip)}
                >
                  <strong>{tip.name}</strong>
                  <small>{getTipDetail(tip) || "高德地点候选"}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <label className="amap-search-field">
          <span>终点</span>
          <input
            ref={endInputRef}
            type="text"
            value={routeEnd}
            onChange={(event) => onRouteEndChange(event.target.value)}
            onFocus={() => onSuggestionFocus("end")}
            onBlur={onSuggestionBlur}
            placeholder="输入终点，如 灵山大佛"
            autoComplete="off"
          />
          {activeSuggestionField === "end" && routeEndSuggestions.length > 0 ? (
            <div className="amap-suggestions" role="listbox">
              {routeEndSuggestions.map((tip, index) => (
                <button
                  key={`${tip.id || tip.name || "end"}-${index}`}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSuggestionSelect("end", tip)}
                >
                  <strong>{tip.name}</strong>
                  <small>{getTipDetail(tip) || "高德地点候选"}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <button type="submit" className="primary-action">
          <Navigation size={16} aria-hidden="true" />
          规划路径
        </button>
      </form>

      <section className="amap-card full" aria-label="高德实时地图">
        <div ref={mapContainerRef} className="amap-container" />
        <div className="amap-toolbar">
          <p>{mapStatus}</p>
          <p>{locationStatus}</p>
          <p>{routePlanStatus}</p>
          <p>{suggestionStatus}</p>
        </div>
      </section>
      <section className="amap-route-panel" aria-label="路线规划结果">
        <strong>路线详情</strong>
        <div ref={routePanelRef} className="amap-route-result">
          {routeSteps.length > 0 ? (
            <ol>
              {routeSteps.map((step, index) => (
                <li key={`${step.instruction}-${index}`}>
                  <span>{step.instruction}</span>
                  <small>{step.distance > 0 ? `${step.distance} 米` : ""}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>规划成功后，这里会显示高德返回的步行路线步骤。</p>
          )}
        </div>
      </section>
    </section>
  );
}
