#!/usr/bin/env node
// Board CLI for the run ledger. Run `node scripts/agents/board.mjs help`.
import { parseArgs } from "node:util";
import {
  appendEvent, buildBoard, createTask, digest, lastEvents, listTasks,
  markStale, staleTasks, STATES, upsertTask,
} from "./ledger.mjs";

const HELP = `Usage: node scripts/agents/board.mjs <command>

  list                              Show every task
  build                             Write the .agents/board.json view
  new <id> --title T --milestone M0 --lane repo [--branch B] [--goal G]
      [--exit "check"]... [--needs owner:Q-01]... [--decisions D-05]...
                                    Create .agents/tasks/<id>/ (repeat a flag for more values)
  set <id> key=value ...            Update an existing task: state, step, agent, branch, issue, needs (comma list)
  event <id> <event> <summary>      Append an event to the task's log
  events <id> [n]                   Print the last n events (default 50)
  stale [--minutes 20] [--mark] [--all]
                                    List Running tasks with no heartbeat. --mark sets Stalled
                                    on the current branch's task; add --all for every task
  digest [--hours 24]               Print the daily digest

States: ${STATES.join(", ")}`;

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "list": {
      for (const t of listTasks()) {
        console.log(`${t.id}  ${t.state.padEnd(14)} ${t.title}${t.step ? `  [${t.step}]` : ""}`);
      }
      return;
    }
    case "build": {
      console.log(`wrote ${buildBoard().length} tasks to .agents/board.json`);
      return;
    }
    case "new": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          title: { type: "string" }, milestone: { type: "string" }, lane: { type: "string" },
          branch: { type: "string" }, goal: { type: "string" },
          exit: { type: "string", multiple: true }, needs: { type: "string", multiple: true },
          decisions: { type: "string", multiple: true },
        },
      });
      if (positionals.length !== 1) throw new Error("new takes one task id; repeat a flag for more values");
      const t = createTask({ id: positionals[0], ...values, exit: values.exit ?? [], needs: values.needs ?? [], decisions: values.decisions ?? [] });
      console.log(`created ${t.id} (${t.state})`);
      return;
    }
    case "set": {
      const [id, ...pairs] = rest;
      if (!pairs.length) throw new Error("set needs at least one key=value");
      const patch = {};
      for (const p of pairs) {
        const i = p.indexOf("=");
        if (i < 1) throw new Error(`expected key=value, got "${p}"`);
        const key = p.slice(0, i);
        const val = p.slice(i + 1);
        patch[key] = key === "issue" ? Number(val) || val : key === "needs" ? val.split(",").filter(Boolean) : val;
      }
      const t = upsertTask(id, patch, undefined, { create: false });
      appendEvent({ task: id, event: "step", summary: `set ${pairs.join(" ")}` });
      console.log(`${t.id}: ${t.state}${t.step ? `, ${t.step}` : ""}`);
      return;
    }
    case "event": {
      const [task, event, ...words] = rest;
      appendEvent({ task, event, summary: words.join(" ") });
      return;
    }
    case "events": {
      for (const e of lastEvents(rest[0], Number(rest[1] ?? 50))) {
        console.log(`${e.ts} ${e.event.padEnd(12)} ${e.summary}`);
      }
      return;
    }
    case "stale": {
      const { values } = parseArgs({ args: rest, options: { minutes: { type: "string" }, mark: { type: "boolean" }, all: { type: "boolean" } } });
      const minutes = Number(values.minutes ?? 20);
      const list = values.mark ? markStale(undefined, minutes, Date.now(), { all: values.all }) : staleTasks(undefined, minutes);
      for (const t of list) console.log(`${t.id} ${values.mark ? "marked Stalled" : "stale"}: last heartbeat ${t.heartbeat ?? "never"}`);
      return;
    }
    case "digest": {
      const { values } = parseArgs({ args: rest, options: { hours: { type: "string" } } });
      console.log(digest(undefined, Number(values.hours ?? 24)));
      return;
    }
    case undefined:
    case "help":
    case "--help":
      console.log(HELP);
      return;
    default:
      throw new Error(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
