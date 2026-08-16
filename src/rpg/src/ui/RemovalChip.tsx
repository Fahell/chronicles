import { removalQueue } from "../services/progress";

/** Discreet corner indicator shown while background removal is running. */
export function RemovalChip() {
  const queue = removalQueue.value;
  if (queue.total === 0 || queue.done >= queue.total) return null;

  return (
    <div className="removal-chip" role="status" aria-live="polite">
      <span className="chip-spinner" aria-hidden="true" />
      <span>
        Removing background {queue.done + 1}/{queue.total}…
      </span>
    </div>
  );
}
