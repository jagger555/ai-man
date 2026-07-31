import { useEffect, useState } from "react";
import { CalendarClock, Clock3, MapPin, MessageCircleQuestion } from "lucide-react";
import jiulongImage from "./assets/performance-jiulong.jpg";
import jiulongGallery1 from "./assets/jiulong-gallery-1.jpg";
import jiulongGallery2 from "./assets/jiulong-gallery-2.jpg";
import jiulongGallery3 from "./assets/jiulong-gallery-3.jpg";
import fangongImage from "./assets/performance-fangong.jpg";
import fangongGallery1 from "./assets/fangong-gallery-1.jpg";
import fangongGallery2 from "./assets/fangong-gallery-2.jpg";
import fangongGallery3 from "./assets/fangong-gallery-3.jpg";
import { getPerformanceScheduleState } from "./performanceSchedule";

type PerformanceSchedule = {
  label: string;
  times: string[];
};

type PerformanceConfig = {
  id: string;
  title: string;
  subtitle: string;
  location: string;
  mapDestination: string;
  description: string;
  arrivalNotice: string;
  gallery: string[];
  imageAlt: string;
  validFrom: string;
  validUntil: string;
  schedules: PerformanceSchedule[];
  highlights: string[];
};

const EXTENDED_PERFORMANCE_VALID_UNTIL = "2026-08-31T23:59:59+08:00";

const defaultPerformanceItems: PerformanceConfig[] = [
  {
    id: "jiulong",
    title: "九龙灌浴",
    subtitle: "大型音乐动态群雕",
    location: "九龙灌浴广场",
    mapDestination: "九龙灌浴",
    description: "莲花开启、太子像升起并接受九龙喷水沐浴，适合在景区中轴游览时安排观看。",
    arrivalNotice: "建议提前 10 分钟到达观演区",
    gallery: [jiulongImage, jiulongGallery1, jiulongGallery2, jiulongGallery3],
    imageAlt: "灵山胜境九龙灌浴景观",
    validFrom: "2026-07-02T00:00:00+08:00",
    validUntil: EXTENDED_PERFORMANCE_VALID_UNTIL,
    schedules: [
      { label: "周一至周五", times: ["10:00", "11:30", "14:45", "16:45"] },
      { label: "周六、周日", times: ["10:00", "11:30", "13:00", "14:45", "16:45"] },
    ],
    highlights: ["建议在中轴游览时段安排观看", "提前到场可避开临近开演的人流", "观看期间请以现场围栏与引导为准"],
  },
  {
    id: "fangong",
    title: "梵宫文化体验之旅",
    subtitle: "建筑艺术与沉浸式文化体验",
    location: "灵山梵宫",
    mapDestination: "梵宫",
    description: "在梵宫空间中感受木雕、琉璃与穹顶艺术，具体开放区域请遵循现场工作人员指引。",
    arrivalNotice: "建议提前 30 分钟到场排队",
    gallery: [fangongImage, fangongGallery1, fangongGallery2, fangongGallery3],
    imageAlt: "灵山梵宫内部穹顶与飞天艺术",
    validFrom: "2026-07-02T00:00:00+08:00",
    validUntil: EXTENDED_PERFORMANCE_VALID_UNTIL,
    schedules: [
      { label: "每日", times: ["10:00", "11:00", "12:00", "13:30", "14:30", "15:30"] },
    ],
    highlights: ["可结合建筑空间与艺术细节慢游", "具体开放区域请留意现场提示", "建议预留步行与到场缓冲时间"],
  },
];

function formatValidPeriod(validFrom: string, validUntil: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  return `${formatter.format(new Date(validFrom))}—${formatter.format(new Date(validUntil))}`;
}

function normalizePerformanceValidity(validUntil: string) {
  return validUntil.startsWith("2026-07-31") ? EXTENDED_PERFORMANCE_VALID_UNTIL : validUntil;
}

