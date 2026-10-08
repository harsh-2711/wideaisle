// D-09 option B: a pull request on a theme connected through Shopify's GitHub
// integration. Shopify syncs the connected branch to the theme, so nothing
// reaches the store until someone merges.
//   preview  reads the branch and checks every before (no writes)
//   apply    commits the patch on a new branch and opens a pull request
//   revert   closes the pull request if it is still open; if it was merged,
//            opens a revert pull request that points each file back at its
//            original blob, so the bytes match exactly
import { createHash } from "node:crypto";
import { DeliveryApiError, PatchConflictError, type Conflict } from "./errors";
import { DEFAULT_RETRY, backoffMs, parseJson, realSleep, retryAfterMs, type FetchLike, type RetryPolicy, type Sleep } from "./http";
import { plansFor, requireNoAltText, utf8, validatePatch } from "./patch";
import type { DeliveryAdapter, DeliveryPatch, DeliveryPreview, DeliveryReceipt, RevertResult, ThemeFileChange } from "./types";

export const GITHUB_API_VERSION = "2022-11-28";

export interface GitHubAdapterOptions {
  owner: string;
  repo: string;
  // The branch Shopify keeps in sync with the theme.
  branch: string;
  token: string;
  fetch: FetchLike;
  apiUrl?: string;
  branchPrefix?: string;
  sleep?: Sleep;
  retry?: Partial<RetryPolicy>;
  random?: () => number;
  now?: () => Date;
}

export interface GitHubPreview extends DeliveryPreview {
  route: "github-pr";
  baseBranch: string;
  baseSha: string;
}

export interface GitHubFileRecord extends ThemeFileChange {
  mode: string;
  // The blob that held `before`. Revert points the file back at it.
  beforeSha: string | null;
}

export interface GitHubReceipt extends DeliveryReceipt {
  route: "github-pr";
  title: string;
  owner: string;
  repo: string;
  baseBranch: string;
  baseSha: string;
  headBranch: string;
  commitSha: string;
  pullNumber: number;
  pullUrl: string;
  files: GitHubFileRecord[];
}

