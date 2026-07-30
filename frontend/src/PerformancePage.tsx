import { useEffect, useState } from "react";
import { CalendarClock, Clock3, MapPin, MessageCircleQuestion } from "lucide-react";
import jiulongImage from "./assets/performance-jiulong.jpg";
import fangongImage from "./assets/performance-fangong.jpg";
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
  image: string;
  imageAlt: string;
  sourceUrl: string;
  sourceLabel: string;
  validFrom: string;
  validUntil: string;
  schedules: PerformanceSchedule[];
};

const defaultPerformanceItems: PerformanceConfig[] = [
  {
    id: "jiulong",
    title: "九龙灌浴",
    subtitle: "大型音乐动态群雕",
    location: "九龙灌浴广场",
    mapDestination: "九龙灌浴",
    description: "莲花开启、太子像升起并接受九龙喷水沐浴，适合在景区中轴游览时安排观看。",
    arrivalNotice: "建议提前 10 分钟到达观演区",
    image: jiulongImage,
    imageAlt: "灵山胜境九龙灌浴景观",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:%E4%B9%9D%E9%BE%99%E7%81%8C%E6%B5%B4_-_panoramio.jpg",
    sourceLabel: "gdczjkk · CC BY 3.0",
    validFrom: "2026-07-02T00:00:00+08:00",
    validUntil: "2026-07-31T23:59:59+08:00",
    schedules: [
      { label: "周一至周五", times: ["10:00", "11:30", "14:45", "16:45"] },
      { label: "周六、周日", times: ["10:00", "11:30", "13:00", "14:45", "16:45"] },
    ],
  },
  {
    id: "fangong",
    title: "梵宫文化体验之旅",
    subtitle: "建筑艺术与沉浸式文化体验",
    location: "灵山梵宫",
    mapDestination: "梵宫",
    description: "在梵宫空间中感受木雕、琉璃与穹顶艺术，具体开放区域请遵循现场工作人员指引。",
    arrivalNotice: "建议提前 30 分钟到场排队",
    image: fangongImage,
    imageAlt: "灵山梵宫内部穹顶与飞天艺术",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:2021%E5%B9%B43%E6%9C%88_%E6%97%A0%E9%94%A1%E7%81%B5%E5%B1%B1%E5%A4%A7%E4%BD%9B_33_%E6%A2%B5%E5%AE%AB.jpg",
    sourceLabel: "Walter Grassroot · CC BY-SA 4.0",
    validFrom: "2026-07-02T00:00:00+08:00",
    validUntil: "2026-07-31T23:59:59+08:00",
    schedules: [
      { label: "每日", times: ["10:00", "11:00", "12:00", "13:30", "14:30", "15:30"] },
    ],
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
            validUntil: item.valid_until,
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
              <div className="performance-visual">
                <img src={item.image} alt={item.imageAlt} />
                <div className="performance-visual-shade" />
                <div className="performance-title-block">
                  <span>{item.subtitle}</span>
                  <h2>{item.title}</h2>
                  <p><MapPin size={14} aria-hidden="true" /> {item.location}</p>
                </div>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="performance-image-source">
                  图源：{item.sourceLabel}
                </a>
              </div>

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
