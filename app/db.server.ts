import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./db/schema";

declare global {
  // eslint-disable-next-line no-var
  var pgPoolGlobal: pg.Pool | undefined;
}

// One pool per process. In development, reuse it across hot reloads.
function createPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
}

export const pool = global.pgPoolGlobal ?? createPool();
if (process.env.NODE_ENV !== "production") global.pgPoolGlobal = pool;

const db = drizzle(pool, { schema });

export default db;
