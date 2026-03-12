import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@/db";
import { DEFAULT_SCENARIOS, Difficulty, listScenarioTopics, pickScenario } from "@/app/api/_lib/scenarios";
import { attempts, rounds, scenarioPacks, scenarios, sessions, users } from "@/db/schema";

type SaveRoundInput = {
  id: string;
  scenarioId: string;
  topic: string;
  difficulty: string;
  prompt: string;
  designText: string;
  answerKind: string;
  hiddenIssue: string;
  missingBucket: string;
  isDaily: boolean;
};

type SaveAttemptInput = {
  id: string;
  roundId?: string;
  userId?: string;
  sessionId?: string;
  scenarioId: string;
  playerKind: string;
  playerBucket: string;
  expectedKind: string;
  expectedBucket: string;
  hiddenIssue: string;
  correct: boolean;
  scoreDelta: number;
  shortVerdict: string;
  why: string;
  whatToFix: string[];
  learningTakeaway: string;
};

type ScenarioFilters = {
  difficulty?: Difficulty | "any";
  topic?: string | "any";
  excludeIds?: string[];
  dailySeed?: string;
};

function requireDb() {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required for this feature.");
  }
  return db;
}

function chooseCandidate<T extends { id: string }>(candidates: T[], seed?: string) {
  if (candidates.length === 0) {
    throw new Error("No candidates available.");
  }

  if (!seed) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return candidates[hash % candidates.length];
}

function toUtcDateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function calculateCurrentStreak(dateKeys: string[]) {
  const uniqueSorted = Array.from(new Set(dateKeys)).sort((a, b) => b.localeCompare(a));
  if (uniqueSorted.length === 0) {
    return 0;
  }

  let streak = 0;
  const current = new Date();
  current.setUTCHours(0, 0, 0, 0);

  for (const key of uniqueSorted) {
    const date = new Date(`${key}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - date.getTime()) / 86400000);

    if (diffDays === streak) {
      streak += 1;
      continue;
    }

    if (streak === 0 && diffDays === 1) {
      current.setUTCDate(current.getUTCDate() - 1);
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

const RECENT_WEAK_AREA_WINDOW = 30;
const DASHBOARD_HISTORY_LIMIT = 10;
const HISTORY_PAGE_LIMIT = 20;

// Auth queries
export async function countUsers() {
  const db = requireDb();
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function createUser(input: {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: string;
}) {
  const db = requireDb();
  await db.insert(users).values(input);
}

export async function getUserByEmail(email: string) {
  const db = requireDb();
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const db = requireDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = requireDb();
  await db.insert(sessions).values(input);
}

export async function getSessionByTokenHash(tokenHash: string) {
  const db = requireDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

export async function deleteSessionByTokenHash(tokenHash: string) {
  const db = requireDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

// Scenario pack queries
export async function listActiveTopics() {
  const db = getDb();
  if (!db) {
    return listScenarioTopics();
  }

  const rows = await db
    .select({ topic: scenarios.topic })
    .from(scenarios)
    .innerJoin(scenarioPacks, eq(scenarios.packId, scenarioPacks.id))
    .where(and(eq(scenarios.isActive, true), eq(scenarioPacks.isActive, true)))
    .orderBy(asc(scenarios.topic));

  const topics = Array.from(new Set(rows.map((row) => row.topic)));
  return topics.length > 0 ? topics : listScenarioTopics();
}

export async function createScenarioPack(input: {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdBy?: string;
}) {
  const db = requireDb();
  await db.insert(scenarioPacks).values({
    id: input.id,
    slug: input.slug,
    name: input.name,
    description: input.description,
    createdBy: input.createdBy,
  });
}

export async function getScenarioPackById(packId: string) {
  const db = requireDb();
  const rows = await db.select().from(scenarioPacks).where(eq(scenarioPacks.id, packId)).limit(1);
  return rows[0] ?? null;
}

export async function updateScenarioPack(
  packId: string,
  input: {
    slug: string;
    name: string;
    description?: string;
  }
) {
  const db = requireDb();
  const pack = await getScenarioPackById(packId);
  if (!pack) {
    throw new Error("Scenario pack not found.");
  }

  await db
    .update(scenarioPacks)
    .set({
      slug: input.slug,
      name: input.name,
      description: input.description,
    })
    .where(eq(scenarioPacks.id, packId));
}

export async function createScenario(input: {
  id: string;
  packId: string;
  slug: string;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
}) {
  const db = requireDb();
  const pack = await getScenarioPackById(input.packId);
  if (!pack) {
    throw new Error("The selected scenario pack no longer exists. Refresh the admin page and try again.");
  }

  await db.insert(scenarios).values({
    id: input.id,
    packId: input.packId,
    slug: input.slug,
    topic: input.topic,
    difficulty: input.difficulty,
    prompt: input.prompt,
  });
}

export async function getScenarioById(scenarioId: string) {
  const db = requireDb();
  const rows = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  return rows[0] ?? null;
}

export async function updateScenario(
  scenarioId: string,
  input: {
    slug: string;
    topic: string;
    difficulty: Difficulty;
    prompt: string;
  }
) {
  const db = requireDb();
  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    throw new Error("Scenario not found.");
  }

  await db
    .update(scenarios)
    .set({
      slug: input.slug,
      topic: input.topic,
      difficulty: input.difficulty,
      prompt: input.prompt,
    })
    .where(eq(scenarios.id, scenarioId));
}

export async function listScenarioPacksWithScenarios() {
  const db = requireDb();
  const packRows = await db.select().from(scenarioPacks).orderBy(asc(scenarioPacks.name));
  const scenarioRows = await db.select().from(scenarios).orderBy(asc(scenarios.topic), asc(scenarios.prompt));

  return packRows.map((pack) => ({
    ...pack,
    scenarios: scenarioRows.filter((scenario) => scenario.packId === pack.id),
  }));
}

export async function listScenarioPackSummaries() {
  const db = requireDb();
  const packRows = await db.select().from(scenarioPacks).orderBy(asc(scenarioPacks.name));
  const scenarioRows = await db.select({ packId: scenarios.packId }).from(scenarios);
  const counts = new Map<string, number>();

  for (const row of scenarioRows) {
    counts.set(row.packId, (counts.get(row.packId) ?? 0) + 1);
  }

  return packRows.map((pack) => ({
    ...pack,
    scenarioCount: counts.get(pack.id) ?? 0,
  }));
}

const ADMIN_SCENARIO_PAGE_LIMIT = 25;

export async function listScenariosForPack(
  packId: string,
  options?: {
    page?: number;
    limit?: number;
    query?: string;
  }
) {
  const db = requireDb();
  const safePage = Math.max(1, Math.trunc(options?.page ?? 1) || 1);
  const safeLimit = Math.min(ADMIN_SCENARIO_PAGE_LIMIT, Math.max(1, Math.trunc(options?.limit ?? ADMIN_SCENARIO_PAGE_LIMIT) || ADMIN_SCENARIO_PAGE_LIMIT));
  const query = options?.query?.trim();
  const whereClause = query
    ? and(
        eq(scenarios.packId, packId),
        ilike(scenarios.topic, `%${query}%`)
      )
    : eq(scenarios.packId, packId);

  const totalRows = await db.select({ value: count() }).from(scenarios).where(whereClause);
  const total = totalRows[0]?.value ?? 0;
  const offset = (safePage - 1) * safeLimit;
  const items = await db
    .select()
    .from(scenarios)
    .where(whereClause)
    .orderBy(asc(scenarios.topic), asc(scenarios.prompt))
    .limit(safeLimit)
    .offset(offset);

  return {
    items,
    page: safePage,
    pageSize: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    hasMore: offset + safeLimit < total,
    query: query ?? "",
  };
}

export async function seedDefaultScenarioPack(adminUserId: string) {
  const db = requireDb();
  const existingPack = await db
    .select()
    .from(scenarioPacks)
    .where(eq(scenarioPacks.slug, "core-system-design"))
    .limit(1);

  let packId = existingPack[0]?.id;
  if (!packId) {
    packId = crypto.randomUUID();
    await db.insert(scenarioPacks).values({
      id: packId,
      slug: "core-system-design",
      name: "Core System Design",
      description: "Seed pack with the built-in interview practice scenarios.",
      createdBy: adminUserId,
    });
  }

  const existingScenarios = await db.select().from(scenarios).where(eq(scenarios.packId, packId));
  const existingSlugs = new Set(existingScenarios.map((scenario) => scenario.slug));

  const rowsToInsert = DEFAULT_SCENARIOS.filter((scenario) => !existingSlugs.has(scenario.id)).map((scenario) => ({
    id: crypto.randomUUID(),
    packId,
    slug: scenario.id,
    topic: scenario.topic,
    difficulty: scenario.difficulty,
    prompt: scenario.prompt,
  }));

  if (rowsToInsert.length > 0) {
    await db.insert(scenarios).values(rowsToInsert);
  }

  return {
    packId,
    inserted: rowsToInsert.length,
  };
}

export async function pickScenarioFromDatabase(filters: ScenarioFilters) {
  const db = getDb();
  if (!db) {
    return pickScenario(filters);
  }

  const baseConditions = [eq(scenarios.isActive, true), eq(scenarioPacks.isActive, true)];
  if (filters.difficulty && filters.difficulty !== "any") {
    baseConditions.push(eq(scenarios.difficulty, filters.difficulty));
  }
  if (filters.topic && filters.topic !== "any") {
    baseConditions.push(eq(scenarios.topic, filters.topic));
  }

  const rows = await db
    .select({
      id: scenarios.id,
      topic: scenarios.topic,
      difficulty: scenarios.difficulty,
      prompt: scenarios.prompt,
    })
    .from(scenarios)
    .innerJoin(scenarioPacks, eq(scenarios.packId, scenarioPacks.id))
    .where(and(...baseConditions));

  if (rows.length === 0) {
    return pickScenario(filters);
  }

  const excludeSet = new Set(filters.excludeIds ?? []);
  const freshRows = rows.filter((row) => !excludeSet.has(row.id));
  const candidates = freshRows.length > 0 ? freshRows : rows;
  return chooseCandidate(candidates, filters.dailySeed ? `${filters.dailySeed}:${filters.topic ?? "any"}:${filters.difficulty ?? "any"}` : undefined);
}

// Round and attempt persistence
export async function saveRound(input: SaveRoundInput) {
  const db = requireDb();
  await db.insert(rounds).values({
    id: input.id,
    scenarioId: input.scenarioId,
    topic: input.topic,
    difficulty: input.difficulty,
    prompt: input.prompt,
    designText: input.designText,
    answerKind: input.answerKind,
    hiddenIssue: input.hiddenIssue,
    missingBucket: input.missingBucket,
    isDaily: input.isDaily,
  });

  return true;
}

export async function getRoundById(roundId: string) {
  const db = requireDb();
  const rows = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
  return rows[0] ?? null;
}

export async function saveAttempt(input: SaveAttemptInput) {
  const db = requireDb();
  await db.insert(attempts).values({
    id: input.id,
    roundId: input.roundId,
    userId: input.userId,
    sessionId: input.sessionId,
    scenarioId: input.scenarioId,
    playerKind: input.playerKind,
    playerBucket: input.playerBucket,
    expectedKind: input.expectedKind,
    expectedBucket: input.expectedBucket,
    hiddenIssue: input.hiddenIssue,
    correct: input.correct,
    scoreDelta: input.scoreDelta,
    shortVerdict: input.shortVerdict,
    why: input.why,
    whatToFix: input.whatToFix,
    learningTakeaway: input.learningTakeaway,
  });

  return true;
}

export async function hasScoredAttemptForRound(roundId: string, identity: { userId?: string; sessionId?: string }) {
  const db = requireDb();

  if (!identity.userId && !identity.sessionId) {
    return false;
  }

  const rows = await db
    .select({
      id: attempts.id,
      userId: attempts.userId,
      sessionId: attempts.sessionId,
    })
    .from(attempts)
    .where(eq(attempts.roundId, roundId));

  return rows.some((row) =>
    identity.userId ? row.userId === identity.userId : row.sessionId === identity.sessionId
  );
}

export async function hasScoredDailyAttemptForDate(
  dateKey: string,
  identity: { userId?: string; sessionId?: string }
) {
  const db = requireDb();

  if (!identity.userId && !identity.sessionId) {
    return false;
  }

  const rows = await db
    .select({
      userId: attempts.userId,
      sessionId: attempts.sessionId,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(rounds, eq(attempts.roundId, rounds.id))
    .where(eq(rounds.isDaily, true));

  return rows.some((row) => {
    const matchesIdentity = identity.userId ? row.userId === identity.userId : row.sessionId === identity.sessionId;
    return matchesIdentity && toUtcDateKey(row.createdAt) === dateKey;
  });
}

export async function getLatestAttemptForRound(roundId: string, identity: { userId?: string; sessionId?: string }) {
  const db = requireDb();

  if (!identity.userId && !identity.sessionId) {
    return null;
  }

  const rows = await db
    .select({
      correct: attempts.correct,
      scoreDelta: attempts.scoreDelta,
      shortVerdict: attempts.shortVerdict,
      why: attempts.why,
      whatToFix: attempts.whatToFix,
      learningTakeaway: attempts.learningTakeaway,
      expectedKind: attempts.expectedKind,
      expectedBucket: attempts.expectedBucket,
      hiddenIssue: attempts.hiddenIssue,
      playerKind: attempts.playerKind,
      playerBucket: attempts.playerBucket,
      createdAt: attempts.createdAt,
      userId: attempts.userId,
      sessionId: attempts.sessionId,
    })
    .from(attempts)
    .where(eq(attempts.roundId, roundId))
    .orderBy(desc(attempts.createdAt));

  const match = rows.find((row) => (identity.userId ? row.userId === identity.userId : row.sessionId === identity.sessionId));
  return match ?? null;
}

// Dashboard-style aggregate queries
export async function getUserDashboard(userId: string) {
  const db = requireDb();
  const rows = await db
    .select({
      attemptId: attempts.id,
      correct: attempts.correct,
      scoreDelta: attempts.scoreDelta,
      shortVerdict: attempts.shortVerdict,
      createdAt: attempts.createdAt,
      topic: rounds.topic,
      difficulty: rounds.difficulty,
      prompt: rounds.prompt,
    })
    .from(attempts)
    .innerJoin(rounds, eq(attempts.roundId, rounds.id))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt));

  const totalAttempts = rows.length;
  const correctAttempts = rows.filter((row) => row.correct).length;
  const totalScore = rows.reduce((sum, row) => sum + row.scoreDelta, 0);
  const streak = calculateCurrentStreak(rows.map((row) => toUtcDateKey(row.createdAt)));
  // Weak areas are more useful as a recent signal than a lifetime penalty.
  const recentRows = rows.slice(0, RECENT_WEAK_AREA_WINDOW);

  const topicMap = new Map<string, { attempts: number; correct: number; score: number }>();
  const recentTopicMap = new Map<string, { attempts: number; correct: number; score: number }>();
  const difficultyMap = new Map<string, { attempts: number; correct: number; score: number }>();

  for (const row of rows) {
    const topicEntry = topicMap.get(row.topic) ?? { attempts: 0, correct: 0, score: 0 };
    topicEntry.attempts += 1;
    topicEntry.correct += row.correct ? 1 : 0;
    topicEntry.score += row.scoreDelta;
    topicMap.set(row.topic, topicEntry);

    const difficultyEntry = difficultyMap.get(row.difficulty) ?? { attempts: 0, correct: 0, score: 0 };
    difficultyEntry.attempts += 1;
    difficultyEntry.correct += row.correct ? 1 : 0;
    difficultyEntry.score += row.scoreDelta;
    difficultyMap.set(row.difficulty, difficultyEntry);
  }

  for (const row of recentRows) {
    const topicEntry = recentTopicMap.get(row.topic) ?? { attempts: 0, correct: 0, score: 0 };
    topicEntry.attempts += 1;
    topicEntry.correct += row.correct ? 1 : 0;
    topicEntry.score += row.scoreDelta;
    recentTopicMap.set(row.topic, topicEntry);
  }

  const topicStats = Array.from(topicMap.entries())
    .map(([topic, value]) => ({
      topic,
      attempts: value.attempts,
      correct: value.correct,
      accuracy: value.attempts ? Math.round((value.correct / value.attempts) * 100) : 0,
      score: value.score,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);

  const weakAreas = Array.from(recentTopicMap.entries())
    .map(([topic, value]) => ({
      topic,
      attempts: value.attempts,
      correct: value.correct,
      accuracy: value.attempts ? Math.round((value.correct / value.attempts) * 100) : 0,
      score: value.score,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 5);

  const difficultyStats = Array.from(difficultyMap.entries())
    .map(([difficulty, value]) => ({
      difficulty,
      attempts: value.attempts,
      correct: value.correct,
      accuracy: value.attempts ? Math.round((value.correct / value.attempts) * 100) : 0,
      score: value.score,
    }))
    .sort((a, b) => a.difficulty.localeCompare(b.difficulty));

  return {
    summary: {
      totalAttempts,
      correctAttempts,
      totalScore,
      accuracy: totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
      streak,
    },
    topicStats,
    difficultyStats,
    weakAreas,
    history: rows.slice(0, DASHBOARD_HISTORY_LIMIT).map((row) => ({
      attemptId: row.attemptId,
      topic: row.topic,
      difficulty: row.difficulty,
      prompt: row.prompt,
      shortVerdict: row.shortVerdict,
      scoreDelta: row.scoreDelta,
      correct: row.correct,
      createdAt: row.createdAt,
    })),
  };
}

export async function getUserHistoryPage(userId: string, page = 1, limit = HISTORY_PAGE_LIMIT) {
  const db = requireDb();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safeLimit = Math.min(HISTORY_PAGE_LIMIT, Math.max(1, Math.trunc(limit) || HISTORY_PAGE_LIMIT));
  const rows = await db
    .select({
      attemptId: attempts.id,
      topic: rounds.topic,
      difficulty: rounds.difficulty,
      prompt: rounds.prompt,
      shortVerdict: attempts.shortVerdict,
      scoreDelta: attempts.scoreDelta,
      correct: attempts.correct,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(rounds, eq(attempts.roundId, rounds.id))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt));

  const offset = (safePage - 1) * safeLimit;
  const items = rows.slice(offset, offset + safeLimit).map((row) => ({
    attemptId: row.attemptId,
    topic: row.topic,
    difficulty: row.difficulty,
    prompt: row.prompt,
    shortVerdict: row.shortVerdict,
    scoreDelta: row.scoreDelta,
    correct: row.correct,
    createdAt: row.createdAt,
  }));

  return {
    items,
    page: safePage,
    pageSize: safeLimit,
    total: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / safeLimit)),
    hasMore: offset + safeLimit < rows.length,
  };
}

export async function getLeaderboard(limit = 10) {
  const db = requireDb();
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      attemptId: attempts.id,
      scoreDelta: attempts.scoreDelta,
      correct: attempts.correct,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(users, eq(attempts.userId, users.id))
    .orderBy(desc(attempts.createdAt));

  const grouped = new Map<
    string,
    {
      username: string;
      totalScore: number;
      totalAttempts: number;
      correctAttempts: number;
      dates: string[];
    }
  >();

  for (const row of rows) {
    const entry = grouped.get(row.userId) ?? {
      username: row.username,
      totalScore: 0,
      totalAttempts: 0,
      correctAttempts: 0,
      dates: [],
    };
    entry.totalScore += row.scoreDelta;
    entry.totalAttempts += 1;
    entry.correctAttempts += row.correct ? 1 : 0;
    entry.dates.push(toUtcDateKey(row.createdAt));
    grouped.set(row.userId, entry);
  }

  return Array.from(grouped.entries())
    .map(([userId, entry]) => ({
      userId,
      username: entry.username,
      totalScore: entry.totalScore,
      totalAttempts: entry.totalAttempts,
      correctAttempts: entry.correctAttempts,
      accuracy: entry.totalAttempts ? Math.round((entry.correctAttempts / entry.totalAttempts) * 100) : 0,
      streak: calculateCurrentStreak(entry.dates),
    }))
    .sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy)
    .slice(0, limit);
}