function PerformanceGallery({ item }: { item: PerformanceConfig }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % item.gallery.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [item.gallery.length]);

  const activeImage = item.gallery[activeIndex] ?? item.gallery[0];
  return (
    <div className="performance-visual">
      <img src={activeImage} alt={item.imageAlt} />
      <div className="performance-visual-shade" />
      <div className="performance-title-block">
        <span>{item.subtitle}</span>
        <h2>{item.title}</h2>
        <p><MapPin size={14} aria-hidden="true" /> {item.location}</p>
      </div>
      <div className="performance-gallery-tabs" aria-label={`${item.title}图集`}>
        {item.gallery.map((image, index) => (
          <button
            key={image}
            type="button"
            className={index === activeIndex ? "active" : ""}
            onClick={() => setActiveIndex(index)}
            aria-label={`查看${item.title}第 ${index + 1} 张图片`}
            aria-pressed={index === activeIndex}
          >
            <img src={image} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PerformancePage({
  onAskPerformance,
  onOpenMap,
}: {
  onAskPerformance: (title: string) => void;
  onOpenMap: (destination: string) => void;
}) {
  const [performanceItems, setPerformanceItems] = useState(defaultPerformanceItems);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/scenic/content", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((payload: {
        items?: {
          performance?: Array<{
            id: string;
            title: string;
            subtitle: string;
            location: string;
            map_destination: string;
            description: string;
            arrival_notice: string;
            valid_from: string;
            valid_until: string;
            schedules: PerformanceSchedule[];
            enabled: boolean;
          }>;
        };
      }) => {
        if (!payload.items?.performance) return;
        const mapped = payload.items.performance.filter((item) => item.enabled).flatMap((item) => {
          const media = defaultPerformanceItems.find((candidate) => candidate.id === item.id);
          return media ? [{
            ...media,
            title: item.title,
            subtitle: item.subtitle,
            location: item.location,
            mapDestination: item.map_destination,
            description: item.description,
            arrivalNotice: item.arrival_notice,
            validFrom: item.valid_from,
            validUntil: normalizePerformanceValidity(item.valid_until),
            schedules: item.schedules,
          }] : [];
        });
        setPerformanceItems(mapped);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <section className="performance-page" aria-label="灵山演出时间与文化体验">
      <header className="performance-page-head">
        <div>
          <p className="eyebrow">PERFORMANCE · LINGSHAN</p>
          <h1>今日演出与文化体验</h1>
        </div>
        <p><CalendarClock size={15} aria-hidden="true" /> 具体安排可能因天气、客流或运营调整，请以景区当日公告为准。</p>
      </header>

      <div className="performance-card-grid">
        {performanceItems.map((item) => {
          const scheduleState = getPerformanceScheduleState(item.validFrom, item.validUntil);
          return (
            <article key={item.id} className={`performance-card is-${item.id} is-${scheduleState}`}>
              <PerformanceGallery item={item} />

              <div className="performance-detail">
                <p className="performance-description">{item.description}</p>
                <div className="performance-validity">
                  <span>{scheduleState === "active" ? "场次有效" : scheduleState === "upcoming" ? "尚未生效" : "场次已到期"}</span>
                  <small>{formatValidPeriod(item.validFrom, item.validUntil)}</small>
                </div>

                {scheduleState === "active" ? (
                  <div className="performance-schedule" aria-label={`${item.title}场次`}>
                    {item.schedules.map((schedule) => (
                      <div key={schedule.label}>
                        <strong>{schedule.label}</strong>
                        <span>{schedule.times.map((time) => <i key={time}>{time}</i>)}</span>
                      </div>
                    ))}
                    <div className="performance-highlights" aria-label={`${item.title}游览提示`}>
                      <strong>观演提示</strong>
                      <ul>{item.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                    </div>
                  </div>
                ) : (
                  <div className="performance-expired-notice" role="status">
                    <Clock3 size={18} aria-hidden="true" />
                    <strong>具体场次以景区当日公告为准</strong>
                  </div>
                )}

                <div className="performance-card-foot">
                  <span><Clock3 size={14} aria-hidden="true" /> {item.arrivalNotice}</span>
                  <div>
                    <button type="button" onClick={() => onOpenMap(item.mapDestination)}>
                      <MapPin size={14} aria-hidden="true" /> 地图查看
                    </button>
                    <button type="button" onClick={() => onAskPerformance(item.title)}>
                      <MessageCircleQuestion size={14} aria-hidden="true" /> 咨询数字人
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {performanceItems.length === 0 ? (
          <div className="performance-expired-notice" role="status">
            <Clock3 size={18} aria-hidden="true" />
            <strong>当前演出安排以景区当日公告为准</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}
