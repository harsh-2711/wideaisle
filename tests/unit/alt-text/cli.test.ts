// Runs the CLI in a temp folder. None of these paths reach the API: they all
// stop before a client is created.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { item, tempDir } from "./mock-client";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "scripts", "alt-text", "run.ts");
const cwd = tempDir();
const input = path.join(cwd, "products.jsonl");
fs.writeFileSync(input, [JSON.stringify(item(1)), "not json", JSON.stringify(item(2)), JSON.stringify({ mediaId: "x" })].join("\n"));

afterAll(() => fs.rmSync(cwd, { recursive: true, force: true }));

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (!("ANTHROPIC_API_KEY" in extraEnv)) delete env.ANTHROPIC_API_KEY;
  delete env.ALT_TEXT_MODEL;
  return spawnSync(TSX, [SCRIPT, ...args], { cwd, env, encoding: "utf8", timeout: 60_000 });
}

describe("alt-text CLI", () => {
  it("refuses a real run without ANTHROPIC_API_KEY and says what is missing", () => {
    const r = run(["--input", input, "--run", "t1", "--yes"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Cannot run: nothing was sent.");
    expect(r.stderr).toContain("ANTHROPIC_API_KEY is not set");
    expect(r.stderr).toContain("Q-04");
    expect(fs.existsSync(path.join(cwd, "data"))).toBe(false);
  }, 60_000);

  it("prints the first request and an estimate on a dry run, with no key", () => {
    const r = run(["--input", input, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"custom_id": "m_2001"');
    expect(r.stdout).toContain('"model": "claude-haiku-5-5"');
    expect(r.stdout).toContain("2 request(s)");
    expect(r.stdout).toContain("Dry run: nothing was sent.");
    expect(r.stderr).toContain("not valid JSON; skipped");
    expect(r.stderr).toContain("missing productId");
  }, 60_000);

  it("needs --yes before it sends anything", () => {
    const r = run(["--input", input, "--run", "t2"], { ANTHROPIC_API_KEY: "test-key-not-real" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Estimate for 2 image(s)");
    expect(r.stderr).toContain("Add --yes to send.");
    expect(fs.existsSync(path.join(cwd, "data"))).toBe(false);
  }, 60_000);

  it("refuses more images than --max-images for the run, before adding or sending anything", () => {
    const r = run(["--input", input, "--run", "t3", "--max-images", "1", "--yes"], { ANTHROPIC_API_KEY: "test-key-not-real" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("this run would hold 2 images (0 already in it, 2 new), more than the cap of 1. Nothing was added or sent.");
    const runDir = path.join(cwd, "data", "alt-text", "t3");
    expect(fs.existsSync(path.join(runDir, "state.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(runDir, "lock"))).toBe(false);
  }, 60_000);

  it("refuses limits above their hard ceilings", () => {
    for (const [flag, value, ceiling] of [
      ["--max-attempts", "4", "3"],
      ["--max-images", "1001", "1000"],
      ["--max-requests", "3001", "3000"],
    ]) {
      const r = run(["--input", input, flag, value, "--dry-run"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${flag} ${value} is above the hard ceiling of ${ceiling}`);
    }
  }, 60_000);

  it("says in its help exactly what each limit caps", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Each counts across every command on the same --run folder");
    expect(r.stdout).toContain("Images the run folder may hold in total, earlier commands included.");
    expect(r.stdout).toContain("Requests the run may send in total, first tries and retries together.");
    expect(r.stdout).toContain("Default 2, ceiling 3.");
  }, 60_000);
});
