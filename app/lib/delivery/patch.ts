import { createHash } from "node:crypto";
import { InvalidPatchError, type Conflict } from "./errors";
import { LIMITS, fileSizeProblem } from "./limits";
import type { AltTextChange, DeliveryPatch, FilePlan, ThemeFileChange } from "./types";

// Top-level folders of an Online Store 2.0 theme.
export const THEME_DIRS = ["assets", "blocks", "config", "layout", "locales", "sections", "snippets", "templates"] as const;

const PATCH_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function utf8(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

export function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b;
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

export function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function themePathProblem(file: string): string | null {
  if (typeof file !== "string" || !file) return "empty file path";
  const parts = file.split("/");
  if (!(THEME_DIRS as readonly string[]).includes(parts[0])) return `${file} is not under a theme folder (${THEME_DIRS.join(", ")})`;
  if (parts.length < 2 || parts.some((p) => p === "" || p === "." || p === "..")) return `${file} is not a plain relative path`;
  // theme.files treats * as a wildcard, and \ is not a theme path separator.
  if (/[\\*?\0]/.test(file)) return `${file} has a character theme paths do not use`;
  return null;
}

// Checks shape, paths, duplicates and size limits. Throws InvalidPatchError.
export function validatePatch(patch: DeliveryPatch): void {
  const problems: string[] = [];
  if (!PATCH_ID.test(patch.id ?? "")) problems.push(`id "${patch.id}" must be 1 to 63 lower case letters, digits or dashes`);
  if (!patch.title?.trim()) problems.push("title is empty");
  if (!Array.isArray(patch.files) || !Array.isArray(patch.altText)) {
    problems.push("files and altText must be lists");
    throw new InvalidPatchError(problems);
  }
  if (!patch.files.length && !patch.altText.length) problems.push("the patch changes nothing");
  const seen = new Set<string>();
  for (const c of patch.files) {
    const p = themePathProblem(c.file);
    if (p) problems.push(p);
    if (seen.has(c.file)) problems.push(`${c.file} appears twice; merge its changes first`);
    seen.add(c.file);
    if (typeof c.after !== "string") problems.push(`${c.file} has no after text`);
    else {
      if (c.before === c.after) problems.push(`${c.file} does not change`);
      const size = fileSizeProblem(c.file, c.after);
      if (size) problems.push(size);
    }
  }
  const media = new Set<string>();
  for (const a of patch.altText) {
    if (!a.mediaId) problems.push("an alt-text change has no mediaId");
    if (media.has(a.mediaId)) problems.push(`${a.mediaId} appears twice`);
    media.add(a.mediaId);
    if (a.before === a.after) problems.push(`${a.mediaId} alt text does not change`);
    if ([...(a.after ?? "")].length > LIMITS.altTextChars) problems.push(`${a.mediaId} alt text is longer than ${LIMITS.altTextChars} characters`);
  }
  if (problems.length) throw new InvalidPatchError(problems);
}

// Builds a DeliveryPatch from fixer output. Accepts the engine's FileResult
// list or a raw list of fixer Patches; chained patches on one file merge
// into one change (first before, last after).
export function patchFromFileChanges(
  id: string,
  title: string,
  changes: Iterable<ThemeFileChange>,
  altText: AltTextChange[] = [],
): DeliveryPatch {
  const merged = new Map<string, ThemeFileChange>();
  for (const c of changes) {
    const prev = merged.get(c.file);
    if (!prev) merged.set(c.file, { file: c.file, before: c.before, after: c.after });
    else if (prev.after !== c.before) throw new InvalidPatchError([`${c.file}: patches do not chain (one's after is not the next one's before)`]);
    else prev.after = c.after;
  }
  const files = [...merged.values()].filter((c) => c.before !== c.after);
  const patch = { id, title, files, altText };
  validatePatch(patch);
  return patch;
}

// The GitHub and theme-file routes carry theme files only. Alt text always
// goes through the Admin API.
export function splitPatch(patch: DeliveryPatch): { theme: DeliveryPatch | null; altText: DeliveryPatch | null } {
  return {
    theme: patch.files.length ? { ...patch, altText: [] } : null,
    altText: patch.altText.length ? { ...patch, files: [] } : null,
  };
}

export function requireNoAltText(patch: DeliveryPatch, route: string): void {
  if (patch.altText.length) {
    throw new InvalidPatchError([`the ${route} route carries theme files only; send alt text through the Admin API (see splitPatch)`]);
  }
}

// Compares what the store holds now with what the patch expects.
// `current` is null when the file does not exist.
export function fileConflict(file: string, current: Uint8Array | null, expected: string | null): Conflict | null {
  if (expected === null) return current === null ? null : { file, reason: "exists" };
  if (current === null) return { file, reason: "missing" };
  return sameBytes(current, utf8(expected)) ? null : { file, reason: "changed" };
}

export function plansFor(files: ThemeFileChange[]): FilePlan[] {
  return files.map((c) => ({
    file: c.file,
    action: c.before === null ? "create" : "update",
    bytesBefore: c.before === null ? 0 : Buffer.byteLength(c.before, "utf8"),
    bytesAfter: Buffer.byteLength(c.after, "utf8"),
  }));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
