import { bootProgress, modelDownload, removalQueue } from "../services/progress";

/** Boot loading screen (removal-pipeline-spec §5.1/§5.3): animated, live stages. */
export function LoadingScreen() {
  const progress = bootProgress.value;
  const queue = removalQueue.value;
  const download = modelDownload.value;

  const downloading = download.status === "downloading";
  const label = downloading ? "Downloading AI model (first visit)…" : progress.label;
  const detail = downloading
    ? typeof download.pct === "number"
      ? `${download.pct}% · ${download.file ?? "RMBG-1.4"}`
      : "first visit downloads ~45 MB"
    : queue.total > 0 && queue.done < queue.total
      ? `Removing background ${queue.done + 1}/${queue.total}…`
      : undefined;

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{label}</p>
      {detail && <p className="loading-detail">{detail}</p>}
    </div>
  );
}
