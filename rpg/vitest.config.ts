import { defineConfig } from "vitest/config";

/**
 * Tiered test projects per tech-spec §8.1:
 * - unit: pure logic (payload builder, choice parser, manifest validation, seeded RNG)
 * - integration: stores/services with mocks + Dexie via fake-indexeddb
 * - e2e: checks against the committed build (browser flows are driven by CDP MCP)
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["tests/e2e/**/*.test.ts"],
        },
      },
    ],
  },
});
