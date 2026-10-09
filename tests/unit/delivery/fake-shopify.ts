// A small stateful stand-in for the Admin API, for failure paths that
// recorded responses cannot show: jobs that finish later, Shopify changing
// bytes on write, media deleted after apply. It answers the operations in
// ADMIN_QUERIES by name. The recorded fixtures still cover response shapes.
import { createHash } from "node:crypto";
import type { AdminGraphql } from "../../../app/lib/delivery/shopify-admin";

export const LIVE_ID = "gid://shopify/OnlineStoreTheme/1";

interface Theme {
  name: string;
  role: string;
  files: Map<string, Buffer>;
}

export interface FakeHooks {
  // Upsert jobs stay running until finishJobs() is called.
  slowJobs?: boolean;
  // Shopify rewrites bytes on write, for example trimming JSON.
  normalize?: (file: string, bytes: Buffer) => Buffer;
  // Serve bodies as Text, decoded as UTF-8 (lossy for other encodings).
  textBodies?: boolean;
  // fileUpdate answers MEDIA_CANNOT_BE_MODIFIED this many times.
  mediaBusy?: number;
}

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

export class FakeShopify implements AdminGraphql {
  readonly themes = new Map<string, Theme>();
  readonly alt = new Map<string, string>();
  readonly ops: string[] = [];
  private readonly pending: { id: string; run: () => void }[] = [];
  private readonly done = new Set<string>();
  private jobs = 0;
  private nextTheme = 2;

  constructor(
    files: Record<string, string | Buffer>,
    private readonly hooks: FakeHooks = {},
  ) {
    this.themes.set(LIVE_ID, { name: "Dawn", role: "MAIN", files: new Map(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)])) });
  }

  live(file: string): string | undefined {
    return this.themes.get(LIVE_ID)?.files.get(file)?.toString("utf8");
  }

  finishJobs(): void {
    for (const job of this.pending.splice(0)) {
      job.run();
      this.done.add(job.id);
    }
  }

  async request<T>(query: string, v: Record<string, unknown> = {}): Promise<T> {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
    this.ops.push(op);
    return this.answer(op, v as never) as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private answer(op: string, v: any): unknown {
    const theme = (id: string) => this.themes.get(id);
    const node = (id: string, t: Theme) => ({ id, name: t.name, role: t.role, processing: false, processingFailed: false });
    switch (op) {
      case "WaMainTheme":
        return { themes: { nodes: [...this.themes].filter(([, t]) => t.role === "MAIN").map(([id, t]) => node(id, t)) } };
      case "WaThemesByName":
        return { themes: { nodes: [...this.themes].filter(([, t]) => v.names.includes(t.name)).map(([id, t]) => node(id, t)) } };
      case "WaThemeInfo": {
        const t = theme(v.id);
        return { theme: t ? node(v.id, t) : null };
      }
      case "WaThemeDuplicate": {
        const t = theme(v.id);
        if (!t) return { themeDuplicate: { newTheme: null, userErrors: [{ field: ["id"], code: "NOT_FOUND", message: "Theme does not exist" }] } };
        const id = `gid://shopify/OnlineStoreTheme/${this.nextTheme++}`;
        this.themes.set(id, { name: v.name, role: "UNPUBLISHED", files: new Map(t.files) });
        return { themeDuplicate: { newTheme: { id, name: v.name, role: "UNPUBLISHED", processing: false }, userErrors: [] } };
      }
      case "WaThemeDelete":
        this.themes.delete(v.id);
        return { themeDelete: { deletedThemeId: v.id, userErrors: [] } };
      case "WaThemeFiles": {
        const t = theme(v.id);
        if (!t) return { theme: null };
        const nodes = (v.filenames as string[])
          .filter((n) => t.files.has(n))
          .map((n) => {
            const b = t.files.get(n) as Buffer;
            const body = this.hooks.textBodies
              ? { __typename: "OnlineStoreThemeFileBodyText", content: b.toString("utf8") }
              : { __typename: "OnlineStoreThemeFileBodyBase64", contentBase64: b.toString("base64") };
            return { filename: n, checksumMd5: md5(b), size: String(b.length), body };
          });
        const userErrors = (v.filenames as string[]).filter((n) => !t.files.has(n)).map((n) => ({ filename: n, code: "NOT_FOUND" }));
        return { theme: { id: v.id, files: { nodes, userErrors, pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      case "WaThemeFilesUpsert": {
        const t = theme(v.themeId) as Theme;
        const written = (v.files as { filename: string; body: { value: string } }[]).map((f) => {
          const raw = Buffer.from(f.body.value, "utf8");
          return [f.filename, this.hooks.normalize ? this.hooks.normalize(f.filename, raw) : raw] as const;
        });
        const run = () => written.forEach(([n, b]) => t.files.set(n, b));
        const upserted = written.map(([n, b]) => ({ filename: n, checksumMd5: md5(b), size: String(b.length) }));
        if (this.hooks.slowJobs) {
          const id = `gid://shopify/Job/${++this.jobs}`;
          this.pending.push({ id, run });
          return { themeFilesUpsert: { job: { id, done: false }, upsertedThemeFiles: upserted, userErrors: [] } };
        }
        run();
        return { themeFilesUpsert: { job: null, upsertedThemeFiles: upserted, userErrors: [] } };
      }
      case "WaJob":
        return { job: { id: v.id, done: this.done.has(v.id) } };
      case "WaThemeFilesDelete": {
        const t = theme(v.themeId) as Theme;
        for (const n of v.files) t.files.delete(n);
        return { themeFilesDelete: { deletedThemeFiles: v.files.map((filename: string) => ({ filename })), userErrors: [] } };
      }
      case "WaMediaAlt":
        return { nodes: (v.ids as string[]).map((id) => (this.alt.has(id) ? { id, alt: this.alt.get(id) } : null)) };
      case "WaFileUpdate": {
        if (this.hooks.mediaBusy && this.hooks.mediaBusy-- > 0) {
          return { fileUpdate: { files: null, userErrors: [{ field: ["files"], code: "MEDIA_CANNOT_BE_MODIFIED", message: "Media cannot be modified." }] } };
        }
        for (const f of v.files) this.alt.set(f.id, f.alt);
        return { fileUpdate: { files: v.files.map((f: { id: string; alt: string }) => ({ id: f.id, alt: f.alt })), userErrors: [] } };
      }
      default:
        throw new Error(`FakeShopify does not answer ${op}`);
    }
  }
}
