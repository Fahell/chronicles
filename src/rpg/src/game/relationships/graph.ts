/**
 * Relationship web — graph data model (relationships-spec §2, §5).
 *
 * Nodes are characters (the user + NPCs). Edges are directed bonds: A→B may
 * differ from B→A. Each edge carries a bond type and an intensity in
 * −100..+100, from which named tiers are derived (§5).
 *
 * Pure logic — no stores, no signals — so tiers and delta application are
 * unit-testable (tech-spec §8.1: seeded, deterministic).
 */

/** Initial bond types (extensible, §2). */
export const BOND_TYPES = ["friendship", "enmity", "family", "romance"] as const;
export type BondType = (typeof BOND_TYPES)[number];

/** Intensity bounds of the web (relationships-spec §5). */
export const INTENSITY_MIN = -100;
export const INTENSITY_MAX = 100;

/** One directed bond (an edge of the web). */
export interface Bond {
  from: string;
  to: string;
  type: BondType;
  intensity: number;
}

/** Named tiers derived from intensity (relationships-spec §5, baseline). */
export type RelationshipTier =
  | "enemy"
  | "rival"
  | "cold"
  | "stranger"
  | "acquaintance"
  | "friend"
  | "close-friend"
  | "intimate";

/** Directed edge key: `${from}->${to}` (A→B and B→A are distinct edges). */
export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function clampIntensity(value: number): number {
  return Math.max(INTENSITY_MIN, Math.min(INTENSITY_MAX, value));
}

/** A brand-new bond defaults to a neutral friendship at 0 (Stranger tier). */
export function defaultBond(from: string, to: string): Bond {
  return { from, to, type: "friendship", intensity: 0 };
}

/** Applies a delta to the bond's intensity, clamped to the web bounds. */
export function applyDelta(bond: Bond, delta: number): Bond {
  return { ...bond, intensity: clampIntensity(bond.intensity + delta) };
}

/** Derives the named tier from an intensity value (baseline thresholds, §5). */
export function tierOf(intensity: number): RelationshipTier {
  if (intensity <= -61) return "enemy";
  if (intensity <= -21) return "rival";
  if (intensity <= -1) return "cold";
  if (intensity <= 19) return "stranger";
  if (intensity <= 39) return "acquaintance";
  if (intensity <= 59) return "friend";
  if (intensity <= 79) return "close-friend";
  return "intimate";
}
