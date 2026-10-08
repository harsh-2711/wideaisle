// Turns product images into Message Batches API requests.
import { createHash } from "node:crypto";
import type { BatchCreateParams, URLImageSource } from "@anthropic-ai/sdk/resources/messages";
import { DEFAULT_IMAGE_WIDTH, DEFAULT_MAX_TOKENS, effortFor } from "./config";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, userText } from "./prompt";
import type { AltTextInput } from "./types";

/** The Batch API accepts 1 to 64 letters, digits, hyphens and underscores. */
export const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface PreparedItem {
  customId: string;
  item: AltTextInput;
}

export interface SkippedItem {
  item: unknown;
  reason: string;
}

/**
 * A custom_id that maps back to the media ID: "m_<number>" for a Shopify
 * GID such as gid://shopify/MediaImage/123, else "h_" plus a SHA-256 prefix.
 */
export function customIdFor(mediaId: string, forceHash = false): string {
  const tail = /(\d+)$/.exec(mediaId)?.[1];
  if (!forceHash && tail && tail.length <= 60) return `m_${tail}`;
  return `h_${createHash("sha256").update(mediaId).digest("hex").slice(0, 40)}`;
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function optionalString(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
}

/** Checks one input record. Returns the reason it is unusable, or null. */
export function inputProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "not an object";
  const r = raw as Record<string, unknown>;
  for (const key of ["productId", "mediaId", "imageUrl", "productTitle"]) {
    if (!nonEmpty(r[key])) return `missing ${key}`;
  }
  for (const key of ["productType", "existingAlt", "locale"]) {
    if (!optionalString(r[key])) return `${key} must be a string`;
  }
  try {
    const url = new URL(r.imageUrl as string);
    if (url.protocol !== "https:") return "imageUrl must use https";
  } catch {
    return "imageUrl is not a URL";
  }
  return null;
}

/** Validates, de-duplicates by media ID and assigns unique custom_ids. */
export function prepareItems(raw: unknown[]): { prepared: PreparedItem[]; skipped: SkippedItem[] } {
  const prepared: PreparedItem[] = [];
  const skipped: SkippedItem[] = [];
  const seenMedia = new Set<string>();
  const seenIds = new Set<string>();
  for (const r of raw) {
    const problem = inputProblem(r);
    if (problem) {
      skipped.push({ item: r, reason: problem });
      continue;
    }
    const src = r as Record<string, string | undefined>;
    const item: AltTextInput = {
      productId: src.productId as string,
      mediaId: src.mediaId as string,
      imageUrl: src.imageUrl as string,
      productTitle: src.productTitle as string,
      ...(src.productType ? { productType: src.productType } : {}),
      ...(src.existingAlt ? { existingAlt: src.existingAlt } : {}),
      ...(src.locale ? { locale: src.locale } : {}),
    };
    if (seenMedia.has(item.mediaId)) {
      skipped.push({ item: r, reason: `duplicate mediaId ${item.mediaId}` });
      continue;
    }
    let customId = customIdFor(item.mediaId);
    if (seenIds.has(customId)) customId = customIdFor(item.mediaId, true);
    seenMedia.add(item.mediaId);
    seenIds.add(customId);
    prepared.push({ customId, item });
  }
  return { prepared, skipped };
}

/**
 * Asks the Shopify CDN for a downscaled copy so the model reads fewer image
 * tokens. Shopify CDN and storefront /cdn/shop/ URLs take a width parameter.
 * Other hosts are sent unchanged.
 */
export function imageSource(imageUrl: string, width = DEFAULT_IMAGE_WIDTH): URLImageSource {
  const url = new URL(imageUrl);
  const shopifyCdn = url.hostname === "cdn.shopify.com" || url.pathname.startsWith("/cdn/shop/");
  if (shopifyCdn) {
    url.searchParams.delete("height");
    url.searchParams.set("width", String(width));
  }
  return { type: "url", url: url.toString() };
}

export interface RequestOptions {
  model: string;
  maxTokens?: number;
  imageWidth?: number;
}

export function buildRequest({ customId, item }: PreparedItem, opts: RequestOptions): BatchCreateParams.Request {
  if (!CUSTOM_ID.test(customId)) throw new Error(`invalid custom_id: ${customId}`);
  const effort = effortFor(opts.model);
  return {
    custom_id: customId,
    params: {
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        ...(effort ? { effort } : {}),
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: imageSource(item.imageUrl, opts.imageWidth) },
            { type: "text", text: userText(item) },
          ],
        },
      ],
    },
  };
}

export function buildBatchRequests(items: PreparedItem[], opts: RequestOptions): BatchCreateParams.Request[] {
  const ids = new Set<string>();
  return items.map((p) => {
    if (ids.has(p.customId)) throw new Error(`duplicate custom_id: ${p.customId}`);
    ids.add(p.customId);
    return buildRequest(p, opts);
  });
}

/** Image tokens for a w x h image: one token per 28 x 28 px patch (vision docs, 2026-10-08). */
export function imageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}
