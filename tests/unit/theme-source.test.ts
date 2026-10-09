import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTheme } from "../a11y/render";
import { requireDawn } from "../integration/dawn-source";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-theme-"));
  roots.push(root);
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}

describe("loadTheme", () => {
  it("reads theme folders only, never .git or other dot entries", () => {
    // CI failed when git removed .git/objects/maintenance.lock mid-walk.
    const root = tree({
      ".git/objects/maintenance.lock": "",
      ".github/workflows/ci.yml": "",
      "README.md": "",
      "sections/header.liquid": "<header></header>",
      "sections/.DS_Store": "",
      "config/settings_data.json": "{}",
    });
    expect([...loadTheme(root).keys()].sort()).toEqual(["config/settings_data.json", "sections/header.liquid"]);
  });
});

describe("Dawn source for the integration test", () => {
  it("skips when Dawn cannot be fetched locally, and fails under CI", () => {
    expect(requireDawn("/tmp/dawn", {})).toBe("/tmp/dawn");
    expect(requireDawn(null, {})).toBeNull();
    expect(() => requireDawn(null, { CI: "true" })).toThrow(/Dawn/);
  });
});
