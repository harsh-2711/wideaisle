import { describe, expect, it } from "vitest";
import { InvalidPatchError, PatchConflictError } from "../../../app/lib/delivery/errors";
import { GitHubPrAdapter, gitBlobSha, type GitHubAdapterOptions, type GitHubReceipt } from "../../../app/lib/delivery/github";
import { utf8 } from "../../../app/lib/delivery/patch";
import { CSS_AFTER, CSS_BEFORE, FIXED_NOW, HEADER_AFTER, HEADER_BEFORE, NEW_SNIPPET, fixture, replay, samplePatch, type Exchange } from "./helpers";

const R = "/repos/acme-agency/acme-dawn-theme";
const BASE = "6dcb09b5b57875f334f61aebed695e2e4193db5e";
const TREE = "9fb037999f264ba9a7fc6274d15fa3ae2ab98312";
const MERGE = "e5bd3914e2e596debea16f433f57875b5b90bcd6";
const MERGED_TREE = "cd8274d15fa3ae2ab983129fb037999f264ba9a7";
const SNIPPET = "snippets/wa-visually-hidden.liquid";
const f = (name: string) => fixture(`github/${name}.json`);

const readBase: Exchange[] = [
  { op: `GET ${R}/git/ref/heads/main`, body: f("get-ref") },
  { op: `GET ${R}/git/commits/${BASE}`, body: f("get-commit") },
  { op: `GET ${R}/git/trees/${TREE}?recursive=1`, body: f("get-tree") },
];

const readMerged = (tree = "get-tree-merged"): Exchange[] => [
  { op: `GET ${R}/git/ref/heads/main`, body: f("get-ref-merged") },
  { op: `GET ${R}/git/commits/${MERGE}`, body: f("get-commit-merged") },
  { op: `GET ${R}/git/trees/${MERGED_TREE}?recursive=1`, body: f(tree) },
];

const REVERT_LOOKUP = `GET ${R}/pulls?state=open&head=acme-agency%3Awide-aisle%2Frevert-p-001-abc123`;
const NO_OPEN_REVERT: Exchange = { op: REVERT_LOOKUP, body: f("list-pulls-none") };

const blob = (text: string, name: string): Exchange => ({
  op: `POST ${R}/git/blobs`,
  status: 201,
  body: f(name),
  check: (b) => expect(b).toEqual({ content: utf8(text).toString("base64"), encoding: "base64" }),
});

function setup(exchanges: Exchange[], opts: Partial<GitHubAdapterOptions> = {}) {
  const r = replay(exchanges);
  const sleeps: number[] = [];
  const adapter = new GitHubPrAdapter({
    owner: "acme-agency",
    repo: "acme-dawn-theme",
    branch: "main",
    token: "ghs_test",
    fetch: r.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    now: FIXED_NOW,
    suffix: () => "abc123",
    ...opts,
  });
  return { ...r, sleeps, adapter };
}

const writes = (calls: { init: { method: string } }[]) => calls.filter((c) => c.init.method !== "GET");

function receipt(): GitHubReceipt {
  return {
    route: "github-pr",
    patchId: "p-001",
    title: samplePatch().title,
    appliedAt: FIXED_NOW().toISOString(),
    owner: "acme-agency",
    repo: "acme-dawn-theme",
    baseBranch: "main",
    baseSha: BASE,
    headBranch: "wide-aisle/p-001-abc123",
    branchSuffix: "abc123",
    commitSha: "7638417db6d59f3c431d3e1f261cc637155684cd",
    pullNumber: 42,
    pullUrl: "https://github.com/acme-agency/acme-dawn-theme/pull/42",
    files: [
      { file: "sections/header.liquid", before: HEADER_BEFORE, after: HEADER_AFTER, mode: "100644", beforeSha: "ea1611e0aeb27442bb53438910f2a6ea29951213" },
      { file: "assets/base.css", before: CSS_BEFORE, after: CSS_AFTER, mode: "100644", beforeSha: "c71d39301973d4d4d426f1e38fe03ecadb36fbfe" },
      { file: SNIPPET, before: null, after: NEW_SNIPPET, mode: "100644", beforeSha: null },
    ],
    altText: [],
  };
}

