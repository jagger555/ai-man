import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  ExternalLink,
  Headphones,
  Maximize2,
  RotateCcw,
  ScanLine,
  Sparkles,
} from "lucide-react";

const PANORAMA_URL = "https://www.720yun.com/t/1f2jrOmfkm0";

type PanoramaStory = {
  id: string;
  index: string;
  title: string;
  helper: string;
  viewingTip: string;
  narration: string;
};

const PANORAMA_STORIES: PanoramaStory[] = [
  {
    id: "overview",
    index: "01",
    title: "景区全貌",
    helper: "先看空间关系",
    viewingTip: "拖动画面环视景区，再通过全景内热点继续前往代表性场景。",
    narration:
      "现在进入灵山胜境三百六十度全景。您可以拖动画面观察景区整体空间关系，并通过画面内热点继续前往其他场景。建议先辨认灵山大佛、梵宫、九龙灌浴和五印坛城的大致方位。",
  },
  {
    id: "buddha",
    index: "02",
    title: "灵山大佛",
    helper: "观察中轴与尺度",
    viewingTip: "在全景内寻找灵山大佛热点，留意台阶、中轴和周边山体形成的空间层次。",
    narration:
      "观看灵山大佛全景时，可以先从远处观察大佛与山体、中轴和礼佛广场的关系，再逐步拉近视角。大佛是灵山胜境最具辨识度的核心景观，也是理解整条游览动线的重要坐标。",
  },
  {
    id: "fangong",
    index: "03",
    title: "梵宫外景",
    helper: "看建筑体量",
    viewingTip: "点击全景内“梵宫外景”热点，横向环视建筑轮廓与入口空间。",
    narration:
      "来到梵宫外景，可以重点观察建筑体量、屋顶轮廓和入口空间。全景视角适合先建立整体印象，进入室内后再关注穹顶、壁画与传统工艺细节。",
  },
  {
    id: "jiulong",
    index: "04",
    title: "九龙灌浴",
    helper: "预判观演视角",
    viewingTip: "在全景内切换至九龙灌浴，提前观察水景、观演区和人流集散位置。",
    narration:
      "九龙灌浴是大型动态音乐景观。通过全景可以提前观察水景与观演区域的关系，现场观看时建议结合当日场次，适当提前到达并选择视野开阔的位置。",
  },
  {
    id: "wuyin",
    index: "05",
    title: "五印坛城",
    helper: "看色彩与倒影",
    viewingTip: "寻找五印坛城热点，环视建筑色彩、湖面倒影与周边步行空间。",
    narration:
      "五印坛城的全景看点在于建筑色彩、金顶轮廓与湖面倒影。拖动视角时，可以同时观察建筑立面和周边步行空间，为现场拍照和路线安排预先寻找合适角度。",
  },
];

