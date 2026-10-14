// Shared shapes for the three delivery routes in D-09:
//   admin-api   writes theme files through the Admin API (pilots)
//   github-pr   opens a pull request on a GitHub-connected theme (agencies)
//   theme-file  returns a patched theme zip the merchant uploads (fallback)
// Every route previews, applies and reverts the same DeliveryPatch.

export type DeliveryRoute = "admin-api" | "github-pr" | "theme-file";

// One change to one theme file. The field names match the fixer engine's
// Patch and FileResult (file, before, after), so fixer output passes as is.
export interface ThemeFileChange {
  // Theme-relative path, for example "sections/header.liquid".
  file: string;
  // The whole file as the scan saw it. null means the file must not exist yet.
  before: string | null;
  // The whole file after the fix.
  after: string;
}

// One alt-text change on one product image. It needs no theme edit.
export interface AltTextChange {
  productId: string;
  // The image's media ID, for example "gid://shopify/MediaImage/1".
  mediaId: string;
  // Alt text as the scan saw it. An image without alt text has "".
  before: string;
  after: string;
}

export interface DeliveryPatch {
  // Lower case letters, digits and dashes. Used in theme and branch names.
  id: string;
  // One line for the preview theme name, commit message and pull request.
  title: string;
  files: ThemeFileChange[];
  altText: AltTextChange[];
}

export interface FilePlan {
  file: string;
  action: "create" | "update";
  bytesBefore: number;
  bytesAfter: number;
}

export interface DeliveryPreview {
  route: DeliveryRoute;
  patchId: string;
  files: FilePlan[];
  altText: AltTextChange[];
}

// What apply wrote. Revert needs only this.
export interface DeliveryReceipt {
  route: DeliveryRoute;
  patchId: string;
  appliedAt: string;
  files: ThemeFileChange[];
  altText: AltTextChange[];
}

export interface RevertResult {
  route: DeliveryRoute;
  patchId: string;
  revertedAt: string;
  files: string[];
  altText: string[];
}

export interface DeliveryAdapter<
  P extends DeliveryPreview = DeliveryPreview,
  R extends DeliveryReceipt = DeliveryReceipt,
  V extends RevertResult = RevertResult,
> {
  readonly route: DeliveryRoute;
  // Shows the change without touching the live theme. Refuses on conflict.
  preview(patch: DeliveryPatch): Promise<P>;
  // Writes the change. Refuses when any `before` differs from the store.
  apply(patch: DeliveryPatch): Promise<R>;
  // Restores every file and alt text to its exact `before`. Refuses when the
  // merchant changed a file again after apply.
  revert(receipt: R): Promise<V>;
}
