import { describe, expect, it } from "vitest";

import { fnv1a } from "../../src/services/hash";

describe("fnv1a", () => {
  it("is deterministic", () => {
    expect(fnv1a("a character prompt")).toBe(fnv1a("a character prompt"));
  });

  it("returns an 8-hex-digit string", () => {
    expect(fnv1a("anything")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("differs for different inputs", () => {
    expect(fnv1a("prompt A")).not.toBe(fnv1a("prompt B"));
  });

  it("differs on seed changes", () => {
    expect(fnv1a("a|b|c|seed-1")).not.toBe(fnv1a("a|b|c|seed-2"));
  });
});
