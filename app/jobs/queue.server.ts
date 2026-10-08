import { PgBoss } from "pg-boss";

// Job queues live in the same Postgres (D-05, D-10), so no separate queue
// service is needed. Queue names are the lanes' contracts with each other.
export const QUEUES = {
  scan: "scan",
  fix: "fix",
  rescan: "rescan",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

let boss: PgBoss | undefined;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  const instance = new PgBoss({ connectionString: process.env.DATABASE_URL });
  instance.on("error", (err) => console.error("pg-boss error", err));
  await instance.start();
  for (const name of Object.values(QUEUES)) await instance.createQueue(name);
  boss = instance;
  return boss;
}

export async function stopQueue() {
  await boss?.stop();
  boss = undefined;
}
