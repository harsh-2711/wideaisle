// D-09 option A: write theme files through the Admin GraphQL API.
//   preview  duplicates the live theme as an unpublished theme and writes
//            the patch there, so the merchant can look before anything
//            changes on the live store
//   apply    writes the patch to the live theme (or a chosen theme)
//   revert   writes every original back, byte for byte, and deletes files
//            the patch created
// Alt text goes through fileUpdate and needs no theme edit. Every theme
// write needs write_themes plus an exemption from Shopify (Q-27).
import { DeliveryApiError, PartialApplyError, PatchConflictError, type Conflict } from "./errors";
import { DEFAULT_RETRY, backoffMs, realSleep, type FetchLike, type RetryPolicy, type Sleep } from "./http";
import { LIMITS } from "./limits";
import { chunk, fileConflict, plansFor, utf8, validatePatch } from "./patch";
import type { AdminGraphql } from "./shopify-admin";
import type { AltTextChange, DeliveryAdapter, DeliveryPatch, DeliveryPreview, DeliveryReceipt, RevertResult, ThemeFileChange } from "./types";

// Operations checked against the Admin API 2026-10 schema (see the spike doc).
export const ADMIN_QUERIES = {
  mainTheme: `query WaMainTheme {
  themes(first: 1, roles: [MAIN]) {
    nodes { id name role }
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

export interface AdminApiReceipt extends DeliveryReceipt {
  route: "admin-api";
  shop: string;
  themeId: string | null;
}

export interface AdminApiRevert extends RevertResult {
  route: "admin-api";
  themeId: string | null;
}

export interface AdminApiAdapterOptions {
  client: AdminGraphql;
  shop: string;
  // The theme apply writes to. Default: the live (MAIN) theme.
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

// Codes worth a retry: Shopify says try again later, or the file is busy.
const RETRY_CODES = new Set(["THROTTLED", "FILE_LOCKED", "MEDIA_CANNOT_BE_MODIFIED", "NON_READY_STATE"]);

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
    const altConflicts = await this.altConflicts(patch.altText, "before");
    if (!patch.files.length) {
      if (altConflicts.length) throw new PatchConflictError("preview", altConflicts);
      return { ...base, themeId: null, sourceThemeId: null, themeName: null, previewUrl: null };
    }
    const live = await this.mainTheme();
    const conflicts = [...(await this.fileConflicts(live.id, patch.files, "before")), ...altConflicts];
    if (conflicts.length) throw new PatchConflictError("preview", conflicts);

    const name = previewThemeName(patch);
    const copy = await this.duplicate(live.id, name);
    try {
      await this.waitForTheme(copy.id);
      // The copy is taken after our check, so check it again.
      const again = await this.fileConflicts(copy.id, patch.files, "before");
      if (again.length) throw new PatchConflictError("preview", again);
      await this.writeFiles(copy.id, patch.files.map((c) => ({ file: c.file, text: c.after })));
      await this.verifyFiles(copy.id, patch.files.map((c) => ({ file: c.file, text: c.after })));
    } catch (e) {
      // Leave no half-written preview theme behind.
      await this.deleteTheme(copy.id).catch(() => undefined);
      throw e;
    }
    return {
      ...base,
      themeId: copy.id,
      sourceThemeId: live.id,
      themeName: name,
      previewUrl: `https://${this.shop}/?preview_theme_id=${numericId(copy.id)}`,
    };
  }

  async apply(patch: DeliveryPatch): Promise<AdminApiReceipt> {
    validatePatch(patch);
    const themeId = patch.files.length ? (this.targetThemeId ?? (await this.mainTheme()).id) : null;
    const conflicts = [
      ...(themeId ? await this.fileConflicts(themeId, patch.files, "before") : []),
      ...(await this.altConflicts(patch.altText, "before")),
    ];
    if (conflicts.length) throw new PatchConflictError("apply", conflicts);

    const files: ThemeFileChange[] = [];
    const alts: AltTextChange[] = [];
    try {
      for (const group of chunk(patch.files, this.filesPerCall)) {
        // Count the group before the call: if Shopify wrote part of it, revert
        // must cover it. Revert skips files that still hold their before.
        files.push(...group);
        await this.upsert(themeId as string, group.map((c) => ({ file: c.file, text: c.after })));
      }
      if (themeId) await this.verifyFiles(themeId, patch.files.map((c) => ({ file: c.file, text: c.after })));
      for (const group of chunk(patch.altText, LIMITS.altTextPerCall)) {
        alts.push(...group);
        await this.updateAlt(group.map((a) => ({ id: a.mediaId, alt: a.after })));
      }
    } catch (e) {
      if (files.length || alts.length) throw new PartialApplyError(this.receipt(patch, themeId, files, alts), e);
      throw e;
    }
    return this.receipt(patch, themeId, patch.files, patch.altText);
  }

  async revert(receipt: AdminApiReceipt): Promise<AdminApiRevert> {
    const conflicts: Conflict[] = [];
    const files: ThemeFileChange[] = [];
    if (receipt.files.length) {
      if (!receipt.themeId) throw new DeliveryApiError("The receipt lists files but no theme", "INVALID_RECEIPT");
      const current = await this.readFiles(receipt.themeId, receipt.files.map((c) => c.file));
      for (const c of receipt.files) {
        const now = current.get(c.file) ?? null;
        if (!fileConflict(c.file, now, c.after)) files.push(c);
        else if (fileConflict(c.file, now, c.before)) conflicts.push({ file: c.file, reason: now === null ? "missing" : "changed" });
        // Else the file already holds its before: nothing to do.
      }
    }
    const alts: AltTextChange[] = [];
    if (receipt.altText.length) {
      const current = await this.readAlt(receipt.altText.map((a) => a.mediaId));
      for (const a of receipt.altText) {
        const now = current.get(a.mediaId);
        if (now === undefined) conflicts.push({ mediaId: a.mediaId, reason: "missing" });
        else if (now === a.after) alts.push(a);
        else if (now !== a.before) conflicts.push({ mediaId: a.mediaId, reason: "changed" });
      }
    }
    if (conflicts.length) throw new PatchConflictError("revert", conflicts);

    if (files.length && receipt.themeId) {
      const restore = files.filter((c) => c.before !== null).map((c) => ({ file: c.file, text: c.before as string }));
      const created = files.filter((c) => c.before === null).map((c) => c.file);
      await this.writeFiles(receipt.themeId, restore);
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

  private receipt(patch: DeliveryPatch, themeId: string | null, files: ThemeFileChange[], altText: AltTextChange[]): AdminApiReceipt {
    return {
      route: this.route,
      patchId: patch.id,
      appliedAt: this.now().toISOString(),
      shop: this.shop,
      themeId,
      files: files.map((c) => ({ file: c.file, before: c.before, after: c.after })),
      altText: altText.map((a) => ({ ...a })),
    };
  }

  private async mainTheme(): Promise<ThemeNode> {
    const data = await this.client.request<{ themes: { nodes: ThemeNode[] } }>(ADMIN_QUERIES.mainTheme);
    const main = data.themes.nodes[0];
    if (!main) throw new DeliveryApiError("The store has no published theme", "NO_MAIN_THEME");
    return main;
  }

  private async duplicate(themeId: string, name: string): Promise<ThemeNode> {
    const data = await this.client.request<{ themeDuplicate: { newTheme: ThemeNode | null; userErrors: UserError[] } }>(
      ADMIN_QUERIES.themeDuplicate,
      { id: themeId, name },
    );
    const p = data.themeDuplicate;
    if (p.userErrors.length || !p.newTheme) throw userErrorsToError("themeDuplicate", p.userErrors.length ? p.userErrors : [{ message: "no theme returned" }]);
    return p.newTheme;
  }

  private async deleteTheme(themeId: string): Promise<void> {
    const data = await this.client.request<{ themeDelete: { deletedThemeId: string | null; userErrors: UserError[] } }>(ADMIN_QUERIES.themeDelete, {
      id: themeId,
    });
    if (data.themeDelete.userErrors.length) throw userErrorsToError("themeDelete", data.themeDelete.userErrors);
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
      if (polls + 1 >= this.maxPolls) throw new DeliveryApiError(`Job ${jobId} not done after ${this.maxPolls} checks`, "JOB_TIMEOUT");
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async writeFiles(themeId: string, files: { file: string; text: string }[]): Promise<void> {
    for (const group of chunk(files, this.filesPerCall)) await this.upsert(themeId, group);
  }

  private async upsert(themeId: string, files: { file: string; text: string }[]): Promise<void> {
    const input = files.map((f) => ({ filename: f.file, body: { type: "TEXT", value: f.text } }));
    for (let attempt = 0; ; attempt++) {
      const data = await this.client.request<{
        themeFilesUpsert: { job: { id: string; done: boolean } | null; userErrors: UserError[] };
      }>(ADMIN_QUERIES.filesUpsert, { themeId, files: input });
      const p = data.themeFilesUpsert;
      if (p.userErrors.length) {
        const retry = p.userErrors.every((e) => RETRY_CODES.has(e.code ?? "")) && attempt + 1 < this.policy.maxAttempts;
        if (!retry) throw userErrorsToError("themeFilesUpsert", p.userErrors);
        await this.sleep(backoffMs(attempt, this.policy, this.random));
        continue;
      }
      if (p.job && !p.job.done) await this.waitForJob(p.job.id);
      return;
    }
  }

  private async deleteFiles(themeId: string, files: string[]): Promise<void> {
    for (const group of chunk(files, this.filesPerCall)) {
      const data = await this.client.request<{ themeFilesDelete: { userErrors: UserError[] } }>(ADMIN_QUERIES.filesDelete, { themeId, files: group });
      const errors = data.themeFilesDelete.userErrors.filter((e) => e.code !== "NOT_FOUND");
      if (errors.length) throw userErrorsToError("themeFilesDelete", errors);
    }
  }

  // Current bytes of each file. A missing file is absent from the map.
  private async readFiles(themeId: string, files: string[]): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
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
        for (const node of conn.nodes) out.set(node.filename, await this.bodyBytes(node.filename, node.body));
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
        const res = await this.fetch(body.url, { method: "GET", headers: {} });
        if (res.status !== 200) throw new DeliveryApiError(`Could not download ${file} (HTTP ${res.status})`, `HTTP_${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      }
      default:
        throw new DeliveryApiError(`${file} has a body type we do not read`, "BODY_TYPE");
    }
  }

  private async fileConflicts(themeId: string, changes: ThemeFileChange[], side: "before" | "after"): Promise<Conflict[]> {
    const current = await this.readFiles(themeId, changes.map((c) => c.file));
    return changes.map((c) => fileConflict(c.file, current.get(c.file) ?? null, c[side])).filter((c): c is Conflict => c !== null);
  }

  // Reads the files back and compares bytes. text null means "must be gone".
  private async verifyFiles(themeId: string, expected: { file: string; text: string | null }[]): Promise<void> {
    const current = await this.readFiles(themeId, expected.map((e) => e.file));
    const wrong = expected.filter((e) => fileConflict(e.file, current.get(e.file) ?? null, e.text) !== null).map((e) => e.file);
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

  private async altConflicts(changes: AltTextChange[], side: "before" | "after"): Promise<Conflict[]> {
    if (!changes.length) return [];
    const current = await this.readAlt(changes.map((a) => a.mediaId));
    const conflicts: Conflict[] = [];
    for (const a of changes) {
      const now = current.get(a.mediaId);
      if (now === undefined) conflicts.push({ mediaId: a.mediaId, reason: "missing" });
      else if (now !== a[side]) conflicts.push({ mediaId: a.mediaId, reason: "changed" });
    }
    return conflicts;
  }

  private async updateAlt(items: { id: string; alt: string }[]): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const data = await this.client.request<{ fileUpdate: { files: { id: string; alt: string | null }[] | null; userErrors: UserError[] } }>(
        ADMIN_QUERIES.fileUpdate,
        { files: items },
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
