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

/**
 * The scene frame the type-C stage renders into: the Perchance image
 * plugin's native landscape resolution (768×512, guide §7) — the only size
 * that maps 1:1 without upscaling. The stage letterboxes to this aspect so
 * generated art never stretches (owner direction, Perchance round 2).
 */
export const SCENE_FRAME = { width: 768, height: 512 } as const;

export interface SceneFrameViewport {
  /** CSS-pixel size of the 3:2 scene frame inside the viewport. */
  width: number;
  height: number;
  /** Centered offsets from the viewport origin to the frame origin. */
  offsetX: number;
  offsetY: number;
}

/**
 * Fits the scene frame inside the viewport (letterbox/pillarbox), centered.
 * The camera aspect must match the frame (768/512 = 1.5), never the full
 * viewport — otherwise the 3D frustum would disagree with the visible box.
 */
export function sceneFrameViewport(viewW: number, viewH: number): SceneFrameViewport {
  const { scale, offsetX, offsetY } = contain(viewW, viewH, SCENE_FRAME.width, SCENE_FRAME.height);
  return {
    width: SCENE_FRAME.width * scale,
    height: SCENE_FRAME.height * scale,
    offsetX,
    offsetY,
  };
}
