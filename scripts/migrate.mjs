#!/usr/bin/env node
// Applies the Drizzle migrations in drizzle/. Uses drizzle-orm's migrator,
// which is a runtime dependency, so production images do not need drizzle-kit.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env, or export it.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("migrations applied");
} finally {
  await pool.end();
}
