// D-09 option A: write theme files through the Admin GraphQL API.
//   preview  duplicates the live theme (or the theme passed as themeId) as an
//            unpublished theme and writes the patch there, so the merchant
//            can look before anything changes on the live store
//   apply    writes the patch to the live theme (or a chosen theme)
//   revert   writes every original back, byte for byte, and deletes files
//            the patch created; it first waits for any write job from apply
//            that was still running
// Alt text goes through fileUpdate and needs no theme edit. Every theme
// write needs write_themes plus an exemption from Shopify (Q-27).
//
// Shopify has no compare-and-swap for theme files: themeFilesUpsert
// overwrites whatever is there. We check every before just ahead of the
// write and read every file back after it, but an edit that lands between
// the two can still be overwritten.
import { DeliveryApiError, PartialApplyError, PatchConflictError, type Conflict } from "./errors";
import { DEFAULT_RETRY, backoffMs, realSleep, type FetchLike, type RetryPolicy, type Sleep } from "./http";
import { LIMITS } from "./limits";
import { chunk, md5Hex, plansFor, sameBytes, utf8, validatePatch } from "./patch";
import type { AdminGraphql } from "./shopify-admin";
import type { AltTextChange, DeliveryAdapter, DeliveryPatch, DeliveryPreview, DeliveryReceipt, RevertResult, ThemeFileChange } from "./types";

// Operations checked against the Admin API 2026-10 schema (see the spike doc).
export const ADMIN_QUERIES = {
  mainTheme: `query WaMainTheme {
  themes(first: 1, roles: [MAIN]) {
    nodes { id name role }
  }
}`,
  themesByName: `query WaThemesByName($names: [String!]) {
  themes(first: 5, names: $names) {
    nodes { id name role processing }
  }
}`,
  themeInfo: `query WaThemeInfo($id: ID!) {
  theme(id: $id) { id name role processing processingFailed }
}`,
  themeFiles: `query WaThemeFiles($id: ID!, $filenames: [String!]!, $first: Int!, $after: String) {
  theme(id: $id) {
    id
    files(filenames: $filenames, first: $first, after: $after) {
      nodes {
        filename
        checksumMd5
        size
        body {
          __typename
          ... on OnlineStoreThemeFileBodyText { content }
          ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
          ... on OnlineStoreThemeFileBodyUrl { url }
        }
      }
      userErrors { filename code }
      pageInfo { hasNextPage endCursor }
    }
  }
}`,
  themeDuplicate: `mutation WaThemeDuplicate($id: ID!, $name: String) {
  themeDuplicate(id: $id, name: $name) {
    newTheme { id name role processing }
    userErrors { field code message }
  }
}`,
  filesUpsert: `mutation WaThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    job { id done }
    upsertedThemeFiles { filename checksumMd5 size }
    userErrors { field filename code message }
  }
}`,
  filesDelete: `mutation WaThemeFilesDelete($themeId: ID!, $files: [String!]!) {
  themeFilesDelete(themeId: $themeId, files: $files) {
    deletedThemeFiles { filename }
    userErrors { field filename code message }
  }
}`,
  job: `query WaJob($id: ID!) {
  job(id: $id) { id done }
}`,
  themeDelete: `mutation WaThemeDelete($id: ID!) {
  themeDelete(id: $id) {
    deletedThemeId
    userErrors { field code message }
  }
}`,
  mediaAlt: `query WaMediaAlt($ids: [ID!]!) {
  nodes(ids: $ids) {
    id
    ... on MediaImage { alt }
  }
}`,
  fileUpdate: `mutation WaFileUpdate($files: [FileUpdateInput!]!) {
  fileUpdate(files: $files) {
    files { id alt }
    userErrors { field code message }
  }
}`,
} as const;

export const PREVIEW_THEME_PREFIX = "Wide Aisle preview";

export interface AdminApiPreview extends DeliveryPreview {
  route: "admin-api";
  // The unpublished copy that holds the patch. null when the patch has no files.
  themeId: string | null;
  sourceThemeId: string | null;
  themeName: string | null;
  previewUrl: string | null;
}

