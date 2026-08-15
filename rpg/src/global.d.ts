import type { PerchanceRoot } from "./services/perchance-runtime";

declare global {
  interface Window {
    /** The platform plugin surface — injected by the platform or the mock (dev). */
    root?: PerchanceRoot;
  }
}
