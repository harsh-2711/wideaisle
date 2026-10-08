import { ALL_FIXERS } from "./fixers";
import type { FixContext, Fixer, Patch, ThemeFiles } from "./types";

export interface FileResult {
  file: string;
  before: string;
  after: string;
  patches: Patch[];
}

export interface FixReport {
  files: FileResult[];
  // Changed files only, as the new theme would hold them.
  changed: ThemeFiles;
  // Things a person should look at: findings a fixer could not name safely.
  review: string[];
}

function parseJsonWithComments(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));
  } catch {
    return undefined;
  }
}

export function contextFor(theme: ThemeFiles): FixContext {
  const locale = theme.get("locales/en.default.json");
  return { locale: locale ? parseJsonWithComments(locale) : undefined };
}

// Runs every fixer over every file, chaining fixers on the same file.
export function fixTheme(theme: ThemeFiles, fixers: Fixer[] = ALL_FIXERS, ctx: FixContext = contextFor(theme)): FixReport {
  const files: FileResult[] = [];
  const changed: ThemeFiles = new Map();
  const review: string[] = [];
  for (const [file, original] of [...theme.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let current = original;
    const patches: Patch[] = [];
    for (const fixer of fixers) {
      const p = fixer.fixFile(file, current, ctx);
      if (!p) continue;
      for (const n of p.notes) if (n.startsWith("Needs review")) review.push(`${file}: ${n}`);
      if (p.after !== p.before) {
        patches.push(p);
        current = p.after;
      }
    }
    if (patches.length) {
      files.push({ file, before: original, after: current, patches });
      changed.set(file, current);
    }
  }
  return { files, changed, review };
}

export function applyFixes(theme: ThemeFiles, report: FixReport): ThemeFiles {
  const out = new Map(theme);
  for (const [file, text] of report.changed) out.set(file, text);
  return out;
}

export interface RevertResult {
  theme: ThemeFiles;
  // Files changed since the fix (by the merchant or an app). They are left
  // as they are: reverting them would throw that work away.
  refused: string[];
}

// Puts back each fixed file, but only when it still holds exactly what the
// fix wrote.
export function revertFixes(theme: ThemeFiles, report: FixReport): RevertResult {
  const out = new Map(theme);
  const refused: string[] = [];
  for (const f of report.files) {
    if (theme.get(f.file) === f.after) out.set(f.file, f.before);
    else refused.push(f.file);
  }
  return { theme: out, refused };
}
