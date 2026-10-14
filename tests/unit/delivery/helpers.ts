// Test helpers for the delivery adapters: recorded fixtures and a fetch that
// replays them in order.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import type { FetchLike, RequestInitLike, ResponseLike } from "../../../app/lib/delivery/http";

export * from "./theme-data";
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8")) as T;
}

// One recorded exchange: the request we expect next and the response to give.
export interface Exchange {
  // GraphQL operation name, or "METHOD /path?query" for REST.
  op: string;
  status?: number;
  headers?: Record<string, string>;
  // An object is sent as JSON. A string is sent as is.
  body?: unknown;
  // Extra checks on the parsed request body.
  check?: (body: unknown) => void;
}

export interface Call {
  url: string;
  init: RequestInitLike;
  op: string;
  body: unknown;
}

function opName(url: string, init: RequestInitLike): string {
  if (url.includes("/graphql.json")) {
    const query = (JSON.parse(init.body ?? "{}") as { query?: string }).query ?? "";
    return /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "(anonymous)";
  }
  const u = new URL(url);
  return `${init.method} ${u.pathname}${u.search}`;
}

export function responseOf(status: number, body: unknown, headers: Record<string, string> = {}): ResponseLike {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => text,
    arrayBuffer: async () => {
      const b = Buffer.from(text, "utf8");
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
}

// A fetch that replays recorded exchanges in order and fails on anything else.
export function replay(exchanges: Exchange[]) {
  const queue = [...exchanges];
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const op = opName(url, init);
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request ${op}`);
    expect(op, `request #${calls.length + 1}`).toBe(next.op);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, op, body });
    next.check?.(body);
    return responseOf(next.status ?? 200, next.body, next.headers);
  };
  return { fetch, calls, left: () => queue.map((e) => e.op) };
}

export const noSleep = async (): Promise<void> => {};

export const FIXED_NOW = () => new Date("2026-10-08T12:00:00Z");
