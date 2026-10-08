// Reads one batch result, validates the model's JSON and checks the draft
// against the alt-text rules. Every result maps to a draft, a retry or a
// failure; nothing is guessed.
import type { Message, MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages";
import { ALT_MAX_CHARS } from "./config";
import type { AltTextInput, Confidence, ItemOutcome, ModelAnswer, ReviewDraft, TokenUsage } from "./types";

export type ParseResult = { ok: true; answer: ModelAnswer } | { ok: false; error: string };

const CONFIDENCE = new Set<Confidence>(["high", "medium", "low"]);

/** Parses and type-checks the model's JSON text. Tolerates a ```json fence. */
export function parseModelText(text: string): ParseResult {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, error: "model output was not valid JSON" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "model output was not a JSON object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.alt !== "string") return { ok: false, error: "model output has no alt string" };
  if (typeof r.decorative !== "boolean") return { ok: false, error: "model output has no decorative flag" };
  if (typeof r.needs_review !== "boolean") return { ok: false, error: "model output has no needs_review flag" };
  // Structured outputs can differ in case only, so compare in lower case.
  const confidence = typeof r.confidence === "string" ? (r.confidence.toLowerCase() as Confidence) : undefined;
  if (!confidence || !CONFIDENCE.has(confidence)) return { ok: false, error: "model output has no valid confidence" };
  const reviewNote = typeof r.review_note === "string" ? r.review_note : "";
  return {
    ok: true,
    answer: { alt: r.alt, decorative: r.decorative, needsReview: r.needs_review, confidence, reviewNote },
  };
}

const STARTS_WITH_MEDIUM = /^(an?\s+|the\s+)?(image|picture|photo|photograph|graphic|illustration)\s+(of|showing)\b/i;
const CLAIMS = /\b(accessib\w*|compliant|compliance|wcag|ada|certified|lawsuit\w*)\b/i;
const PROMO = /\b(buy now|shop now|order now|click|discount|sale|free shipping|best price|cheap|limited time|deal)\b|\d+\s*% off/i;
const LINK = /https?:\/\/|www\.|\.com\b/i;
const INJECTION_ECHO = /\b(ignore|disregard)\b.{0,40}\b(instructions|prompt|rules)\b|\bsystem prompt\b|\bas an ai\b/i;
const STOP_WORDS = new Set(["the", "and", "with", "for", "on", "in", "of", "a", "an", "to", "at", "by"]);

/** Normalises whitespace. Does not change wording. */
export function cleanAlt(alt: string): string {
  return alt.replace(/\s+/g, " ").trim();
}

/** Problems with a draft that a merchant should see. Empty when none were found. */
export function draftProblems(alt: string, item: AltTextInput, decorative: boolean): string[] {
  const problems: string[] = [];
  if (!alt) {
    if (!decorative) problems.push("empty draft");
    return problems;
  }
  if (alt.length > ALT_MAX_CHARS) problems.push(`longer than ${ALT_MAX_CHARS} characters (${alt.length})`);
  if (STARTS_WITH_MEDIUM.test(alt)) problems.push('starts with "image of" or similar');
  if (CLAIMS.test(alt)) problems.push("mentions accessibility or compliance");
  if (PROMO.test(alt) || LINK.test(alt)) problems.push("reads like an ad or contains a link");
  if (INJECTION_ECHO.test(alt)) problems.push("may follow instructions found in store text");
  const words = alt.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) if (w.length > 2 && !STOP_WORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const commaParts = alt.split(",").length;
  if ([...counts.values()].some((n) => n >= 3) || commaParts >= 5) problems.push("looks like a keyword list");
  if (alt.toLowerCase() === cleanAlt(item.productTitle).toLowerCase()) problems.push("repeats the product title only");
  return problems;
}

/** Joins the text blocks of a message. Thinking blocks are skipped. */
export function messageText(message: Message): string {
  return message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

export function usageOf(message: Message): TokenUsage {
  const u = message.usage;
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

/** Turns a parsed answer into a review-queue row. */
export function toReviewDraft(answer: ModelAnswer, item: AltTextInput, customId: string, model: string): ReviewDraft {
  const alt = answer.decorative ? "" : cleanAlt(answer.alt);
  const reasons: string[] = [];
  if (answer.reviewNote.trim()) reasons.push(answer.reviewNote.trim());
  if (answer.decorative) reasons.push("model marked the image decorative; confirm before using empty alt");
  if (answer.confidence === "low") reasons.push("low confidence");
  reasons.push(...draftProblems(alt, item, answer.decorative));
  return {
    mediaId: item.mediaId,
    productId: item.productId,
    imageUrl: item.imageUrl,
    productTitle: item.productTitle,
    locale: item.locale || "en",
    draft: alt,
    needsReview: answer.needsReview || reasons.length > 0,
    confidence: answer.confidence,
    decorative: answer.decorative,
    reason: reasons.join("; "),
    customId,
    model,
  };
}

/**
 * Maps one batch result to an outcome. Errored, canceled and expired
 * requests are not billed (batch docs, 2026-10-08), so they carry no usage.
 */
export function outcomeFor(result: MessageBatchIndividualResponse, item: AltTextInput, model: string): ItemOutcome {
  const r = result.result;
  switch (r.type) {
    case "succeeded": {
      const usage = usageOf(r.message);
      if (r.message.stop_reason === "refusal") return { kind: "failed", reason: "model declined the request", usage };
      if (r.message.stop_reason === "max_tokens") return { kind: "retry", reason: "output cut off at max_tokens", usage };
      const parsed = parseModelText(messageText(r.message));
      if (!parsed.ok) return { kind: "retry", reason: parsed.error, usage };
      return { kind: "draft", draft: toReviewDraft(parsed.answer, item, result.custom_id, r.message.model || model), usage };
    }
    case "errored": {
      const type = r.error?.error?.type ?? "unknown_error";
      const message = r.error?.error?.message ?? "";
      const reason = `errored: ${type}${message ? `: ${message}` : ""}`;
      // An invalid request fails the same way every time, so it is not retried.
      if (type === "invalid_request_error") return { kind: "failed", reason, usage: null };
      return { kind: "retry", reason, usage: null };
    }
    case "canceled":
      return { kind: "retry", reason: "canceled", usage: null };
    case "expired":
      return { kind: "retry", reason: "expired before processing", usage: null };
    default:
      return { kind: "failed", reason: "unknown result type", usage: null };
  }
}
