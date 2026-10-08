// Shared test data for the delivery adapters: a tiny Dawn-like theme and a
// patch shaped like the fixer engine's output.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import type { FetchLike, RequestInitLike, ResponseLike } from "../../../app/lib/delivery/http";
import type { DeliveryPatch } from "../../../app/lib/delivery/types";

export const HEADER_BEFORE = `<a href="{{ routes.cart_url }}" class="header__icon">{% render 'icon-cart' %}</a>\n`;
export const HEADER_AFTER = `<a href="{{ routes.cart_url }}" class="header__icon" aria-label="{{ 'templates.cart.cart' | t }}">{% render 'icon-cart' %}</a>\n`;
export const CSS_BEFORE = `.button { color: #999999; background: #ffffff; }\r\n`;
export const CSS_AFTER = `.button { color: #595959; background: #ffffff; }\r\n`;
export const NEW_SNIPPET = `{%- comment -%} Added by Wide Aisle {%- endcomment -%}\n<span class="visually-hidden">{{ label }}</span>\n`;

// A few bytes that are not valid UTF-8, to prove binary files pass through.
export const LOGO_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);

export const THEME_TEXT: Record<string, string> = {
  "layout/theme.liquid": `<!doctype html>\n<html lang="{{ request.locale.iso_code }}">\n<head>{{ content_for_header }}</head>\n<body>{{ content_for_layout }}</body>\n</html>\n`,
  "sections/header.liquid": HEADER_BEFORE,
  "assets/base.css": CSS_BEFORE,
  "config/settings_data.json": `{\n  "current": "Default"\n}\n`,
  "locales/en.default.json": `{ "templates": { "cart": { "cart": "Cart" } } }\n`,
};

export function samplePatch(overrides: Partial<DeliveryPatch> = {}): DeliveryPatch {
  return {
    id: "p-001",
    title: "Name the cart link and raise button contrast",
    files: [
      { file: "sections/header.liquid", before: HEADER_BEFORE, after: HEADER_AFTER },
      { file: "assets/base.css", before: CSS_BEFORE, after: CSS_AFTER },
      { file: "snippets/wa-visually-hidden.liquid", before: null, after: NEW_SNIPPET },
    ],
    altText: [],
    ...overrides,
  };
}

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
