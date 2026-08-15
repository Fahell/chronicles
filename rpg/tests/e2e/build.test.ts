import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildDir = resolve(import.meta.dirname, "../../build");

describe("committed production build", () => {
  it("has the platform entry bundle rpg.js", () => {
    expect(existsSync(resolve(buildDir, "rpg.js"))).toBe(true);
  });

  it("has the stylesheet rpg.css", () => {
    expect(existsSync(resolve(buildDir, "rpg.css"))).toBe(true);
  });

  it("has no unhashed stray JS chunks at the build root", () => {
    // Everything beyond the entry lives under chunks/ or assets/ (tech-spec §4.1).
    const entries = readdirSync(buildDir);

    expect(entries.filter((e) => e.endsWith(".js"))).toEqual(["rpg.js"]);
  });

  it("keeps three.js out of the initial bundle (lazy chunk)", () => {
    const entry = readFileSync(resolve(buildDir, "rpg.js"), "utf8");
    const chunks = readdirSync(resolve(buildDir, "chunks"));

    // `WebGLProgram` is internal to the three.js library body (never written
    // by app code) — its absence proves the renderer ships as a lazy chunk,
    // not inside the entry bundle (tech-spec §2.1).
    expect(entry.includes("WebGLProgram")).toBe(false);
    expect(chunks.some((c) => c.startsWith("three.module"))).toBe(true);
  });
});
