import type { PerchanceRoot } from "../perchance-runtime";
import { placeholderDataUrl } from "./placeholder";
import { defaultTextScript, type TextScript } from "./script";

export interface MockOptions {
  /** Simulated plugin latency per call (ms). Default 0. */
  latencyMs?: number;
  script?: TextScript;
  width?: number;
  height?: number;
}

export interface MockCall {
  kind: "image" | "text";
  /** For image calls: the prompt. For text calls: the instruction. */
  input: string;
  /** Payload size in chars (what was sent to the "plugin"). */
  chars: number;
  /** Result size in chars (what came back). */
  resultChars: number;
  at: number;
}

export interface MockControl {
  /** Append-only log of every generate call, for test assertions (§6.2). */
  readonly calls: MockCall[];
  /** Make the next generateImage call throw once. */
  failNextImage(): void;
  /** Make the next generateText call throw once. */
  failNextText(): void;
  /** Override the scripted text responses at runtime. */
  setScript(script: TextScript): void;
  setLatency(ms: number): void;
  /** Reset the call log. */
  clearCalls(): void;
}

export interface MockHarness {
  /** Shape-compatible with the platform `root` (exposed as `window.root`). */
  root: PerchanceRoot;
  control: MockControl;
}

function matches(entry: { match: string | RegExp }, input: string): boolean {
  return typeof entry.match === "string"
    ? input.toLowerCase().includes(entry.match.toLowerCase())
    : entry.match.test(input);
}

/**
 * Resolves the reply for a call: first matching entry, consuming one from a
 * reply queue (scripted re-call sequences); falls through when a queue is
 * exhausted, then to the default reply.
 */
function resolveReply(script: TextScript, instruction: string): string {
  for (const entry of script.entries) {
    if (!matches(entry, instruction)) continue;
    if (Array.isArray(entry.reply)) {
      const next = entry.reply.shift();
      if (next !== undefined) return next;
      continue;
    }
    return entry.reply;
  }
  return script.defaultReply;
}

/**
 * Deterministic, controllable mock of the platform plugins (tech-spec §6.2).
 * - generateImage → seeded placeholder (canvas/SVG data URL)
 * - generateText → scripted replies (incl. choice-format payloads)
 * - configurable latency + one-shot error injection for loading/error paths
 * - every call recorded in `control.calls` for assertions
 */
export function createMockHarness(options: MockOptions = {}): MockHarness {
  let latencyMs = options.latencyMs ?? 0;
  let script = options.script ?? defaultTextScript;
  let failImage = false;
  let failText = false;
  const calls: MockCall[] = [];

  const delay = () =>
    latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, latencyMs)) : Promise.resolve();

  const record = (call: Omit<MockCall, "at">): MockCall => {
    const entry: MockCall = { ...call, at: Date.now() };
    calls.push(entry);
    return entry;
  };

  const root: PerchanceRoot = {
    async generateImage(opts) {
      await delay();
      if (failImage) {
        failImage = false;
        throw new Error("mock generateImage: injected failure");
      }
      const dataUrl = placeholderDataUrl(opts.prompt, {
        width: options.width,
        height: options.height,
      });
      record({
        kind: "image",
        input: opts.prompt,
        chars: opts.prompt.length,
        resultChars: dataUrl.length,
      });
      return { dataUrl };
    },
    async generateText(opts) {
      await delay();
      if (failText) {
        failText = false;
        throw new Error("mock generateText: injected failure");
      }
      const text = resolveReply(script, opts.instruction);
      record({
        kind: "text",
        input: opts.instruction,
        chars: opts.instruction.length,
        resultChars: text.length,
      });
      return { generatedText: text };
    },
  };

  const control: MockControl = {
    calls,
    failNextImage() {
      failImage = true;
    },
    failNextText() {
      failText = true;
    },
    setScript(next) {
      script = next;
    },
    setLatency(ms) {
      latencyMs = ms;
    },
    clearCalls() {
      calls.length = 0;
    },
  };

  return { root, control };
}

/**
 * Installs the mock as `window.root` (guide §3.6 pattern) — dev harness only.
 * Returns the harness so tests/dev can reach the control surface.
 */
export function installMockRoot(options: MockOptions = {}): MockHarness {
  const harness = createMockHarness(options);
  window.root = harness.root;
  return harness;
}
