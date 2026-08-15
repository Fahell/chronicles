/**
 * Adapter isolating root.generateImage / root.generateText (tech-spec §6.1).
 *
 * The production implementation wraps the platform globals; the dev/mock
 * implementation is the deterministic harness (§6.2). The app never calls the
 * platform globals directly — it always goes through this interface.
 */
export interface GenerateImageRequest {
  /** Full generation prompt (built from the fixed template + entity params). */
  prompt: string;
  seed: string;
  removeBackground: boolean;
}

export interface GenerateImageResult {
  dataUrl: string;
}

export interface GenerateTextRequest {
  /** Full payload for a voice — built by services/payload.ts. */
  payload: string;
  /** System/instruction prefix, kept separate from the payload. */
  system?: string;
}

export interface GenerateTextResult {
  text: string;
}

export interface PerchanceRuntime {
  generateImage(request: GenerateImageRequest): Promise<GenerateImageResult>;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
}