describe("gitBlobSha", () => {
  it("matches git's object IDs", () => {
    expect(gitBlobSha(utf8("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(gitBlobSha(utf8(HEADER_BEFORE))).toBe("ea1611e0aeb27442bb53438910f2a6ea29951213");
    expect(gitBlobSha(utf8("hello\n"), "sha256")).toHaveLength(64);
  });
});

describe("GitHubPrAdapter", () => {
  it("previews by reading the branch, with no writes", async () => {
    const t = setup(readBase);
    const p = await t.adapter.preview(samplePatch());
    expect(p).toMatchObject({ route: "github-pr", baseBranch: "main", baseSha: BASE });
    expect(p.files.map((x) => x.action)).toEqual(["update", "update", "create"]);
    expect(writes(t.calls)).toEqual([]);
    expect(t.calls[0].url).toBe(`https://api.github.com${R}/git/ref/heads/main`);
    expect(t.calls[0].init.headers).toMatchObject({ Authorization: "Bearer ghs_test", "X-GitHub-Api-Version": "2022-11-28" });
  });

  it("commits the patch on a new branch and opens a pull request", async () => {
    const patch = samplePatch();
    const t = setup([
      ...readBase,
      blob(HEADER_AFTER, "create-blob-header"),
      blob(CSS_AFTER, "create-blob-css"),
      blob(NEW_SNIPPET, "create-blob-snippet"),
      {
        op: `POST ${R}/git/trees`,
        status: 201,
        body: f("create-tree"),
        check: (b) =>
          expect(b).toEqual({
            base_tree: TREE,
            tree: [
              { path: "sections/header.liquid", mode: "100644", type: "blob", sha: "9210831b35090c9eb3a32398a04ac160a78c056e" },
              { path: "assets/base.css", mode: "100644", type: "blob", sha: "cf14829c6394828870684e5aa8da6060a3214a22" },
              { path: SNIPPET, mode: "100644", type: "blob", sha: "ba61db91a4d59ed202aa73be2fda4407af94d3a8" },
            ],
          }),
      },
      {
        op: `POST ${R}/git/commits`,
        status: 201,
        body: f("create-commit"),
        check: (b) => expect(b).toMatchObject({ tree: MERGED_TREE, parents: [BASE] }),
      },
      {
        op: `POST ${R}/git/refs`,
        status: 201,
        body: f("create-ref"),
        check: (b) => expect(b).toEqual({ ref: "refs/heads/wide-aisle/p-001-abc123", sha: "7638417db6d59f3c431d3e1f261cc637155684cd" }),
      },
      {
        op: `POST ${R}/pulls`,
        status: 201,
        body: f("create-pull"),
        check: (b) => expect(b).toMatchObject({ title: patch.title, head: "wide-aisle/p-001-abc123", base: "main", body: expect.stringContaining(SNIPPET) }),
      },
    ]);
    const r = await t.adapter.apply(patch);
    expect(r).toEqual(receipt());
    expect(t.left()).toEqual([]);
  });

  it("refuses to apply when the branch changed since the scan", async () => {
    const t = setup([readBase[0], readBase[1], { op: `GET ${R}/git/trees/${TREE}?recursive=1`, body: f("get-tree-merchant-edited") }]);
    const err = await t.adapter.apply(samplePatch()).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect(err.conflicts).toEqual([{ file: "sections/header.liquid", reason: "changed" }]);
    expect(writes(t.calls)).toEqual([]);
    const t2 = setup([readBase[0], readBase[1], { op: `GET ${R}/git/trees/${TREE}?recursive=1`, body: f("get-tree-merchant-edited") }]);
    await expect(t2.adapter.preview(samplePatch())).rejects.toBeInstanceOf(PatchConflictError);
  });

  it("stops when GitHub stores a blob with a different ID", async () => {
    const t = setup([...readBase, { op: `POST ${R}/git/blobs`, status: 201, body: f("create-blob-css") }]);
    await expect(t.adapter.apply(samplePatch())).rejects.toMatchObject({ code: "VERIFY_FAILED" });
  });

  it("deletes the new branch when the pull request cannot be opened", async () => {
    const t = setup([
      ...readBase,
      blob(HEADER_AFTER, "create-blob-header"),
      blob(CSS_AFTER, "create-blob-css"),
      blob(NEW_SNIPPET, "create-blob-snippet"),
      { op: `POST ${R}/git/trees`, status: 201, body: f("create-tree") },
      { op: `POST ${R}/git/commits`, status: 201, body: f("create-commit") },
      { op: `POST ${R}/git/refs`, status: 201, body: f("create-ref") },
      { op: `POST ${R}/pulls`, status: 422, body: f("pull-exists") },
      { op: `DELETE ${R}/git/refs/heads/wide-aisle/p-001-abc123`, status: 204 },
    ]);
    await expect(t.adapter.apply(samplePatch())).rejects.toMatchObject({ code: "HTTP_422", message: /Validation Failed/ });
    expect(t.left()).toEqual([]);
  });

  it("reports a branch that already exists", async () => {
    const t = setup([
      ...readBase,
      blob(HEADER_AFTER, "create-blob-header"),
      blob(CSS_AFTER, "create-blob-css"),
      blob(NEW_SNIPPET, "create-blob-snippet"),
      { op: `POST ${R}/git/trees`, status: 201, body: f("create-tree") },
      { op: `POST ${R}/git/commits`, status: 201, body: f("create-commit") },
      { op: `POST ${R}/git/refs`, status: 422, body: f("ref-exists") },
    ]);
    await expect(t.adapter.apply(samplePatch())).rejects.toMatchObject({ code: "HTTP_422", message: /Reference already exists/ });
    expect(t.calls.some((c) => c.op === `POST ${R}/pulls`)).toBe(false);
  });

  it("reverts an open pull request by closing it and deleting its branch", async () => {
    const t = setup([
      { op: `GET ${R}/pulls/42`, body: f("create-pull") },
      { op: `PATCH ${R}/pulls/42`, body: f("update-pull-closed"), check: (b) => expect(b).toEqual({ state: "closed" }) },
      { op: `DELETE ${R}/git/refs/heads/wide-aisle/p-001-abc123`, status: 204 },
    ]);
    const r = await t.adapter.revert(receipt());
    expect(r).toMatchObject({ action: "closed-pull-request", pullNumber: 42 });
    expect(t.left()).toEqual([]);
  });

  it("reverts a merged pull request by pointing each file back at its original blob", async () => {
    const t = setup([
      { op: `GET ${R}/pulls/42`, body: f("get-pull-merged") },
      NO_OPEN_REVERT,
      ...readMerged(),
      {
        op: `POST ${R}/git/trees`,
        status: 201,
        body: f("create-tree-revert"),
        check: (b) =>
          expect(b).toEqual({
            base_tree: MERGED_TREE,
            tree: [
              // The blob IDs of the exact before bytes: byte-for-byte restore.
              { path: "sections/header.liquid", mode: "100644", type: "blob", sha: gitBlobSha(utf8(HEADER_BEFORE)) },
              { path: "assets/base.css", mode: "100644", type: "blob", sha: gitBlobSha(utf8(CSS_BEFORE)) },
              // Created by the patch, so removed.
              { path: SNIPPET, mode: "100644", type: "blob", sha: null },
            ],
          }),
      },
      { op: `POST ${R}/git/commits`, status: 201, body: f("create-commit-revert"), check: (b) => expect(b).toMatchObject({ parents: [MERGE] }) },
      {
        op: `POST ${R}/git/refs`,
        status: 201,
        body: f("create-ref-revert"),
        check: (b) => expect(b).toMatchObject({ ref: "refs/heads/wide-aisle/revert-p-001-abc123" }),
      },
      {
        op: `POST ${R}/pulls`,
        status: 201,
        body: f("create-pull-revert"),
        check: (b) => expect(b).toMatchObject({ title: `Revert: ${samplePatch().title}`, base: "main" }),
      },
    ]);
    const r = await t.adapter.revert(receipt());
    expect(r).toMatchObject({ action: "opened-revert-pull-request", pullNumber: 43, files: ["sections/header.liquid", "assets/base.css", SNIPPET] });
    expect(t.left()).toEqual([]);
  });

  it("refuses to revert a merged patch the merchant edited afterwards", async () => {
    const t = setup([{ op: `GET ${R}/pulls/42`, body: f("get-pull-merged") }, NO_OPEN_REVERT, ...readMerged("get-tree-merchant-edited")]);
    const err = await t.adapter.revert(receipt()).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect(err.conflicts).toEqual([{ file: "sections/header.liquid", reason: "changed" }]);
    expect(writes(t.calls)).toEqual([]);
  });

  it("does nothing for a pull request closed without merging", async () => {
    const t = setup([{ op: `GET ${R}/pulls/42`, body: f("update-pull-closed") }]);
    await expect(t.adapter.revert(receipt())).resolves.toMatchObject({ action: "already-closed", files: [] });
  });

  it("waits out secondary and primary rate limits, and 5xx", async () => {
    const reset = Math.floor(FIXED_NOW().getTime() / 1000) + 10;
    const t = setup([
      { op: `GET ${R}/git/ref/heads/main`, status: 403, headers: { "retry-after": "3" }, body: f("secondary-rate-limit") },
      { op: `GET ${R}/git/ref/heads/main`, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, body: f("rate-limited") },
      { op: `GET ${R}/git/ref/heads/main`, status: 502, body: "" },
      ...readBase,
    ]);
    await t.adapter.preview(samplePatch());
    expect(t.sleeps).toEqual([3000, 10_000, 4000]);
  });

  it("gives up when the rate limit resets too far ahead", async () => {
    const reset = Math.floor(FIXED_NOW().getTime() / 1000) + 3600;
    const t = setup([
      { op: `GET ${R}/git/ref/heads/main`, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, body: f("rate-limited") },
    ]);
    await expect(t.adapter.preview(samplePatch())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(t.sleeps).toEqual([]);
  });

  // Regression tests from the review of PR #41.
  it("refuses a receipt from another repository or branch, with no calls (item 4)", async () => {
    for (const other of [{ owner: "other" }, { repo: "site" }, { baseBranch: "live" }]) {
      const t = setup([]);
      await expect(t.adapter.revert({ ...receipt(), ...other }), JSON.stringify(other)).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
      expect(t.calls).toEqual([]);
    }
  });

  it("refuses a head branch that is not ours, with no calls (item 4)", async () => {
    const t = setup([]);
    await expect(t.adapter.revert({ ...receipt(), headBranch: "release" })).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
    expect(t.calls).toEqual([]);
  });

  it("refuses when the pull request's head is not the receipt's branch (item 4)", async () => {
    const t = setup([{ op: `GET ${R}/pulls/42`, body: { ...(f("create-pull") as object), head: { ref: "release" } } }]);
    await expect(t.adapter.revert(receipt())).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
    expect(writes(t.calls)).toEqual([]);
  });

  it("names branches with a unique suffix (item 8)", async () => {
    const r = replay([]);
    const a = new GitHubPrAdapter({ owner: "acme-agency", repo: "acme-dawn-theme", branch: "main", token: "t", fetch: r.fetch });
    const b = new GitHubPrAdapter({ owner: "acme-agency", repo: "acme-dawn-theme", branch: "main", token: "t", fetch: r.fetch });
    // The default suffix is random, so two adapters pick different names.
    const names = [a, b].map((x) => (x as unknown as { newSuffix(): string }).newSuffix());
    expect(names[0]).toMatch(/^[0-9a-f]{6}$/);
    expect(names[0]).not.toBe(names[1]);
  });

  it("reuses an open revert pull request instead of failing (item 8)", async () => {
    const t = setup([
      { op: `GET ${R}/pulls/42`, body: f("get-pull-merged") },
      { op: REVERT_LOOKUP, body: f("list-pulls-revert-open") },
    ]);
    const r = await t.adapter.revert(receipt());
    expect(r).toMatchObject({ action: "revert-pull-request-open", pullNumber: 43 });
    expect(writes(t.calls)).toEqual([]);
  });

  it("moves a stale revert branch of ours instead of failing (item 8)", async () => {
    const t = setup([
      { op: `GET ${R}/pulls/42`, body: f("get-pull-merged") },
      NO_OPEN_REVERT,
      ...readMerged(),
      { op: `POST ${R}/git/trees`, status: 201, body: f("create-tree-revert") },
      { op: `POST ${R}/git/commits`, status: 201, body: f("create-commit-revert") },
      { op: `POST ${R}/git/refs`, status: 422, body: f("ref-exists") },
      {
        op: `PATCH ${R}/git/refs/heads/wide-aisle/revert-p-001-abc123`,
        body: f("create-ref-revert"),
        check: (b) => expect(b).toEqual({ sha: "5e6f708192a3b4c5d6e7f80912a3b4c5d6e7f809", force: true }),
      },
      { op: `POST ${R}/pulls`, status: 201, body: f("create-pull-revert") },
    ]);
    await expect(t.adapter.revert(receipt())).resolves.toMatchObject({ action: "opened-revert-pull-request", pullNumber: 43 });
    expect(t.left()).toEqual([]);
  });

  it("does not resend a pull request after a 5xx; it finds the one that was made", async () => {
    const t = setup([
      ...readBase,
      blob(HEADER_AFTER, "create-blob-header"),
      blob(CSS_AFTER, "create-blob-css"),
      blob(NEW_SNIPPET, "create-blob-snippet"),
      { op: `POST ${R}/git/trees`, status: 201, body: f("create-tree") },
      { op: `POST ${R}/git/commits`, status: 201, body: f("create-commit") },
      { op: `POST ${R}/git/refs`, status: 201, body: f("create-ref") },
      { op: `POST ${R}/pulls`, status: 502, body: "" },
      { op: `GET ${R}/pulls?state=open&head=acme-agency%3Awide-aisle%2Fp-001-abc123`, body: [f("create-pull")] },
    ]);
    await expect(t.adapter.apply(samplePatch())).resolves.toMatchObject({ pullNumber: 42 });
    expect(t.calls.filter((c) => c.op === `POST ${R}/pulls`)).toHaveLength(1);
    expect(t.calls.some((c) => c.init.method === "DELETE")).toBe(false);
  });

  it("keeps the token private and talks only to api.github.com (item 12)", () => {
    const t = setup([], { token: "ghs_SECRET" });
    expect(JSON.stringify(t.adapter)).not.toContain("ghs_SECRET");
    expect(() => setup([], { apiUrl: "https://evil.example.com" })).toThrow(/api.github.com/);
    expect(() => setup([], { apiUrl: "http://api.github.com" })).toThrow(/api.github.com/);
  });

  it("refuses alt text and bad repository names", async () => {
    const t = setup([]);
    await expect(
      t.adapter.apply(samplePatch({ altText: [{ productId: "gid://shopify/Product/1", mediaId: "gid://shopify/MediaImage/1", before: "", after: "x" }] })),
    ).rejects.toBeInstanceOf(InvalidPatchError);
    expect(() => setup([], { owner: "../evil" })).toThrow(/plain GitHub names/);
  });
});