export function PanoramaExperience({
  onNarrationChange,
}: {
  onNarrationChange?: (payload: { key: string; text: string }) => void;
}) {
  const [activeStoryId, setActiveStoryId] = useState(PANORAMA_STORIES[0].id);
  const [viewerState, setViewerState] = useState<"loading" | "slow" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [narrationVersion, setNarrationVersion] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);

  const activeStory = useMemo(
    () => PANORAMA_STORIES.find((story) => story.id === activeStoryId) ?? PANORAMA_STORIES[0],
    [activeStoryId],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    onNarrationChange?.({
      key: `panorama-${activeStory.id}-${narrationVersion}`,
      text: activeStory.narration,
    });
  }, [activeStory, narrationVersion, onNarrationChange]);

  useEffect(() => {
    if (viewerState !== "loading") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setViewerState((state) => (state === "loading" ? "slow" : state));
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [reloadKey, viewerState]);

  function selectStory(story: PanoramaStory) {
    setActiveStoryId(story.id);
    setNarrationVersion((version) => version + 1);
  }

  function reloadViewer() {
    setViewerState("loading");
    setReloadKey((key) => key + 1);
  }

  return (
    <section ref={panelRef} className="panorama-experience" aria-label="灵山胜境 360 度全景漫游">
      <header className="panorama-head">
        <div>
          <p className="eyebrow">360° PANORAMA · LINGSHAN</p>
          <h3>灵山胜境全景漫游</h3>
          <span>进入实景、查看热点，再由数字人补充当前看点</span>
        </div>
        <div className="panorama-source-badge">
          <span aria-hidden="true" />
          公开全景素材嵌入
        </div>
      </header>

      <div className="panorama-workspace">
        <section className="panorama-stage" aria-label="720 云全景画面">
          <iframe
            key={reloadKey}
            src={PANORAMA_URL}
            title="听游天下制作的灵山胜境全景导览"
            loading="eager"
            allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setViewerState("ready")}
            onError={() => setViewerState("error")}
          />

          {viewerState !== "ready" ? (
            <div className={`panorama-load-state ${viewerState}`} role={viewerState === "error" ? "alert" : "status"}>
              <ScanLine size={28} className={viewerState === "loading" ? "scan" : ""} aria-hidden="true" />
              <strong>
                {viewerState === "loading"
                  ? "正在进入 360° 实景"
                  : viewerState === "slow"
                    ? "全景加载时间较长"
                    : "全景暂时无法嵌入"}
              </strong>
              <span>
                {viewerState === "loading"
                  ? "第三方全景资源加载速度取决于当前网络。"
                  : viewerState === "slow"
                    ? "页面仍在连接中，您可以继续等待或直接打开原始作品。"
                    : "可以重新加载，或在 720 云原页面中继续查看。"}
              </span>
              {viewerState === "error" || viewerState === "slow" ? (
                <div className="panorama-load-actions">
                  <button type="button" onClick={reloadViewer}>重新加载</button>
                  <a href={PANORAMA_URL} target="_blank" rel="noreferrer">打开原始作品</a>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="panorama-stage-topline" aria-hidden="true">
            <span><Compass size={14} /> 拖动环视</span>
            <span><ScanLine size={14} /> 点击画面内热点切换场景</span>
          </div>

          <div className="panorama-stage-actions">
            <button type="button" onClick={reloadViewer} aria-label="重新加载全景">
              <RotateCcw size={16} aria-hidden="true" />
              重新加载
            </button>
            <a href={PANORAMA_URL} target="_blank" rel="noreferrer">
              <Maximize2 size={16} aria-hidden="true" />
              新窗口全屏漫游
            </a>
          </div>
        </section>

        <aside className="panorama-story-panel" aria-label="全景看点讲解">
          <div className="panorama-story-head">
            <span><Sparkles size={15} aria-hidden="true" /> 沉浸导览</span>
            <em>AI 数字人联动</em>
          </div>

          <div className="panorama-story-list">
            {PANORAMA_STORIES.map((story) => (
              <button
                key={story.id}
                type="button"
                className={story.id === activeStory.id ? "active" : ""}
                aria-pressed={story.id === activeStory.id}
                onClick={() => selectStory(story)}
              >
                <i>{story.index}</i>
                <span>
                  <strong>{story.title}</strong>
                  <small>{story.helper}</small>
                </span>
              </button>
            ))}
          </div>

          <article className="panorama-story-detail" aria-live="polite">
            <div>
              <span>当前讲解</span>
              <strong>{activeStory.title}</strong>
            </div>
            <p>{activeStory.viewingTip}</p>
            <button type="button" onClick={() => setNarrationVersion((version) => version + 1)}>
              <Headphones size={17} aria-hidden="true" />
              数字人讲解当前看点
            </button>
          </article>

          <div className="panorama-usage-note">
            <strong>使用方式</strong>
            <ol>
              <li>在左侧全景中拖动视角</li>
              <li>点击全景画面内的热点前往下一场景</li>
              <li>右侧选择看点，同步数字人讲解</li>
            </ol>
          </div>
        </aside>
      </div>

      <footer className="panorama-attribution">
        <span>全景素材来源：听游天下 · 720 云；本项目仅以第三方页面嵌入展示，不下载或重新分发素材。</span>
        <a href={PANORAMA_URL} target="_blank" rel="noreferrer">
          查看原始作品 <ExternalLink size={13} aria-hidden="true" />
        </a>
      </footer>
    </section>
  );
}
