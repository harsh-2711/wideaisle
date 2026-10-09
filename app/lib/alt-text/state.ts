// Run state as an append-only JSONL log, so a run can stop at any point and
// resume without paying twice. Lives under data/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import type { AltTextInput, ItemOutcome, TokenUsage } from "./types";

export interface RunConfig {
  model: string;
  maxTokens: number;
  imageWidth: number;
}

export type StateRecord =
  | { t: "config"; at: string; config: RunConfig }
  | { t: "input"; at: string; customId: string; item: AltTextInput }
  // Written before batches.create, cleared by "submitted", or by "submit_failed"
  // when a resume abandons it with allowResubmit.
  | { t: "intent"; at: string; intentId: string; customIds: string[] }
  | { t: "submitted"; at: string; intentId: string; batchId: string; customIds: string[] }
  | { t: "submit_failed"; at: string; intentId: string; error: string }
  | { t: "result"; at: string; batchId: string; customId: string; outcome: ItemOutcome }
  | { t: "collected"; at: string; batchId: string };

export interface RunState {
  config?: RunConfig;
  /** Inputs by custom_id, in the order they were added. */
  items: Map<string, AltTextInput>;
  /** How many batches each custom_id was sent in. */
  attempts: Map<string, number>;
  /** The latest outcome per custom_id. */
  outcomes: Map<string, ItemOutcome>;
  /** "<batchId> <customId>" for every saved result, to skip duplicates. */
  resultKeys: Set<string>;
  /** Usage of every billed result, retries included. */
  usages: TokenUsage[];
  /** Batches sent but not yet fully collected. */
  openBatches: Map<string, string[]>;
  /** Submissions with no known outcome: batches.create failed or the process stopped during it. */
  danglingIntents: Map<string, string[]>;
  /** Requests in abandoned submissions. They may have been sent and billed, so they count toward the request cap. */
  maybeSent: number;
  batchIds: string[];
  /** Lines that could not be parsed, for example a write cut off by a crash. */
  badLines: number;
}

export function emptyState(): RunState {
  return {
    items: new Map(),
    attempts: new Map(),
    outcomes: new Map(),
    resultKeys: new Set(),
    usages: [],
    openBatches: new Map(),
    danglingIntents: new Map(),
    maybeSent: 0,
    batchIds: [],
    badLines: 0,
  };
}

export function applyRecord(state: RunState, rec: StateRecord): void {
  switch (rec.t) {
    case "config":
      state.config ??= rec.config;
      break;
    case "input":
      if (!state.items.has(rec.customId)) state.items.set(rec.customId, rec.item);
      break;
    case "intent":
      state.danglingIntents.set(rec.intentId, rec.customIds);
      break;
    case "submitted":
      state.danglingIntents.delete(rec.intentId);
      state.openBatches.set(rec.batchId, rec.customIds);
      state.batchIds.push(rec.batchId);
      for (const id of rec.customIds) state.attempts.set(id, (state.attempts.get(id) ?? 0) + 1);
      break;
    case "submit_failed":
      // Only written when a resume abandons an intent. Its batch may exist.
      state.maybeSent += state.danglingIntents.get(rec.intentId)?.length ?? 0;
      state.danglingIntents.delete(rec.intentId);
      break;
    case "result": {
      const key = `${rec.batchId} ${rec.customId}`;
      if (state.resultKeys.has(key)) break;
      state.resultKeys.add(key);
      state.outcomes.set(rec.customId, rec.outcome);
      if (rec.outcome.usage) state.usages.push(rec.outcome.usage);
      break;
    }
    case "collected":
      state.openBatches.delete(rec.batchId);
      break;
  }
}

export function loadState(file: string): RunState {
  const state = emptyState();
  if (!fs.existsSync(file)) return state;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec: StateRecord;
    try {
      rec = JSON.parse(line) as StateRecord;
    } catch {
      state.badLines += 1;
      continue;
    }
    applyRecord(state, rec);
  }
  return state;
}

/** Opens the log for appending. A line cut off by a crash is closed with a newline first. */
export function openLog(file: string): (rec: StateRecord) => void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    if (text.length && !text.endsWith("\n")) fs.appendFileSync(file, "\n");
  }
  return (rec) => fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
}

/** Writes a file through a temporary name, so readers never see half a file. */
export function writeFileAtomic(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function toJsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}

export function readJsonl(file: string): { rows: unknown[]; errors: string[] } {
  const rows: unknown[] = [];
  const errors: string[] = [];
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        rows.push(JSON.parse(line));
      } catch {
        errors.push(`line ${i + 1}: not valid JSON`);
      }
    });
  return { rows, errors };
}
