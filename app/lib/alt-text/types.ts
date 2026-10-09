// Shapes shared by the alt-text batch client, its CLI and the rating sheet.

/** One product image to draft alt text for. */
export interface AltTextInput {
  productId: string;
  mediaId: string;
  imageUrl: string;
  productTitle: string;
  productType?: string;
  existingAlt?: string;
  /** BCP 47 tag, for example "en" or "de-DE". Defaults to "en". */
  locale?: string;
}

export type Confidence = "high" | "medium" | "low";

/** What the model returns, after validation. */
export interface ModelAnswer {
  alt: string;
  decorative: boolean;
  needsReview: boolean;
  confidence: Confidence;
  reviewNote: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * One row of the merchant review queue. Nothing here is written to a store:
 * merchants approve alt text before it is published (D-11).
 */
export interface ReviewDraft {
  mediaId: string;
  productId: string;
  imageUrl: string;
  productTitle: string;
  locale: string;
  /** The proposed alt text. An empty string means "decorative: use empty alt". */
  draft: string;
  needsReview: boolean;
  confidence: Confidence;
  decorative: boolean;
  /** Why a person should check this draft. Empty when nothing was flagged. */
  reason: string;
  customId: string;
  model: string;
}

/** How one batch result ended for one image. */
export type ItemOutcome =
  | { kind: "draft"; draft: ReviewDraft; usage: TokenUsage | null }
  | { kind: "retry"; reason: string; usage: TokenUsage | null }
  | { kind: "failed"; reason: string; usage: TokenUsage | null };

/**
 * An image that has no draft at the end of a run. It keeps every input
 * field, so a retry file can be passed back to the CLI as input.
 */
export interface UnfinishedItem extends AltTextInput {
  customId: string;
  attempts: number;
  reason: string;
}
