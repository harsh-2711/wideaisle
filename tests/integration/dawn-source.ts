import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Dawn 16.0.0, pinned. Fetched once into .cache/, or read from DAWN_DIR.
export const DAWN_SHA = "258f00f64365e2018ca4c62778a6bf55a5d3cd18";
const CACHE = path.resolve(".cache", `dawn-${DAWN_SHA}`);

const isTheme = (dir: string) => fs.existsSync(path.join(dir, "layout", "theme.liquid"));

export function dawnDir(): string | null {
  if (process.env.DAWN_DIR) return isTheme(process.env.DAWN_DIR) ? process.env.DAWN_DIR : null;
  if (isTheme(CACHE)) return CACHE;
  try {
    fs.mkdirSync(CACHE, { recursive: true });
    // No background gc or maintenance: they rewrite .git while tests run.
    const quiet = ["-c", "gc.auto=0", "-c", "maintenance.auto=false"];
    execFileSync("git", [...quiet, "clone", "-q", "--filter=blob:none", "https://github.com/Shopify/dawn.git", CACHE], { stdio: "ignore", timeout: 120000 });
    execFileSync("git", [...quiet, "-C", CACHE, "checkout", "-q", DAWN_SHA], { stdio: "ignore", timeout: 120000 });
    return CACHE;
  } catch {
    fs.rmSync(CACHE, { recursive: true, force: true });
    return null;
  }
}

// Offline local runs skip the Dawn tests. CI must never pass by skipping them.
export function requireDawn(dir: string | null, env: Record<string, string | undefined> = process.env): string | null {
  if (dir) return dir;
  if (env.CI) throw new Error(`Could not fetch Dawn ${DAWN_SHA}. CI must run the Dawn tests, not skip them.`);
  return null;
}
