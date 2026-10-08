// D-09 option C: the merchant gives us a theme zip (Online Store > Themes >
// Download theme file) and uploads the patched zip we return. Works offline.
import { unzipSync, zipSync, type Zippable } from "fflate";
import { DeliveryApiError, PatchConflictError, type Conflict } from "./errors";
import { LIMITS } from "./limits";
import { fileConflict, plansFor, requireNoAltText, sha256Hex, utf8, validatePatch } from "./patch";
import type { DeliveryAdapter, DeliveryPatch, DeliveryPreview, DeliveryReceipt, RevertResult } from "./types";

export interface ThemeFilePreview extends DeliveryPreview {
  route: "theme-file";
  // Folder inside the zip that holds the theme ("" when files sit at the top).
  root: string;
}

export interface ThemeFileReceipt extends DeliveryReceipt {
  route: "theme-file";
  root: string;
  // The patched zip the merchant uploads.
  zip: Uint8Array;
  zipSha256: string;
  // The zip the merchant gave us, kept unchanged so revert is exact.
  originalZip: Uint8Array;
  originalSha256: string;
}

export interface ThemeFileRevert extends RevertResult {
  route: "theme-file";
  // Byte for byte the zip the merchant gave us.
  zip: Uint8Array;
  sha256: string;
}

export interface ThemeFileAdapterOptions {
  now?: () => Date;
  maxZipBytes?: number;
  maxUnzippedBytes?: number;
}

interface OpenTheme {
  root: string;
  // Every zip entry in archive order, directories included.
  entries: [string, Uint8Array][];
  // Theme files by theme-relative path.
  files: Map<string, Uint8Array>;
}

export function findThemeRoot(names: string[]): string {
  if (names.includes("layout/theme.liquid")) return "";
  const roots = names.map((n) => /^([^/]+\/)layout\/theme\.liquid$/.exec(n)?.[1]).filter((r): r is string => !!r);
  if (roots.length === 1) return roots[0];
  throw new DeliveryApiError(
    roots.length ? "The zip holds more than one theme; upload one theme at a time" : "The zip has no layout/theme.liquid, so it is not a Shopify theme",
    "INVALID_ZIP",
  );
}

export class ThemeFileAdapter implements DeliveryAdapter<ThemeFilePreview, ThemeFileReceipt, ThemeFileRevert> {
  readonly route = "theme-file" as const;
  private readonly original: Uint8Array;
  private readonly now: () => Date;
  private readonly maxZipBytes: number;
  private readonly maxUnzippedBytes: number;

  constructor(zip: Uint8Array, opts: ThemeFileAdapterOptions = {}) {
    // A copy, so later changes to the caller's buffer cannot leak in.
    this.original = new Uint8Array(zip);
    this.now = opts.now ?? (() => new Date());
    this.maxZipBytes = opts.maxZipBytes ?? LIMITS.themeZipBytes;
    this.maxUnzippedBytes = opts.maxUnzippedBytes ?? LIMITS.themeUnzippedBytes;
  }

  async preview(patch: DeliveryPatch): Promise<ThemeFilePreview> {
    const theme = this.open(patch, "preview");
    return { route: this.route, patchId: patch.id, root: theme.root, files: plansFor(patch.files), altText: [] };
  }

  async apply(patch: DeliveryPatch): Promise<ThemeFileReceipt> {
    const theme = this.open(patch, "apply");
    const changes = new Map(patch.files.map((c) => [theme.root + c.file, c]));
    const out: Zippable = {};
    for (const [name, data] of theme.entries) {
      const c = changes.get(name);
      out[name] = c ? utf8(c.after) : data;
    }
    for (const c of patch.files) if (c.before === null) out[theme.root + c.file] = utf8(c.after);
    const zip = zipSync(out, { level: 6, mtime: this.now() });
    if (zip.byteLength > this.maxZipBytes) {
      throw new DeliveryApiError(`The patched zip is ${zip.byteLength} bytes; Shopify accepts up to ${this.maxZipBytes}`, "TOO_LARGE");
    }
    return {
      route: this.route,
      patchId: patch.id,
      appliedAt: this.now().toISOString(),
      files: patch.files.map((c) => ({ file: c.file, before: c.before, after: c.after })),
      altText: [],
      root: theme.root,
      zip,
      zipSha256: sha256Hex(zip),
      originalZip: new Uint8Array(this.original),
      originalSha256: sha256Hex(this.original),
    };
  }

  async revert(receipt: ThemeFileReceipt): Promise<ThemeFileRevert> {
    const sha256 = sha256Hex(receipt.originalZip);
    if (sha256 !== receipt.originalSha256) {
      throw new DeliveryApiError("The stored original zip does not match its recorded hash", "VERIFY_FAILED");
    }
    return {
      route: this.route,
      patchId: receipt.patchId,
      revertedAt: this.now().toISOString(),
      files: receipt.files.map((f) => f.file),
      altText: [],
      zip: new Uint8Array(receipt.originalZip),
      sha256,
    };
  }

  private open(patch: DeliveryPatch, stage: "preview" | "apply"): OpenTheme {
    validatePatch(patch);
    requireNoAltText(patch, this.route);
    const theme = this.read();
    const conflicts = patch.files
      .map((c) => fileConflict(c.file, theme.files.get(c.file) ?? null, c.before))
      .filter((c): c is Conflict => c !== null);
    if (conflicts.length) throw new PatchConflictError(stage, conflicts);
    return theme;
  }

  private read(): OpenTheme {
    if (this.original.byteLength > this.maxZipBytes) {
      throw new DeliveryApiError(`The zip is ${this.original.byteLength} bytes; Shopify accepts up to ${this.maxZipBytes}`, "TOO_LARGE");
    }
    let total = 0;
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(this.original, {
        filter: (f) => {
          total += f.originalSize;
          if (total > this.maxUnzippedBytes) throw new DeliveryApiError("The zip unpacks to more than we accept", "TOO_LARGE");
          return true;
        },
      });
    } catch (e) {
      if (e instanceof DeliveryApiError) throw e;
      throw new DeliveryApiError(`Not a readable zip: ${e instanceof Error ? e.message : String(e)}`, "INVALID_ZIP");
    }
    const entries = Object.entries(unzipped);
    const root = findThemeRoot(entries.map(([n]) => n));
    const files = new Map<string, Uint8Array>();
    for (const [name, data] of entries) {
      if (name.startsWith(root) && !name.endsWith("/")) files.set(name.slice(root.length), data);
    }
    return { root, entries, files };
  }
}
