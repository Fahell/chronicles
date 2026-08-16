import { CutoutStore } from "./cutout-cache";
import { RpgDatabase } from "./db";
import { fnv1a } from "./hash";
import type { ImageOpts, ImageService, RuntimeMode } from "./perchance-runtime";

/** Everything that identifies one asset generation. */
export interface AssetRequest {
  /** Character/scene id — keeps generations consistent per entity. */
  entity: string;
  /** Pose or asset variant (e.g. "idle", "angry", "default"). */
  pose: string;
  prompt: string;
  seed: string;
  resolution?: string;
  negativePrompt?: string;
  /** Per-asset background removal — ONLY character sprites set this to true. */
  removeBackground?: boolean;
}

export interface CachedAsset {
  dataUrl: string;
  fromCache: boolean;
  /** The computed cache key — lets derived assets (cut-outs) key off the raw generation. */
  key: string;
}

export type GenerationLogEntry =
  | { kind: "hit" | "miss"; key: string; chars: number; at: number }
  | { kind: "regenerate"; key: string; chars: number; at: number };

/**
 * Cache key: mode | entity | pose | seed | prompt-hash | resolution | negativePrompt | removeBackground.
 * Changing any component (including the prompt) busts the key
 * (tech-spec §6.1: "changing a prompt busts the cache by key change").
 * resolution/negativePrompt/removeBackground are generation-affecting
 * params, so they must bust the key too — otherwise a stale generation
 * (e.g. a blackened backdrop from mode-derived removeBackground) would
 * keep being served from cache.
 */
export function assetCacheKey(mode: RuntimeMode, req: AssetRequest): string {
  return [
    mode,
    req.entity,
    req.pose,
    req.seed,
    fnv1a(req.prompt),
    req.resolution ?? "",
    req.negativePrompt ?? "",
    req.removeBackground ? "rb" : "",
  ].join("|");
}

/**
 * Cache orchestration over the image service (tech-spec §6.1, §7.2).
 * - getOrGenerate: cache hit → return stored pixels; miss → generate + store.
 * - regenerate:    re-roll with a NEW seed → new cache key → fresh generation
 *   (vn-rpg-spec §4.3; the fixed prompt template keeps consistency).
 * - No app-level retry/timeout: the plugins self-retry; we only surface
 *   loading state and never abort in-flight generations (pending-decisions §5).
 */
export class AssetCache {
  private readonly db: RpgDatabase;
  private readonly image: ImageService;
  private readonly seedFactory: () => string;
  private seedCounter = 0;

  readonly mode: RuntimeMode;
  /** Cut-out store (RMBG-processed sprites) — prod only, see cutout-cache.ts. */
  readonly cutouts: CutoutStore;
  /** Append-only log for assertions and the dev context inspector (§6.4). */
  readonly log: GenerationLogEntry[] = [];

  constructor(
    mode: RuntimeMode,
    image: ImageService,
    options?: { dbName?: string; seedFactory?: () => string },
  ) {
    this.mode = mode;
    this.image = image;
    this.db = new RpgDatabase(mode, options?.dbName);
    this.cutouts = new CutoutStore(this.db.cutouts, mode);
    this.seedFactory = options?.seedFactory ?? (() => `roll-${++this.seedCounter}-${Date.now()}`);
  }

  async getOrGenerate(req: AssetRequest): Promise<CachedAsset> {
    const key = assetCacheKey(this.mode, req);
    const row = await this.db.assets.get(key);
    if (row) {
      this.log.push({ kind: "hit", key, chars: row.dataUrl.length, at: Date.now() });
      return { dataUrl: row.dataUrl, fromCache: true, key };
    }

    this.log.push({ kind: "miss", key, chars: req.prompt.length, at: Date.now() });
    const result = await this.generateAndStore(req, key);
    return { dataUrl: result, fromCache: false, key };
  }

  /** Re-roll: new seed → new key → fresh generation (vn-rpg-spec §4.3). */
  async regenerate(req: Omit<AssetRequest, "seed">): Promise<CachedAsset> {
    const seed = this.seedFactory();
    const key = assetCacheKey(this.mode, { ...req, seed });
    this.log.push({ kind: "regenerate", key, chars: req.prompt.length, at: Date.now() });
    const result = await this.generateAndStore({ ...req, seed }, key);
    return { dataUrl: result, fromCache: false, key };
  }

  /** Count of cached generations (used by the dev harness / inspector). */
  async count(): Promise<number> {
    return this.db.assets.count();
  }

  async clear(): Promise<void> {
    await this.db.assets.clear();
    await this.db.cutouts.clear();
    this.log.length = 0;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private async generateAndStore(req: AssetRequest, key: string): Promise<string> {
    const opts: ImageOpts = {
      prompt: req.prompt,
      seed: req.seed,
      resolution: req.resolution,
      negativePrompt: req.negativePrompt,
      removeBackground: req.removeBackground,
    };
    const { dataUrl } = await this.image.generate(opts);
    await this.db.assets.put({
      key,
      dataUrl,
      prompt: req.prompt,
      seed: req.seed,
      mode: this.mode,
      createdAt: Date.now(),
    });
    return dataUrl;
  }
}
