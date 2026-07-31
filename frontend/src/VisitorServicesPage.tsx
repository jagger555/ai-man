import { useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  Baby,
  CircleParking,
  Cross,
  Droplets,
  Headset,
  Home,
  Info,
  Landmark,
  LocateFixed,
  MapPin,
  MessageCircleQuestion,
  ShoppingBag,
  Toilet,
  TramFront,
  TreePine,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FacilityCategory = {
  id: string;
  title: string;
  is_common: boolean;
  enabled: boolean;
};

type Facility = {
  id: string;
  title: string;
  category_id: string;
  lat: number;
  lng: number;
  enabled: boolean;
};

type VisitorLocation = {
  label: string;
  lat: number;
  lng: number;
  source: "browser" | "scenic_center";
};

type FacilityWithDistance = Facility & {
  distance: number;
};

export type VisitorServiceConsultContext = {
  categoryTitle: string;
  currentLocation: VisitorLocation;
  closestFacility: FacilityWithDistance | null;
  facilityCount: number;
};

const SCENIC_REFERENCE_LOCATION: VisitorLocation = {
  label: "景区中心参考坐标",
  lat: 31.4253,
  lng: 120.0914,
  source: "scenic_center",
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  卫生间: Toilet,
  景点: Landmark,
  出入口: MapPin,
  饮用水: Droplets,
  母婴室: Baby,
  游客服务: Headset,
  售票处: Info,
  自助设施: CircleParking,
  讲解: Headset,
  餐饮: Utensils,
  商店: ShoppingBag,
  住宿: Home,
  观光车站: TramFront,
  医务室: Cross,
  休息区: TreePine,
  吸烟处: Accessibility,
  植物: TreePine,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  卫生间: "查看景区内卫生间点位，并在地图中选择导航终点。",
  饮用水: "查找饮水补给点，按地图点位规划步行路线。",
  休息区: "查看可供短暂停留的休息区分布。",
  母婴室: "查看母婴室点位，方便亲子出行时提前规划。",
  医务室: "需要帮助时可定位医务服务点；紧急情况请优先联系现场人员。",
  游客服务: "查看咨询、游园协助等服务点分布。",
  餐饮: "查看餐饮服务点分布，具体经营以现场为准。",
  商店: "查看景区商店点位，商品与营业信息以现场为准。",
  观光车站: "查看观光车站点位置，具体运营安排以现场为准。",
};

function distanceInMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const arc = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
}

function formatDistance(distance: number) {
  return distance < 1000 ? `${distance} 米` : `${(distance / 1000).toFixed(1)} 公里`;
}

export function VisitorServicesPage({
  onFindNearest,
  onConsult,
}: {
  onFindNearest: (searchTerm: string) => void;
  onConsult: (context: VisitorServiceConsultContext) => void;
}) {
  const [categories, setCategories] = useState<FacilityCategory[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [currentLocation, setCurrentLocation] = useState<VisitorLocation>(SCENIC_REFERENCE_LOCATION);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          label: "浏览器定位坐标",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "browser",
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 120000, timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/scenic/content", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("facility content unavailable"))))
      .then((payload: { items?: { facility_category?: FacilityCategory[]; facility?: Facility[] } }) => {
        setCategories((payload.items?.facility_category ?? []).filter((item) => item.enabled));
        setFacilities((payload.items?.facility ?? []).filter((item) => item.enabled));
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const cards = useMemo(() => categories.map((category) => {
    const locations = facilities
      .filter((facility) => facility.category_id === category.id)
      .map((facility) => ({
        ...facility,
        distance: distanceInMeters(currentLocation, { lat: facility.lat, lng: facility.lng }),
      }))
      .sort((left, right) => left.distance - right.distance);
    return { category, locations, closest: locations[0] ?? null };
  }), [categories, currentLocation, facilities]);

  return (
    <section className="visitor-services-page" aria-label="灵山胜境游客服务">
      <header className="visitor-services-head">
        <div>
          <p className="eyebrow">VISITOR SERVICES · LINGSHAN</p>
          <h1>景区导览与服务，一图查找</h1>
        </div>
        <p>服务点位与地图同步。选择类别后可查看分布、距离，并将任一点设为步行导航终点。</p>
      </header>

      {loadState === "loading" ? <div className="visitor-services-loading">正在载入景区服务点位…</div> : null}
      {loadState === "error" ? <div className="visitor-services-loading is-error">服务点位暂时无法加载，请稍后重试。</div> : null}

      {loadState === "ready" ? (
        <div className="visitor-service-grid facility-service-grid">
          {cards.map(({ category, locations, closest }) => {
            const Icon = CATEGORY_ICONS[category.title] ?? MapPin;
            return (
              <article key={category.id} className={`visitor-service-card ${category.is_common ? "is-common" : ""}`}>
                <div className="visitor-service-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></div>
                <div className="visitor-service-copy">
                  <div className="visitor-service-title-row"><h2>{category.title}</h2><span>{locations.length} 处</span></div>
                  <p>{CATEGORY_DESCRIPTIONS[category.title] ?? "查看景区内实际服务点位及其分布。"}</p>
                  {closest ? <small><MapPin size={13} aria-hidden="true" /> 距景区中心约 {formatDistance(closest.distance)} · {closest.title}</small> : null}
                </div>
                <div className="visitor-service-actions">
                  <button type="button" onClick={() => onFindNearest(category.title)} disabled={locations.length === 0}>
                    <LocateFixed size={15} aria-hidden="true" /> 地图查看
                  </button>
                  <button
                    type="button"
                    onClick={() => onConsult({
                      categoryTitle: category.title,
                      currentLocation,
                      closestFacility: closest,
                      facilityCount: locations.length,
                    })}
                  >
                    <MessageCircleQuestion size={15} aria-hidden="true" /> 咨询数字人
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
