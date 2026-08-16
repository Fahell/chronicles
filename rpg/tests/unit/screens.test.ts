import { describe, expect, it } from "vitest";
import { navigate, screenSignal } from "../../src/game/state/screens";

describe("screen router", () => {
  it("navigates between screens", () => {
    navigate("wizard");
    expect(screenSignal.value).toBe("wizard");
    navigate("game");
    expect(screenSignal.value).toBe("game");
    navigate("title");
    expect(screenSignal.value).toBe("title");
  });
});