export interface GitHubRevert extends RevertResult {
  route: "github-pr";
  action: "closed-pull-request" | "opened-revert-pull-request" | "already-closed" | "already-reverted";
  pullNumber: number;
  pullUrl: string;
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

interface Base {
  sha: string;
  treeSha: string;
  entries: Map<string, TreeEntry>;
}

interface PullRequest {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged?: boolean;
}

const NAME = /^[A-Za-z0-9_.-]+$/;
const FILE_MODES = new Set(["100644", "100755"]);

// Git's object ID for a blob. SHA-256 repositories use 64-character IDs.
export function gitBlobSha(bytes: Uint8Array, algorithm: "sha1" | "sha256" = "sha1"): string {
  return createHash(algorithm).update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function sameBlob(entrySha: string, text: string): boolean {
  return entrySha === gitBlobSha(utf8(text), entrySha.length === 64 ? "sha256" : "sha1");
}

function refPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

export class GitHubPrAdapter implements DeliveryAdapter<GitHubPreview, GitHubReceipt, GitHubRevert> {
  readonly route = "github-pr" as const;
  private readonly o: GitHubAdapterOptions;
  private readonly apiUrl: string;
  private readonly prefix: string;
  private readonly sleep: Sleep;
  private readonly policy: RetryPolicy;
  private readonly random: () => number;
  private readonly now: () => Date;

  constructor(opts: GitHubAdapterOptions) {
    if (!NAME.test(opts.owner) || !NAME.test(opts.repo)) throw new DeliveryApiError("Owner and repo must be plain GitHub names", "INVALID_REPO");
    if (!opts.branch || opts.branch.includes("..")) throw new DeliveryApiError("A branch name is required", "INVALID_REPO");
    this.o = opts;
    this.apiUrl = (opts.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.prefix = opts.branchPrefix ?? "wide-aisle/";
    this.sleep = opts.sleep ?? realSleep;
    this.policy = { ...DEFAULT_RETRY, ...opts.retry };
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? (() => new Date());
  }

  async preview(patch: DeliveryPatch): Promise<GitHubPreview> {
    validatePatch(patch);
    requireNoAltText(patch, this.route);
    const base = await this.readBase();
    const conflicts = this.conflicts(base, patch.files, "before");
    if (conflicts.length) throw new PatchConflictError("preview", conflicts);
    return { route: this.route, patchId: patch.id, baseBranch: this.o.branch, baseSha: base.sha, files: plansFor(patch.files), altText: [] };
  }

  async apply(patch: DeliveryPatch): Promise<GitHubReceipt> {
    validatePatch(patch);
    requireNoAltText(patch, this.route);
    const base = await this.readBase();
    const conflicts = this.conflicts(base, patch.files, "before");
    if (conflicts.length) throw new PatchConflictError("apply", conflicts);

    const files: GitHubFileRecord[] = [];
    const tree: { path: string; mode: string; type: "blob"; sha: string }[] = [];
    for (const c of patch.files) {
      const entry = base.entries.get(c.file);
      const sha = await this.createBlob(c.after, entry?.sha.length === 64 ? "sha256" : "sha1");
      const mode = entry?.mode ?? "100644";
      tree.push({ path: c.file, mode, type: "blob", sha });
      files.push({ file: c.file, before: c.before, after: c.after, mode, beforeSha: entry?.sha ?? null });
    }
    const message = `${patch.title}\n\nWide Aisle patch ${patch.id}. To undo before merging, close this pull request.`;
    const commitSha = await this.commit(base, tree, message);
    const headBranch = `${this.prefix}${patch.id}`;
    const pull = await this.openPull(headBranch, commitSha, patch.title, this.pullBody(patch.files, patch.id));
    return {
      route: this.route,
      patchId: patch.id,
      title: patch.title,
      appliedAt: this.now().toISOString(),
      owner: this.o.owner,
      repo: this.o.repo,
      baseBranch: this.o.branch,
      baseSha: base.sha,
      headBranch,
      commitSha,
      pullNumber: pull.number,
      pullUrl: pull.html_url,
      files,
      altText: [],
    };
  }

  async revert(receipt: GitHubReceipt): Promise<GitHubRevert> {
    const result = (action: GitHubRevert["action"], pull: PullRequest, files: string[]): GitHubRevert => ({
      route: this.route,
      patchId: receipt.patchId,
      revertedAt: this.now().toISOString(),
      files,
      altText: [],
      action,
      pullNumber: pull.number,
      pullUrl: pull.html_url,
    });
    const pull = (await this.call<PullRequest>("GET", `${this.repoPath()}/pulls/${receipt.pullNumber}`)).data;
    if (pull.state === "open") {
      // Never merged, so the theme never changed. Closing is the whole revert.
      await this.call("PATCH", `${this.repoPath()}/pulls/${receipt.pullNumber}`, { state: "closed" });
      await this.deleteBranch(receipt.headBranch);
      return result("closed-pull-request", pull, receipt.files.map((f) => f.file));
    }
    if (!pull.merged) return result("already-closed", pull, []);

    const base = await this.readBase();
    const restore: GitHubFileRecord[] = [];
    const conflicts: Conflict[] = [];
    for (const f of receipt.files) {
      const entry = base.entries.get(f.file);
      const holds = (text: string | null) => (text === null ? !entry : !!entry && sameBlob(entry.sha, text));
      if (holds(f.after)) restore.push(f);
      else if (!holds(f.before)) conflicts.push({ file: f.file, reason: entry ? "changed" : "missing" });
    }
    if (conflicts.length) throw new PatchConflictError("revert", conflicts);
    if (!restore.length) return result("already-reverted", pull, []);

    // Point each file at its original blob (or delete it), so the bytes are
    // exactly the ones the scan saw.
    const tree = restore.map((f) => ({ path: f.file, mode: f.mode, type: "blob" as const, sha: f.beforeSha }));
    const title = `Revert: ${receipt.title}`;
    const commitSha = await this.commit(base, tree, `${title}\n\nUndoes Wide Aisle patch ${receipt.patchId} (pull request #${receipt.pullNumber}).`);
    const revertPull = await this.openPull(
      `${this.prefix}revert-${receipt.patchId}`,
      commitSha,
      title,
      `Undoes #${receipt.pullNumber}. Each file goes back to the exact bytes it had before.\n\n${restore.map((f) => `- \`${f.file}\``).join("\n")}`,
    );
    return result("opened-revert-pull-request", revertPull, restore.map((f) => f.file));
  }

  private repoPath(): string {
    return `/repos/${this.o.owner}/${this.o.repo}`;
  }

  private pullBody(files: ThemeFileChange[], id: string): string {
    const lines = files.map((c) => `- \`${c.file}\` (${c.before === null ? "new file" : "changed"})`);
    return `Wide Aisle patch ${id}.\n\n${lines.join("\n")}\n\nTo undo before merging, close this pull request. After merging, Wide Aisle can open a revert pull request.`;
  }

  private async readBase(): Promise<Base> {
    const ref = (await this.call<{ object: { sha: string } }>("GET", `${this.repoPath()}/git/ref/heads/${refPath(this.o.branch)}`)).data;
    const commit = (await this.call<{ tree: { sha: string } }>("GET", `${this.repoPath()}/git/commits/${ref.object.sha}`)).data;
    const tree = (await this.call<{ truncated: boolean; tree: TreeEntry[] }>("GET", `${this.repoPath()}/git/trees/${commit.tree.sha}?recursive=1`)).data;
    if (tree.truncated) throw new DeliveryApiError("The repository tree is too large to read in one call", "TREE_TRUNCATED");
    return { sha: ref.object.sha, treeSha: commit.tree.sha, entries: new Map(tree.tree.filter((e) => e.type === "blob").map((e) => [e.path, e])) };
  }

  private conflicts(base: Base, changes: ThemeFileChange[], side: "before" | "after"): Conflict[] {
    const out: Conflict[] = [];
    for (const c of changes) {
      const entry = base.entries.get(c.file);
      const expected = c[side];
      if (expected === null) {
        if (entry) out.push({ file: c.file, reason: "exists" });
      } else if (!entry) out.push({ file: c.file, reason: "missing" });
      else if (!FILE_MODES.has(entry.mode) || !sameBlob(entry.sha, expected)) out.push({ file: c.file, reason: "changed" });
    }
    return out;
  }

  private async createBlob(text: string, algorithm: "sha1" | "sha256"): Promise<string> {
    const bytes = utf8(text);
    const { data } = await this.call<{ sha: string }>("POST", `${this.repoPath()}/git/blobs`, { content: bytes.toString("base64"), encoding: "base64" });
    if (data.sha !== gitBlobSha(bytes, algorithm)) throw new DeliveryApiError("GitHub stored different bytes than we sent", "VERIFY_FAILED", data);
    return data.sha;
  }

  private async commit(base: Base, tree: { path: string; mode: string; type: "blob"; sha: string | null }[], message: string): Promise<string> {
    const newTree = (await this.call<{ sha: string }>("POST", `${this.repoPath()}/git/trees`, { base_tree: base.treeSha, tree })).data;
    const commit = (await this.call<{ sha: string }>("POST", `${this.repoPath()}/git/commits`, { message, tree: newTree.sha, parents: [base.sha] })).data;
    return commit.sha;
  }

  private async openPull(headBranch: string, commitSha: string, title: string, body: string): Promise<PullRequest> {
    await this.call("POST", `${this.repoPath()}/git/refs`, { ref: `refs/heads/${headBranch}`, sha: commitSha });
    try {
      return (await this.call<PullRequest>("POST", `${this.repoPath()}/pulls`, { title, head: headBranch, base: this.o.branch, body })).data;
    } catch (e) {
      // Leave no stray branch behind.
      await this.deleteBranch(headBranch);
      throw e;
    }
  }

  private async deleteBranch(branch: string): Promise<void> {
    // Already gone (404) or protected (422) is not worth failing a revert over.
    await this.call("DELETE", `${this.repoPath()}/git/refs/heads/${refPath(branch)}`).catch((e) => {
      if (!(e instanceof DeliveryApiError && (e.code === "HTTP_404" || e.code === "HTTP_422"))) throw e;
    });
  }

  private async call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.o.fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.o.token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "User-Agent": "wide-aisle",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = parseJson(await res.text()) as T & { message?: string };
      if (res.status >= 200 && res.status < 300) return { status: res.status, data };

      const remaining = res.headers.get("x-ratelimit-remaining");
      const limited = res.status === 429 || (res.status === 403 && (remaining === "0" || res.headers.get("retry-after") !== null));
      if (limited || res.status >= 500) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const wait =
          retryAfterMs(res.headers, () => this.now().getTime()) ??
          (remaining === "0" && reset ? Math.max(0, reset * 1000 - this.now().getTime()) : backoffMs(attempt, this.policy, this.random));
        if (attempt + 1 >= this.policy.maxAttempts || wait > this.policy.maxDelayMs) {
          throw new DeliveryApiError(`GitHub ${method} ${path}: HTTP ${res.status}, retry not possible now`, limited ? "RATE_LIMITED" : `HTTP_${res.status}`, data);
        }
        await this.sleep(wait);
        continue;
      }
      throw new DeliveryApiError(`GitHub ${method} ${path}: HTTP ${res.status} ${data?.message ?? ""}`.trim(), `HTTP_${res.status}`, data);
    }
  }
}
