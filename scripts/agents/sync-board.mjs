#!/usr/bin/env node
// Mirrors the task board to the GitHub Project (D-19).
//
// Needs: WA_PROJECT_TOKEN (or GITHUB_TOKEN), a classic token with the
// "project" scope; WA_PROJECT_OWNER (user login) and WA_PROJECT_NUMBER. The Project needs a single-select "Status" field with
// the options Queued, Running, Blocked on you, In review, Done and Stalled.
// Optional text fields "Step", "Agent" and "Heartbeat" are filled when present.
//
// Usage: node scripts/agents/sync-board.mjs [--dry-run]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listTasks } from "./ledger.mjs";

const API = "https://api.github.com/graphql";

export function itemTitle(task) {
  return `${task.id} ${task.title}`.trim();
}

// Pure planning step, so it can be tested without the API.
// project: { fields: {Status: {id, options: {name: id}}, Step?: {id}, ...}, items: [{id, title}] }
export function planSync(tasks, project) {
  const ops = [];
  const status = project.fields.Status;
  if (!status) throw new Error('the Project needs a single-select field named "Status"');
  for (const t of tasks) {
    const existing = project.items.find((i) => i.title.startsWith(t.id + " ") || i.title === t.id);
    const item = existing ? existing.id : { create: itemTitle(t), issue: t.issue ?? null };
    if (!existing) ops.push({ op: "create", task: t.id, title: itemTitle(t), issue: t.issue ?? null });
    const optionId = status.options[t.state];
    if (!optionId) throw new Error(`the Status field has no option "${t.state}"`);
    ops.push({ op: "status", task: t.id, item, field: status.id, option: optionId });
    for (const [field, value] of [["Step", t.step], ["Agent", t.agent], ["Heartbeat", t.heartbeat]]) {
      if (project.fields[field] && value) ops.push({ op: "text", task: t.id, item, field: project.fields[field].id, value: String(value) });
    }
  }
  return ops;
}

function token() {
  return process.env.WA_PROJECT_TOKEN || process.env.GITHUB_TOKEN;
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: `bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function loadProject(owner, number) {
  const items = [];
  let after = null;
  let p;
  do {
    const data = await gql(
      `query($owner: String!, $number: Int!, $after: String) {
        user(login: $owner) { projectV2(number: $number) {
          id
          fields(first: 50) { nodes {
            ... on ProjectV2FieldCommon { id name }
            ... on ProjectV2SingleSelectField { options { id name } }
          } }
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { id content {
              ... on DraftIssue { title } ... on Issue { title } ... on PullRequest { title }
            } }
          }
        } }
      }`,
      { owner, number, after },
    );
    p = data.user?.projectV2;
    if (!p) throw new Error(`no Project ${number} for user ${owner}`);
    for (const n of p.items.nodes) items.push({ id: n.id, title: n.content?.title ?? "" });
    after = p.items.pageInfo.hasNextPage ? p.items.pageInfo.endCursor : null;
  } while (after);
  const fields = {};
  for (const f of p.fields.nodes) {
    if (!f?.name) continue;
    fields[f.name] = { id: f.id, options: Object.fromEntries((f.options ?? []).map((o) => [o.name, o.id])) };
  }
  return { id: p.id, fields, items };
}

async function apply(project, ops, owner) {
  const created = {};
  const itemId = (item) => (typeof item === "string" ? item : created[item.create]);
  for (const o of ops) {
    if (o.op === "create") {
      if (o.issue) {
        const repo = process.env.WA_REPO ?? "wideaisle";
        const d = await gql(
          `query($owner: String!, $repo: String!, $n: Int!) { repository(owner: $owner, name: $repo) { issue(number: $n) { id } } }`,
          { owner, repo, n: Number(o.issue) },
        );
        const r = await gql(
          `mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } } }`,
          { p: project.id, c: d.repository.issue.id },
        );
        created[o.title] = r.addProjectV2ItemById.item.id;
      } else {
        const r = await gql(
          `mutation($p: ID!, $t: String!) { addProjectV2DraftIssue(input: {projectId: $p, title: $t}) { projectItem { id } } }`,
          { p: project.id, t: o.title },
        );
        created[o.title] = r.addProjectV2DraftIssue.projectItem.id;
      }
    } else {
      const value = o.op === "status" ? { singleSelectOptionId: o.option } : { text: o.value };
      await gql(
        `mutation($p: ID!, $i: ID!, $f: ID!, $v: ProjectV2FieldValue!) {
          updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: $v}) { projectV2Item { id } }
        }`,
        { p: project.id, i: itemId(o.item), f: o.field, v: value },
      );
    }
  }
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const { WA_PROJECT_OWNER, WA_PROJECT_NUMBER } = process.env;
  if (!token() || !WA_PROJECT_OWNER || !WA_PROJECT_NUMBER) {
    console.error("Set WA_PROJECT_TOKEN, WA_PROJECT_OWNER and WA_PROJECT_NUMBER. See .agents/README.md.");
    process.exit(2);
  }
  const project = await loadProject(WA_PROJECT_OWNER, Number(WA_PROJECT_NUMBER));
  const ops = planSync(listTasks(), project);
  if (dry) {
    for (const o of ops) console.log(JSON.stringify(o));
    return;
  }
  await apply(project, ops, WA_PROJECT_OWNER);
  console.log(`synced ${ops.length} changes`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invoked) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
