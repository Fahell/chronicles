import { bootProgress, removalQueue } from "../services/progress";

/** Boot loading screen (removal-pipeline-spec §5.1): animated, live stages. */
export function LoadingScreen() {
  const progress = bootProgress.value;
  const queue = removalQueue.value;

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{progress.label}</p>
      {queue.total > 0 && queue.done < queue.total && (
        <p className="loading-detail">
          Removing background {queue.done + 1}/{queue.total}…
        </p>
      )}
    </div>
  );
}
