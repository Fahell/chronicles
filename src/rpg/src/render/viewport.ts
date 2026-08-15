/**
 * Contain/letterbox scaling (tech-spec §5.1).
 *
 * Fits a content surface of `contentW × contentH` inside a viewport of
 * `viewW × viewH` preserving aspect ratio, returning the uniform scale and
 * the centered offset in viewport coordinates.
 */
export interface ContainResult {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function contain(
  viewW: number,
  viewH: number,
  contentW: number,
  contentH: number,
): ContainResult {
  if (contentW <= 0 || contentH <= 0) {
    throw new Error("contain: content size must be positive");
  }

  const scale = Math.min(viewW / contentW, viewH / contentH);

  return {
    scale,
    offsetX: (viewW - contentW * scale) / 2,
    offsetY: (viewH - contentH * scale) / 2,
  };
}
