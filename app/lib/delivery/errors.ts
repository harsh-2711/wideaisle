import type { DeliveryReceipt } from "./types";

export type ConflictReason =
  // The file or alt text differs from the patch's expectation.
  | "changed"
  // The patch expects a file that is not there.
  | "missing"
  // The patch creates a file that already exists.
  | "exists";

export interface Conflict {
  file?: string;
  mediaId?: string;
  reason: ConflictReason;
}

// The store no longer matches the patch. Nothing was written.
export class PatchConflictError extends Error {
  readonly conflicts: Conflict[];
  readonly stage: "preview" | "apply" | "revert";

  constructor(stage: "preview" | "apply" | "revert", conflicts: Conflict[]) {
    const list = conflicts.map((c) => `${c.file ?? c.mediaId} (${c.reason})`).join(", ");
    super(
      stage === "revert"
        ? `Refusing to revert: changed since the fix was applied: ${list}`
        : `Refusing to ${stage}: changed since the scan: ${list}`,
    );
    this.name = "PatchConflictError";
    this.stage = stage;
    this.conflicts = conflicts;
  }
}

// The patch itself is malformed. Nothing was read or written.
export class InvalidPatchError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid patch: ${problems.join("; ")}`);
    this.name = "InvalidPatchError";
    this.problems = problems;
  }
}

// A remote API refused or failed. `code` is the API's error code when it has
// one (ACCESS_DENIED, THROTTLED, NOT_FOUND), else our own (HTTP_500,
// JOB_TIMEOUT, VERIFY_FAILED, TOO_LARGE).
export class DeliveryApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "DeliveryApiError";
    this.code = code;
    this.details = details;
  }
}

// Some writes landed before a later one failed. `receipt` lists exactly what
// was written, so revert can undo it.
export class PartialApplyError extends Error {
  readonly receipt: DeliveryReceipt;
  readonly cause: unknown;

  constructor(receipt: DeliveryReceipt, cause: unknown) {
    super(`Apply stopped part way: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PartialApplyError";
    this.receipt = receipt;
    this.cause = cause;
  }
}