export interface AdminFileRecord extends ThemeFileChange {
  // The MD5 that themeFilesUpsert returned for our own write
  // (upsertedThemeFiles.checksumMd5), never one read back later. Revert
  // treats a file with this checksum as ours, even if Shopify changed our
  // bytes on write.
  storedMd5: string | null;
}

export interface AdminApiReceipt extends DeliveryReceipt {
  route: "admin-api";
  shop: string;
  themeId: string | null;
  files: AdminFileRecord[];
  // Write jobs from apply not known to have finished. Revert waits for them.
  pendingJobs: string[];
}

export interface AdminApiRevert extends RevertResult {
  route: "admin-api";
  themeId: string | null;
  // Media deleted since apply: nothing left to revert.
  skippedMedia: string[];
}

export interface AdminApiAdapterOptions {
  client: AdminGraphql;
  shop: string;
  // The theme preview copies and apply writes to. Default: the live theme.
  themeId?: string;
  // Reads file bodies Shopify serves as a short-lived URL.
  fetch?: FetchLike;
  sleep?: Sleep;
  pollIntervalMs?: number;
  maxPolls?: number;
  filesPerCall?: number;
  retry?: Partial<RetryPolicy>;
  random?: () => number;
  now?: () => Date;
}

interface UserError {
  field?: string[] | null;
  filename?: string | null;
  code?: string | null;
  message: string;
}

interface ThemeNode {
  id: string;
  name: string;
  role: string;
  processing?: boolean;
  processingFailed?: boolean;
}

interface StoredFile {
  bytes: Uint8Array;
  md5: string;
}

type FileBody =
  | { __typename: "OnlineStoreThemeFileBodyText"; content: string }
  | { __typename: "OnlineStoreThemeFileBodyBase64"; contentBase64: string }
  | { __typename: "OnlineStoreThemeFileBodyUrl"; url: string };

interface ThemeFilesData {
  theme: {
    id: string;
    files: {
      nodes: { filename: string; checksumMd5: string | null; size: string | number; body: FileBody }[];
      userErrors: { filename: string; code: string }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    } | null;
  } | null;
}

// Codes worth a retry: Shopify says try again later, or the file is not
// ready yet. MEDIA_CANNOT_BE_MODIFIED is not here: another operation is
// changing that media, and writing over it could undo the other change.
const RETRY_CODES = new Set(["THROTTLED", "FILE_LOCKED", "NON_READY_STATE"]);
// Writes that are safe to send twice after a 5xx: they set a fixed value.
const IDEMPOTENT = { idempotent: true };

function userErrorsToError(operation: string, errors: UserError[]): DeliveryApiError {
  const code = errors.find((e) => e.code)?.code ?? "USER_ERROR";
  const message = errors.map((e) => (e.filename ? `${e.filename}: ${e.message}` : e.message)).join("; ");
  const hint = code === "ACCESS_DENIED" ? " Theme writes need write_themes and an exemption from Shopify (D-09, Q-27)." : "";
  return new DeliveryApiError(`${operation} failed: ${message}.${hint}`, code, errors);
}

export function numericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

export function previewThemeName(patch: DeliveryPatch): string {
  // Shopify's theme name limit is not in the schema; 50 characters is our guess.
  return `${PREVIEW_THEME_PREFIX} ${patch.id}`.slice(0, 50);
}

const holds = (current: StoredFile | undefined, text: string | null) =>
  text === null ? current === undefined : current !== undefined && sameBytes(current.bytes, utf8(text));

export class AdminApiAdapter implements DeliveryAdapter<AdminApiPreview, AdminApiReceipt, AdminApiRevert> {
  readonly route = "admin-api" as const;
  private readonly client: AdminGraphql;
  private readonly shop: string;
  private readonly targetThemeId?: string;
  private readonly fetch?: FetchLike;
  private readonly sleep: Sleep;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly filesPerCall: number;
  private readonly policy: RetryPolicy;
  private readonly random: () => number;
  private readonly now: () => Date;

