import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only `drizzle-kit migrate` and `push` connect; `generate` does not.
    url: process.env.DATABASE_URL ?? "",
  },
});
