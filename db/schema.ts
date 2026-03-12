import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Users are optional for playing, but required for persistent stats, streaks, and leaderboard entries.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("player"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
  })
);

// Sessions are stored server-side so the browser only carries an opaque cookie token.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
  })
);

// Packs let admins organize scenarios into curated collections without redeploying code.
export const scenarioPacks = pgTable(
  "scenario_packs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("scenario_packs_slug_idx").on(table.slug),
  })
);

// Scenarios are now database-backed so admins can add prompts and topics dynamically.
export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  packId: text("pack_id")
    .notNull()
    .references(() => scenarioPacks.id),
  slug: text("slug").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generated rounds keep the answer key server-side so evaluation does not trust the client.
export const rounds = pgTable("rounds", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull(),
  prompt: text("prompt").notNull(),
  designText: text("design_text").notNull(),
  answerKind: text("answer_kind").notNull(),
  hiddenIssue: text("hidden_issue").notNull(),
  missingBucket: text("missing_bucket").notNull(),
  isDaily: boolean("is_daily").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Attempts link back to a user when logged in, which enables history, weak-area analysis, and leaderboards.
export const attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  roundId: text("round_id").references(() => rounds.id),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id"),
  scenarioId: text("scenario_id").notNull(),
  playerKind: text("player_kind").notNull(),
  playerBucket: text("player_bucket").notNull(),
  expectedKind: text("expected_kind").notNull(),
  expectedBucket: text("expected_bucket").notNull(),
  hiddenIssue: text("hidden_issue").notNull(),
  correct: boolean("correct").notNull(),
  scoreDelta: integer("score_delta").notNull(),
  shortVerdict: text("short_verdict").notNull(),
  why: text("why").notNull(),
  whatToFix: jsonb("what_to_fix").$type<string[]>().notNull(),
  learningTakeaway: text("learning_takeaway").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