  constructor(opts: AdminApiAdapterOptions) {
    this.client = opts.client;
    this.shop = opts.shop;
    this.targetThemeId = opts.themeId;
    this.fetch = opts.fetch;
    this.sleep = opts.sleep ?? realSleep;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1000;
    this.maxPolls = opts.maxPolls ?? 120;
    this.filesPerCall = Math.min(opts.filesPerCall ?? LIMITS.upsertFilesPerCall, LIMITS.upsertFilesPerCall);
    this.policy = { ...DEFAULT_RETRY, ...opts.retry };
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? (() => new Date());
  }

  async preview(patch: DeliveryPatch): Promise<AdminApiPreview> {
    validatePatch(patch);
    const base = { route: this.route, patchId: patch.id, files: plansFor(patch.files), altText: patch.altText };
    const altConflicts = await this.altConflicts(patch.altText);
    if (!patch.files.length) {
      if (altConflicts.length) throw new PatchConflictError("preview", altConflicts);
      return { ...base, themeId: null, sourceThemeId: null, themeName: null, previewUrl: null };
    }
    const sourceId = await this.targetTheme();
    const conflicts = [...(await this.fileConflicts(sourceId, patch.files)), ...altConflicts];
    if (conflicts.length) throw new PatchConflictError("preview", conflicts);

    const name = previewThemeName(patch);
    if ((await this.themesNamed(name)).length) {
      throw new DeliveryApiError(`A theme named "${name}" already exists; discard it before a new preview`, "PREVIEW_EXISTS");
    }
    const copy = await this.duplicate(sourceId, name);
    try {
      await this.waitForTheme(copy.id);
      // The copy is taken after our check, so check it again.
      const again = await this.fileConflicts(copy.id, patch.files);
      if (again.length) throw new PatchConflictError("preview", again);
      await this.writeFiles(copy.id, patch.files.map((c) => ({ file: c.file, text: c.after })), []);
      await this.verifyFiles(copy.id, patch.files.map((c) => ({ file: c.file, text: c.after })));
    } catch (e) {
      // Leave no half-written preview theme behind.
      await this.deleteTheme(copy.id).catch(() => undefined);
      throw e;
    }
    return {
      ...base,
      themeId: copy.id,
      sourceThemeId: sourceId,
      themeName: name,
      previewUrl: `https://${this.shop}/?preview_theme_id=${numericId(copy.id)}`,
    };
  }

  async apply(patch: DeliveryPatch): Promise<AdminApiReceipt> {
    validatePatch(patch);
    const themeId = patch.files.length ? await this.targetTheme() : null;
    const conflicts = [...(themeId ? await this.fileConflicts(themeId, patch.files) : []), ...(await this.altConflicts(patch.altText))];
    if (conflicts.length) throw new PatchConflictError("apply", conflicts);

    const files: ThemeFileChange[] = [];
    const alts: AltTextChange[] = [];
    const stored = new Map<string, string>();
    const pendingJobs: string[] = [];
    const receipt = (f: ThemeFileChange[], a: AltTextChange[]) => this.receipt(patch, themeId, f, a, stored, pendingJobs);
    try {
      for (const group of chunk(patch.files, this.filesPerCall)) {
        // Count the group before the call: if Shopify wrote part of it, revert
        // must cover it. Revert skips files that still hold their before.
        files.push(...group);
        await this.upsert(themeId as string, group.map((c) => ({ file: c.file, text: c.after })), pendingJobs, stored);
      }
      if (themeId) await this.verifyFiles(themeId, patch.files.map((c) => ({ file: c.file, text: c.after })));
      for (const group of chunk(patch.altText, LIMITS.altTextPerCall)) {
        alts.push(...group);
        await this.updateAlt(group.map((a) => ({ id: a.mediaId, alt: a.after })));
      }
    } catch (e) {
      if (files.length || alts.length) throw new PartialApplyError(receipt(files, alts), e);
      throw e;
    }
    return receipt(patch.files, patch.altText);
  }

