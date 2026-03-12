import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Drizzle runs outside Next.js, so load local env files explicitly.
if (existsSync(".env.local")) {
  loadEnv({ path: ".env.local" });
} else if (existsSync(".env")) {
  loadEnv({ path: ".env" });
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("Set DATABASE_URL or POSTGRES_URL before running drizzle-kit commands.");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
