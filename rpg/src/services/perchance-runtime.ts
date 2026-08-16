/**
 * Platform adapter for the Perchance AI plugins (tech-spec §6.1).
 *
 * This is the ONLY module that touches `root.generateImage` /
 * `root.generateText`. Everything else depends on the typed `ImageService`
 * and `TextService` interfaces below.
 *
 * Production impl wraps the platform globals, normalizing:
 * - image: `result.dataUrl || result` (the result may itself be the data URL)
 * - text:  `result.generatedText | result.text | result` (may be a string)
 *
 * The dev impl is the mock harness (`services/mock/`).
 */

export type RuntimeMode = "dev" | "prod";

export interface ImageOpts {
  /** Full generation prompt (fixed template + entity params). */
  prompt: string;
  /** Fixed seed per character/scene — cache-key component; re-rolls change it. */
  seed: string;
  resolution?: string;
  negativePrompt?: string;
  /**
   * Per-asset background removal. ONLY character sprites should set this —
   * applying it to scene planes (backdrop/floor) makes the model classify the
   * sky/landscape as "background" and null it out to black (Perchance round 3
   * forensics: 76.8% pure-black pixels on the backdrop with it on, 0% without).
   * Defaults to false; never derived from the mode.
   */
  removeBackground?: boolean;
}

export interface ImageResult {
  dataUrl: string;
}

export interface TextOpts {
  /** Full payload for a voice — built by services/payload.ts. */
  instruction: string;
  /** Optional system/instruction prefix, kept separate from the payload. */
  system?: string;
}

export interface TextResult {
  text: string;
}

export interface ImageService {
  generate(opts: ImageOpts): Promise<ImageResult>;
}

export interface TextService {
  generate(opts: TextOpts): Promise<TextResult>;
}

export interface PerchanceRuntime {
  mode: RuntimeMode;
  image: ImageService;
  text: TextService;
}

/** The platform plugin surface (`root.generateImage` / `root.generateText`). */
export interface PerchanceRoot {
  generateImage?: (opts: {
    prompt: string;
    resolution?: string;
    negativePrompt?: string;
    removeBackground?: boolean;
  }) => Promise<{ dataUrl?: string } | string>;
  generateText?: (opts: {
    instruction: string;
  }) => Promise<{ generatedText?: string; text?: string } | string>;
}

function toDataUrl(result: { dataUrl?: string } | string): string {
  const dataUrl = typeof result === "string" ? result : result.dataUrl;
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    throw new Error("Perchance generateImage returned no dataUrl");
  }
  return dataUrl;
}

function toText(result: { generatedText?: string; text?: string } | string): string {
  const text = typeof result === "string" ? result : (result.generatedText ?? result.text);
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Perchance generateText returned no text");
  }
  return text;
}

/**
 * Wraps the platform root in the typed service interfaces.
 * `removeBackground` is explicit per request (default false) — only character
 * sprites enable it. The mode never implies it: scene planes (backdrop/floor)
 * must NOT have background removal (Perchance round 3 root cause).
 */
export function createPlatformRuntime(root: PerchanceRoot, mode: RuntimeMode): PerchanceRuntime {
  return {
    mode,
    image: {
      async generate(opts: ImageOpts): Promise<ImageResult> {
        if (!root.generateImage) {
          throw new Error("Perchance runtime unavailable: root.generateImage is not defined");
        }
        const result = await root.generateImage({
          prompt: opts.prompt,
          resolution: opts.resolution,
          negativePrompt: opts.negativePrompt,
          removeBackground: opts.removeBackground ?? false,
        });
        return { dataUrl: toDataUrl(result) };
      },
    },
    text: {
      async generate(opts: TextOpts): Promise<TextResult> {
        if (!root.generateText) {
          throw new Error("Perchance runtime unavailable: root.generateText is not defined");
        }
        const result = await root.generateText({ instruction: opts.instruction });
        return { text: toText(result) };
      },
    },
  };
}