  async revert(receipt: AdminApiReceipt): Promise<AdminApiRevert> {
    // A write from apply that is still running would land after our revert
    // and put the patch back. Wait for it, or stop before writing anything.
    for (const id of receipt.pendingJobs ?? []) {
      try {
        await this.waitForJob(id);
      } catch (e) {
        if (e instanceof DeliveryApiError && e.code === "JOB_TIMEOUT") {
          throw new DeliveryApiError(`A write from apply is still running (${id}); try the revert again later`, "JOB_PENDING", { jobId: id });
        }
        throw e;
      }
    }

    const conflicts: Conflict[] = [];
    const files: AdminFileRecord[] = [];
    if (receipt.files.length) {
      if (!receipt.themeId) throw new DeliveryApiError("The receipt lists files but no theme", "INVALID_RECEIPT");
      const current = await this.readFiles(receipt.themeId, receipt.files.map((c) => c.file));
      for (const c of receipt.files) {
        const now = current.get(c.file);
        // Ours: the bytes we wrote, or the bytes Shopify said it stored for them.
        const ours = holds(now, c.after) || (!!now && !!c.storedMd5 && now.md5 === c.storedMd5);
        if (ours) files.push(c);
        else if (!holds(now, c.before)) conflicts.push({ file: c.file, reason: now ? "changed" : "missing" });
        // Else the file already holds its before: nothing to do.
      }
    }
    const alts: AltTextChange[] = [];
    const skippedMedia: string[] = [];
    if (receipt.altText.length) {
      const current = await this.readAlt(receipt.altText.map((a) => a.mediaId));
      for (const a of receipt.altText) {
        const now = current.get(a.mediaId);
        // The image was deleted after apply: there is nothing left to revert.
        if (now === undefined) skippedMedia.push(a.mediaId);
        else if (now === a.after) alts.push(a);
        else if (now !== a.before) conflicts.push({ mediaId: a.mediaId, reason: "changed" });
      }
    }
    if (conflicts.length) throw new PatchConflictError("revert", conflicts);

    if (files.length && receipt.themeId) {
      const restore = files.filter((c) => c.before !== null).map((c) => ({ file: c.file, text: c.before as string }));
      const created = files.filter((c) => c.before === null).map((c) => c.file);
      await this.writeFiles(receipt.themeId, restore, []);
      if (created.length) await this.deleteFiles(receipt.themeId, created);
      await this.verifyFiles(receipt.themeId, files.map((c) => ({ file: c.file, text: c.before })));
    }
    for (const group of chunk(alts, LIMITS.altTextPerCall)) {
      await this.updateAlt(group.map((a) => ({ id: a.mediaId, alt: a.before })));
    }
    return {
      route: this.route,
      patchId: receipt.patchId,
      revertedAt: this.now().toISOString(),
      themeId: receipt.themeId,
      files: files.map((c) => c.file),
      altText: alts.map((a) => a.mediaId),
      skippedMedia,
    };
  }

  // Deletes a preview theme this adapter made. Refuses any other theme.
  async discardPreview(themeId: string): Promise<void> {
    const data = await this.client.request<{ theme: ThemeNode | null }>(ADMIN_QUERIES.themeInfo, { id: themeId });
    if (!data.theme) return;
    if (data.theme.role === "MAIN" || !data.theme.name.startsWith(PREVIEW_THEME_PREFIX)) {
      throw new DeliveryApiError(`Refusing to delete "${data.theme.name}" (${data.theme.role}); it is not a Wide Aisle preview`, "NOT_A_PREVIEW");
    }
    await this.deleteTheme(themeId);
  }

