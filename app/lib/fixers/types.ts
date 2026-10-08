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
}

export interface Fixer {
  id: string;
  type: FailureType;
  // Returns the patch for one file, or null when the file needs no change.
  // Must be idempotent: running it on its own output returns null.
  fixFile(path: string, content: string, ctx: FixContext): Patch | null;
}
