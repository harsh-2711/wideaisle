// Size and count limits the delivery routes check before writing.
// Sources and dates are in docs/spikes/spike-a-delivery.md. Byte limits use
// decimal units (256 KB = 256,000 bytes) so we refuse early rather than late.

export const LIMITS = {
  // themeFilesUpsert: "You can process a maximum of 50 files in a single
  // request." (Admin API 2026-10 schema description.)
  upsertFilesPerCall: 50,
  // Alt text: FilesErrorCode ALT_VALUE_LIMIT_EXCEEDED, "maximum limit of 512
  // characters" (Admin API 2026-10 schema).
  altTextChars: 512,
  // fileUpdate batch size. The schema gives no number; 25 is our own cap.
  altTextPerCall: 25,
  // themeCreate: ZIP_TOO_LARGE, "bigger than 50MB" (Admin API 2026-10 schema).
  // Also the theme upload limit on Shopify's theme limits page (via search).
  themeZipBytes: 50_000_000,
  // Uncompressed bytes we unpack from a merchant's zip, to stop zip bombs.
  themeUnzippedBytes: 300_000_000,
  // GitHub "Get a blob" supports blobs up to 100 MB (GitHub REST description).
  githubBlobBytes: 100_000_000,
} as const;

// Per-file limits from Shopify's theme limits page (via search, not opened).
// Files not listed here have no limit we could confirm, so we do not check.
export function fileSizeLimit(file: string): number | null {
  if (/^(sections|snippets|layout)\/[^/]+\.liquid$/.test(file)) return 256_000;
  if (file === "config/settings_data.json" || /^locales\/[^/]+\.json$/.test(file)) return 1_500_000;
  if (file === "config/settings_schema.json" || /^templates\/(customers\/)?[^/]+\.json$/.test(file)) return 512_000;
  if (/^sections\/[^/]+\.json$/.test(file)) return 512_000;
  return null;
}

// Theme Check does not count bytes inside {% schema %} toward the limit of a
// Liquid file. We do the same so we never refuse a file Shopify accepts.
export function countedBytes(file: string, text: string): number {
  const counted = file.endsWith(".liquid")
    ? text.replace(/(\{%-?\s*schema\s*-?%\})[\s\S]*?(\{%-?\s*endschema\s*-?%\})/g, "$1$2")
    : text;
  return Buffer.byteLength(counted, "utf8");
}

export function fileSizeProblem(file: string, text: string): string | null {
  const limit = fileSizeLimit(file);
  if (limit === null) return null;
  const bytes = countedBytes(file, text);
  return bytes > limit ? `${file} is ${bytes} bytes; Shopify's limit for this file is ${limit}` : null;
}