  private receipt(
    patch: DeliveryPatch,
    themeId: string | null,
    files: ThemeFileChange[],
    altText: AltTextChange[],
    stored: Map<string, string>,
    pendingJobs: string[],
  ): AdminApiReceipt {
    return {
      route: this.route,
      patchId: patch.id,
      appliedAt: this.now().toISOString(),
      shop: this.shop,
      themeId,
      files: files.map((c) => ({ file: c.file, before: c.before, after: c.after, storedMd5: stored.get(c.file) ?? null })),
      altText: altText.map((a) => ({ ...a })),
      pendingJobs: [...pendingJobs],
    };
  }

  private async targetTheme(): Promise<string> {
    if (this.targetThemeId) return this.targetThemeId;
    const data = await this.client.request<{ themes: { nodes: ThemeNode[] } }>(ADMIN_QUERIES.mainTheme);
    const main = data.themes.nodes[0];
    if (!main) throw new DeliveryApiError("The store has no published theme", "NO_MAIN_THEME");
    return main.id;
  }

  private async themesNamed(name: string): Promise<ThemeNode[]> {
    const data = await this.client.request<{ themes: { nodes: ThemeNode[] } }>(ADMIN_QUERIES.themesByName, { names: [name] });
    // `names` treats * as a wildcard; our names have none, but match exactly anyway.
    return data.themes.nodes.filter((t) => t.name === name);
  }

  private async duplicate(themeId: string, name: string): Promise<ThemeNode> {
    let data: { themeDuplicate: { newTheme: ThemeNode | null; userErrors: UserError[] } };
    try {
      // Never resent after a 5xx: a second call would make a second copy.
      data = await this.client.request(ADMIN_QUERIES.themeDuplicate, { id: themeId, name });
    } catch (e) {
      if (e instanceof DeliveryApiError && e.code.startsWith("HTTP_5")) {
        // The call may have run. Look for the copy by its name instead.
        const found = await this.themesNamed(name);
        if (found.length === 1) return found[0];
      }
      throw e;
    }
    const p = data.themeDuplicate;
    if (p.userErrors.length || !p.newTheme) throw userErrorsToError("themeDuplicate", p.userErrors.length ? p.userErrors : [{ message: "no theme returned" }]);
    return p.newTheme;
  }

  private async deleteTheme(themeId: string): Promise<void> {
    const data = await this.client.request<{ themeDelete: { deletedThemeId: string | null; userErrors: UserError[] } }>(
      ADMIN_QUERIES.themeDelete,
      { id: themeId },
      IDEMPOTENT,
    );
    const errors = data.themeDelete.userErrors.filter((e) => e.code !== "NOT_FOUND");
    if (errors.length) throw userErrorsToError("themeDelete", errors);
  }

