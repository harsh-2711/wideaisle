import type { FailureType } from "../a11y/rules";

// A theme as a map of file path (for example "sections/header.liquid") to
// its text. Fixers never touch the filesystem or the network.
export type ThemeFiles = Map<string, string>;

// One change to one file. `before` and `after` are the whole file, so a
// patch can be shown as a diff, applied, and reverted exactly.
export interface Patch {
  file: string;
  before: string;
  after: string;
  type: FailureType;
  fixer: string;
  // What changed, in plain words, for the remediation log.
  notes: string[];
}

export interface FixContext {
  // Translation strings from locales/en.default.json, if the theme has them.
  locale?: Record<string, unknown>;
  // True for Dawn-family themes, which draw text as
  // rgba(var(--color-foreground), 0.75) and 0.7. The contrast fixer then
  // measures text at those opacities; otherwise it checks solid colour.
  dawnTextOpacity?: boolean;
}

export interface Fixer {
  id: string;
  type: FailureType;
  // Returns null when the fixer has nothing to say about the file. A patch
  // with after === before carries only notes (for example "Needs review").
  // Must be idempotent: on its own output it changes nothing (it returns
  // null, or a patch with after === before and the same review notes).
  fixFile(path: string, content: string, ctx: FixContext): Patch | null;
}
