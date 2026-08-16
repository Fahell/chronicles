/**
 * WebGL2 availability probe (tech-spec §5.5 support matrix — PixiJS v8 and
 * three.js both require WebGL2). When unavailable the app shows a static
 * unsupported-browser screen instead of attempting to boot the scene.
 */
export function webgl2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl !== null;
  } catch {
    return false;
  }
}
