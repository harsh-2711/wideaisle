// The bench fixture server in its own process (T-033), so its CPU and memory
// stay out of the benchmark's figures. `startFixtureProcess` in fixtures.ts
// starts it; the two talk over the IPC channel:
//
//   child to parent: { port } once listening, { requests } when asked
//   parent to child: "requests" (how many so far), "close"
import fs from "node:fs";
import path from "node:path";
import { serveFixtures, type FixtureManifest } from "./fixtures";

const dir = process.argv[2];
const send = process.send?.bind(process);
if (!dir || !send) {
  console.error(
    "fixture-server: start it with startFixtureProcess (scripts/bench/fixtures.ts)",
  );
  process.exit(2);
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
) as FixtureManifest;
const server = await serveFixtures(dir, manifest);
process.on("message", (m) => {
  if (m === "requests") send({ requests: server.requests });
  if (m === "close") void server.close().then(() => process.exit(0));
});
// The parent went away without closing us.
process.on("disconnect", () => process.exit(0));
send({ port: server.port });
