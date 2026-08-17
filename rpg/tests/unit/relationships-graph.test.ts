import { describe, expect, it } from "vitest";
import {
  applyDelta,
  clampIntensity,
  defaultBond,
  edgeKey,
  INTENSITY_MAX,
  INTENSITY_MIN,
  tierOf,
} from "../../src/game/relationships/graph";

describe("relationship web graph (relationships-spec §2, §5)", () => {
  it("edgeKey distinguishes directions", () => {
    expect(edgeKey("a", "b")).toBe("a->b");
    expect(edgeKey("b", "a")).toBe("b->a");
    expect(edgeKey("a", "b")).not.toBe(edgeKey("b", "a"));
  });

  it("default bond is a neutral friendship (Stranger tier)", () => {
    const bond = defaultBond("player", "npc/elder");
    expect(bond).toEqual({ from: "player", to: "npc/elder", type: "friendship", intensity: 0 });
    expect(tierOf(bond.intensity)).toBe("stranger");
  });

  it("applyDelta clamps to the web bounds", () => {
    const bond = defaultBond("a", "b");
    expect(applyDelta(bond, 150).intensity).toBe(INTENSITY_MAX);
    expect(applyDelta(bond, -150).intensity).toBe(INTENSITY_MIN);
    expect(applyDelta(bond, 5).intensity).toBe(5);
    // the bond type survives the delta
    expect(applyDelta(bond, 5).type).toBe("friendship");
  });

  it("clampIntensity bounds any value", () => {
    expect(clampIntensity(500)).toBe(100);
    expect(clampIntensity(-500)).toBe(-100);
    expect(clampIntensity(42)).toBe(42);
  });

  it("tierOf maps the baseline thresholds (§5)", () => {
    expect(tierOf(-100)).toBe("enemy");
    expect(tierOf(-61)).toBe("enemy");
    expect(tierOf(-60)).toBe("rival");
    expect(tierOf(-21)).toBe("rival");
    expect(tierOf(-20)).toBe("cold");
    expect(tierOf(-1)).toBe("cold");
    expect(tierOf(0)).toBe("stranger");
    expect(tierOf(19)).toBe("stranger");
    expect(tierOf(20)).toBe("acquaintance");
    expect(tierOf(39)).toBe("acquaintance");
    expect(tierOf(40)).toBe("friend");
    expect(tierOf(59)).toBe("friend");
    expect(tierOf(60)).toBe("close-friend");
    expect(tierOf(79)).toBe("close-friend");
    expect(tierOf(80)).toBe("intimate");
    expect(tierOf(100)).toBe("intimate");
  });
});