  private async waitForTheme(themeId: string): Promise<void> {
    for (let polls = 0; ; polls++) {
      const data = await this.client.request<{ theme: ThemeNode | null }>(ADMIN_QUERIES.themeInfo, { id: themeId });
      if (!data.theme) throw new DeliveryApiError(`Theme ${themeId} not found`, "NOT_FOUND");
      if (data.theme.processingFailed) throw new DeliveryApiError(`Shopify could not finish copying theme ${themeId}`, "THEME_PROCESSING_FAILED");
      if (!data.theme.processing) return;
      if (polls + 1 >= this.maxPolls) throw new DeliveryApiError(`Theme ${themeId} still processing after ${this.maxPolls} checks`, "THEME_TIMEOUT");
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async waitForJob(jobId: string): Promise<void> {
    for (let polls = 0; ; polls++) {
      const data = await this.client.request<{ job: { id: string; done: boolean } | null }>(ADMIN_QUERIES.job, { id: jobId });
      // A job Shopify no longer knows is finished; verifyFiles checks the result.
      if (!data.job || data.job.done) return;
      if (polls + 1 >= this.maxPolls) throw new DeliveryApiError(`Job ${jobId} not done after ${this.maxPolls} checks`, "JOB_TIMEOUT", { jobId });
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async writeFiles(themeId: string, files: { file: string; text: string }[], pendingJobs: string[]): Promise<void> {
    for (const group of chunk(files, this.filesPerCall)) await this.upsert(themeId, group, pendingJobs);
  }

  // Writes one batch and waits for its job. A job still running is left in
  // pendingJobs; checksums Shopify reports go into `stored`.
  private async upsert(themeId: string, files: { file: string; text: string }[], pendingJobs: string[], stored?: Map<string, string>): Promise<void> {
    const input = files.map((f) => ({ filename: f.file, body: { type: "TEXT", value: f.text } }));
    for (let attempt = 0; ; attempt++) {
      const data = await this.client.request<{
        themeFilesUpsert: {
          job: { id: string; done: boolean } | null;
          upsertedThemeFiles: { filename: string; checksumMd5: string | null }[] | null;
          userErrors: UserError[];
        };
      }>(ADMIN_QUERIES.filesUpsert, { themeId, files: input }, IDEMPOTENT);
      const p = data.themeFilesUpsert;
      if (p.userErrors.length) {
        const retry = p.userErrors.every((e) => RETRY_CODES.has(e.code ?? "")) && attempt + 1 < this.policy.maxAttempts;
        if (!retry) throw userErrorsToError("themeFilesUpsert", p.userErrors);
        await this.sleep(backoffMs(attempt, this.policy, this.random));
        continue;
      }
      for (const f of p.upsertedThemeFiles ?? []) if (f.checksumMd5) stored?.set(f.filename, f.checksumMd5.toLowerCase());
      if (p.job && !p.job.done) {
        pendingJobs.push(p.job.id);
        await this.waitForJob(p.job.id);
        pendingJobs.splice(pendingJobs.indexOf(p.job.id), 1);
      }
      return;
    }
  }

  private async deleteFiles(themeId: string, files: string[]): Promise<void> {
    for (const group of chunk(files, this.filesPerCall)) {
      const data = await this.client.request<{ themeFilesDelete: { userErrors: UserError[] } }>(
        ADMIN_QUERIES.filesDelete,
        { themeId, files: group },
        IDEMPOTENT,
      );
      const errors = data.themeFilesDelete.userErrors.filter((e) => e.code !== "NOT_FOUND");
      if (errors.length) throw userErrorsToError("themeFilesDelete", errors);
    }
  }

  // Current bytes and MD5 of each file. A missing file is absent from the map.
  // Refuses when the bytes do not match the checksum Shopify sent with them,
  // for example a non-UTF-8 file served as a Text body.
  private async readFiles(themeId: string, files: string[]): Promise<Map<string, StoredFile>> {
    const out = new Map<string, StoredFile>();
    for (const group of chunk(files, LIMITS.upsertFilesPerCall)) {
      let after: string | null = null;
      do {
        const data: ThemeFilesData = await this.client.request<ThemeFilesData>(ADMIN_QUERIES.themeFiles, {
          id: themeId,
          filenames: group,
          first: group.length,
          after,
        });
        if (!data.theme?.files) throw new DeliveryApiError(`Theme ${themeId} not found`, "NOT_FOUND");
        const conn = data.theme.files;
        const errors = conn.userErrors.filter((e) => e.code !== "NOT_FOUND");
        if (errors.length) {
          throw new DeliveryApiError(`Could not read ${errors.map((e) => `${e.filename} (${e.code})`).join(", ")}`, errors[0].code, errors);
        }
        for (const node of conn.nodes) {
          const bytes = await this.bodyBytes(node.filename, node.body);
          const md5 = md5Hex(bytes);
          if (node.checksumMd5 && node.checksumMd5.toLowerCase() !== md5) {
            throw new DeliveryApiError(
              `${node.filename}: the bytes Shopify sent do not match its checksum, so we cannot compare or restore them exactly`,
              "CHECKSUM_MISMATCH",
              { file: node.filename, expected: node.checksumMd5, actual: md5 },
            );
          }
          out.set(node.filename, { bytes, md5 });
        }
        after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
      } while (after);
    }
    return out;
  }

  private async bodyBytes(file: string, body: FileBody): Promise<Uint8Array> {
    switch (body.__typename) {
      case "OnlineStoreThemeFileBodyText":
        return utf8(body.content);
      case "OnlineStoreThemeFileBodyBase64":
        return Buffer.from(body.contentBase64, "base64");
      case "OnlineStoreThemeFileBodyUrl": {
        if (!this.fetch) throw new DeliveryApiError(`${file} is served as a URL; pass fetch to read it`, "BODY_URL");
        if (!body.url.startsWith("https://")) throw new DeliveryApiError(`${file} is served from a URL that is not https`, "BODY_URL");
        const res = await this.fetch(body.url, { method: "GET", headers: {} });
        if (res.status !== 200) throw new DeliveryApiError(`Could not download ${file} (HTTP ${res.status})`, `HTTP_${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      }
      default:
        throw new DeliveryApiError(`${file} has a body type we do not read`, "BODY_TYPE");
    }
  }

  private async fileConflicts(themeId: string, changes: ThemeFileChange[]): Promise<Conflict[]> {
    const current = await this.readFiles(themeId, changes.map((c) => c.file));
    const out: Conflict[] = [];
    for (const c of changes) {
      const now = current.get(c.file);
      if (holds(now, c.before)) continue;
      out.push({ file: c.file, reason: c.before === null ? "exists" : now ? "changed" : "missing" });
    }
    return out;
  }

  // Reads the files back and compares bytes. text null means "must be gone".
  // It never records what it reads as ours: someone else may have written
  // the file since our write. Only our write's own response does that.
  private async verifyFiles(themeId: string, expected: { file: string; text: string | null }[]): Promise<void> {
    const current = await this.readFiles(themeId, expected.map((e) => e.file));
    const wrong = expected.filter((e) => !holds(current.get(e.file), e.text)).map((e) => e.file);
    if (wrong.length) throw new DeliveryApiError(`Shopify holds different bytes than we wrote for ${wrong.join(", ")}`, "VERIFY_FAILED", wrong);
  }

  // Current alt text by media ID. Missing media are absent. No alt reads as "".
  private async readAlt(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const group of chunk(ids, LIMITS.altTextPerCall)) {
      const data = await this.client.request<{ nodes: ({ id: string; alt?: string | null } | null)[] }>(ADMIN_QUERIES.mediaAlt, { ids: group });
      for (const node of data.nodes) if (node && "alt" in node) out.set(node.id, node.alt ?? "");
    }
    return out;
  }

  private async altConflicts(changes: AltTextChange[]): Promise<Conflict[]> {
    if (!changes.length) return [];
    const current = await this.readAlt(changes.map((a) => a.mediaId));
    const conflicts: Conflict[] = [];
    for (const a of changes) {
      const now = current.get(a.mediaId);
      if (now === undefined) conflicts.push({ mediaId: a.mediaId, reason: "missing" });
      else if (now !== a.before) conflicts.push({ mediaId: a.mediaId, reason: "changed" });
    }
    return conflicts;
  }

  private async updateAlt(items: { id: string; alt: string }[]): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const data = await this.client.request<{ fileUpdate: { files: { id: string; alt: string | null }[] | null; userErrors: UserError[] } }>(
        ADMIN_QUERIES.fileUpdate,
        { files: items },
        IDEMPOTENT,
      );
      const p = data.fileUpdate;
      if (p.userErrors.length) {
        const retry = p.userErrors.every((e) => RETRY_CODES.has(e.code ?? "")) && attempt + 1 < this.policy.maxAttempts;
        if (!retry) throw userErrorsToError("fileUpdate", p.userErrors);
        await this.sleep(backoffMs(attempt, this.policy, this.random));
        continue;
      }
      const got = new Map((p.files ?? []).map((f) => [f.id, f.alt ?? ""]));
      const wrong = items.filter((i) => got.get(i.id) !== i.alt).map((i) => i.id);
      if (wrong.length) throw new DeliveryApiError(`Alt text did not stick for ${wrong.join(", ")}`, "VERIFY_FAILED", wrong);
      return;
    }
  }
}
