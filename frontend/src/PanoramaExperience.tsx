import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ScanLine } from "lucide-react";

const PANORAMA_URL = "https://www.720yun.com/t/1f2jrOmfkm0";

type ViewerState = "loading" | "slow" | "ready" | "error";

export function PanoramaExperience() {
  const [viewerState, setViewerState] = useState<ViewerState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (viewerState !== "loading") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setViewerState((state) => (state === "loading" ? "slow" : state));
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [reloadKey, viewerState]);

  function reloadViewer() {
    setViewerState("loading");
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="vr-panorama-page" aria-label="灵山胜境 360 度全景漫游">
      <iframe
        key={reloadKey}
        className="vr-panorama-frame"
        src={PANORAMA_URL}
        title="灵山胜境 720 云全景"
        loading="eager"
        allow="fullscreen; autoplay; accelerometer; gyroscope; xr-spatial-tracking"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setViewerState("ready")}
        onError={() => setViewerState("error")}
      />

      <nav className="vr-source-actions" aria-label="全景素材操作">
        <a href={PANORAMA_URL} target="_blank" rel="noreferrer">
          素材来源：720 云 · 听游天下
        </a>
        <a href={PANORAMA_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          打开原页面
        </a>
      </nav>

      {viewerState !== "ready" ? (
        <div
          className={`vr-panorama-state is-${viewerState}`}
          role={viewerState === "error" ? "alert" : "status"}
        >
          <ScanLine
            size={28}
            className={viewerState === "loading" ? "scan" : ""}
            aria-hidden="true"
          />
          <strong>
            {viewerState === "loading"
              ? "正在进入 360° 全景"
              : viewerState === "slow"
                ? "全景加载时间较长"
                : "全景暂时无法嵌入"}
          </strong>
          <span>
            {viewerState === "loading"
              ? "正在连接第三方全景资源。"
              : "您可以重新加载，或直接打开 720 云原页面查看。"}
          </span>
          {viewerState === "slow" || viewerState === "error" ? (
            <div>
              <button type="button" onClick={reloadViewer}>
                <RefreshCw size={14} aria-hidden="true" />
                重新加载
              </button>
              <a href={PANORAMA_URL} target="_blank" rel="noreferrer">
                打开原页面
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
