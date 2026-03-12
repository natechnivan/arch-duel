import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
}

let sqlClient: postgres.Sql | null = null;

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getDb() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return null;
  }

  // Reuse a single driver instance across hot reloads and route invocations in the same process.
  if (!sqlClient) {
    sqlClient = postgres(connectionString, {
      max: 1,
      prepare: false,
    });
  }

  // Drizzle receives the schema so route handlers can use typed queries everywhere else.
  return drizzle(sqlClient, { schema });
}
