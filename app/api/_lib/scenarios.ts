export type Difficulty = "junior" | "mid" | "senior" | "staff";

export type Scenario = {
  id: string;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
};

// These defaults are used both as a fallback catalog and as seed data for the admin workflow.
export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "url-shortener-junior-basic",
    topic: "URL Shortener",
    difficulty: "junior",
    prompt: "Design a URL shortener for a small product that converts long links into short aliases and redirects users quickly.",
  },
  {
    id: "url-shortener-mid-analytics",
    topic: "URL Shortener",
    difficulty: "mid",
    prompt: "Design a URL shortener that supports custom aliases, click analytics, and moderate traffic spikes from marketing campaigns.",
  },
  {
    id: "url-shortener-senior-global",
    topic: "URL Shortener",
    difficulty: "senior",
    prompt: "Design a globally distributed URL shortener with low redirect latency, abuse prevention, and high availability across regions.",
  },
  {
    id: "rate-limiter-junior-api",
    topic: "Rate Limiter",
    difficulty: "junior",
    prompt: "Design a rate limiter for a public API that enforces per-user request limits every minute.",
  },
  {
    id: "rate-limiter-mid-tiered",
    topic: "Rate Limiter",
    difficulty: "mid",
    prompt: "Design a rate limiter for a SaaS API with free and paid tiers, burst handling, and admin-configurable quotas.",
  },
  {
    id: "rate-limiter-staff-global",
    topic: "Rate Limiter",
    difficulty: "staff",
    prompt: "Design a globally consistent rate limiting system for edge APIs where limits must hold across multiple regions with minimal added latency.",
  },
  {
    id: "notification-junior-email",
    topic: "Notification System",
    difficulty: "junior",
    prompt: "Design a notification system that sends email and push notifications for simple product events such as password resets and order updates.",
  },
  {
    id: "notification-mid-multichannel",
    topic: "Notification System",
    difficulty: "mid",
    prompt: "Design a multi-channel notification system that supports email, SMS, and push with retry handling and user preferences.",
  },
  {
    id: "notification-senior-priority",
    topic: "Notification System",
    difficulty: "senior",
    prompt: "Design a notification platform that handles billions of daily events, prioritizes urgent messages, and suppresses duplicates.",
  },
  {
    id: "feed-junior-home",
    topic: "Feed",
    difficulty: "junior",
    prompt: "Design a simple social home feed that shows recent posts from accounts a user follows.",
  },
  {
    id: "feed-mid-ranking",
    topic: "Feed",
    difficulty: "mid",
    prompt: "Design a social feed that combines recency with ranking signals such as likes and comments while keeping reads fast.",
  },
  {
    id: "feed-staff-hybrid-fanout",
    topic: "Feed",
    difficulty: "staff",
    prompt: "Design a large-scale feed service that uses a hybrid fanout strategy for celebrities and normal users while preserving latency SLOs.",
  },
  {
    id: "chat-junior-dm",
    topic: "Chat",
    difficulty: "junior",
    prompt: "Design a one-to-one messaging system with message history and basic online presence.",
  },
  {
    id: "chat-mid-group",
    topic: "Chat",
    difficulty: "mid",
    prompt: "Design a group chat system with delivery acknowledgements, unread counts, and media attachment metadata.",
  },
  {
    id: "chat-senior-realtime",
    topic: "Chat",
    difficulty: "senior",
    prompt: "Design a real-time chat platform with ordering guarantees per conversation, reconnect handling, and multi-device sync.",
  },
  {
    id: "upload-junior-images",
    topic: "File Upload",
    difficulty: "junior",
    prompt: "Design an image upload service for user profile photos with validation and basic storage.",
  },
  {
    id: "upload-mid-large-files",
    topic: "File Upload",
    difficulty: "mid",
    prompt: "Design a file upload service for large media files with resumable uploads and asynchronous virus scanning.",
  },
  {
    id: "upload-senior-cdn",
    topic: "File Upload",
    difficulty: "senior",
    prompt: "Design a large-scale file upload and delivery pipeline with regional ingestion, object storage, and CDN-backed downloads.",
  },
  {
    id: "analytics-junior-events",
    topic: "Analytics Pipeline",
    difficulty: "junior",
    prompt: "Design an event analytics pipeline that collects page views and basic counters for a web application.",
  },
  {
    id: "analytics-mid-streaming",
    topic: "Analytics Pipeline",
    difficulty: "mid",
    prompt: "Design an analytics pipeline that ingests high-volume clickstream data, supports near-real-time dashboards, and stores raw events for reprocessing.",
  },
  {
    id: "analytics-staff-lakehouse",
    topic: "Analytics Pipeline",
    difficulty: "staff",
    prompt: "Design a multi-tenant analytics platform with streaming ingestion, batch backfills, cost controls, and isolation between enterprise customers.",
  },
  {
    id: "search-junior-basic-site",
    topic: "Search",
    difficulty: "junior",
    prompt: "Design a simple site search service that indexes product pages and returns relevant results with low latency.",
  },
  {
    id: "search-mid-ranking-autocomplete",
    topic: "Search",
    difficulty: "mid",
    prompt: "Design a search platform with autocomplete, typo tolerance, faceted filtering, and ranking signals for a large ecommerce catalog.",
  },
  {
    id: "search-staff-global-multitenant",
    topic: "Search",
    difficulty: "staff",
    prompt: "Design a globally distributed multi-tenant search platform with near-real-time indexing, relevance tuning, and strict query latency SLOs.",
  },
  {
    id: "payments-junior-checkout-ledger",
    topic: "Payments",
    difficulty: "junior",
    prompt: "Design a payment checkout service that authorizes card payments, records transaction state, and exposes basic payment status to merchants.",
  },
  {
    id: "payments-mid-retries-webhooks",
    topic: "Payments",
    difficulty: "mid",
    prompt: "Design a payments platform that handles retries, idempotency, refund flows, and webhook delivery to merchants.",
  },
  {
    id: "payments-senior-multi-psp",
    topic: "Payments",
    difficulty: "senior",
    prompt: "Design a payment orchestration layer that routes across multiple PSPs, supports failover, and maintains reliable transaction reconciliation.",
  },
  {
    id: "recommendations-junior-related-items",
    topic: "Recommendation System",
    difficulty: "junior",
    prompt: "Design a recommendation service that shows related items on a product detail page using basic precomputed signals.",
  },
  {
    id: "recommendations-mid-personalized-feed",
    topic: "Recommendation System",
    difficulty: "mid",
    prompt: "Design a personalized recommendation system that combines user behavior, candidate generation, and ranking for a consumer app feed.",
  },
  {
    id: "recommendations-staff-online-offline",
    topic: "Recommendation System",
    difficulty: "staff",
    prompt: "Design a large-scale recommendation platform with offline training, nearline feature computation, online serving, and experiment safety controls.",
  },
  {
    id: "streaming-junior-video-upload",
    topic: "Video Streaming",
    difficulty: "junior",
    prompt: "Design a basic video streaming pipeline that supports video upload, transcoding, and playback for a small creator product.",
  },
  {
    id: "streaming-mid-live-vod",
    topic: "Video Streaming",
    difficulty: "mid",
    prompt: "Design a video platform that supports both live streaming and video-on-demand playback with global CDN delivery.",
  },
  {
    id: "streaming-senior-adaptive-global",
    topic: "Video Streaming",
    difficulty: "senior",
    prompt: "Design a large-scale video streaming service with adaptive bitrate delivery, regional failover, and hot-event traffic spikes.",
  },
  {
    id: "collab-junior-doc-comments",
    topic: "Collaborative Editing",
    difficulty: "junior",
    prompt: "Design a collaborative document editor that supports basic shared editing, comments, and autosave for small teams.",
  },
  {
    id: "collab-mid-realtime-cursors",
    topic: "Collaborative Editing",
    difficulty: "mid",
    prompt: "Design a realtime collaborative editing system with presence, cursor updates, conflict handling, and version history.",
  },
  {
    id: "collab-staff-large-docs",
    topic: "Collaborative Editing",
    difficulty: "staff",
    prompt: "Design a collaborative editing platform that supports massive documents, offline edits, and multi-region synchronization with conflict recovery.",
  },
  {
    id: "scheduler-junior-reminders",
    topic: "Job Scheduler",
    difficulty: "junior",
    prompt: "Design a job scheduler for reminder emails that can execute delayed jobs reliably and track basic retry state.",
  },
  {
    id: "scheduler-mid-recurring-workflows",
    topic: "Job Scheduler",
    difficulty: "mid",
    prompt: "Design a distributed job scheduling system for recurring workflows with retry policies, backoff, and worker coordination.",
  },
  {
    id: "scheduler-senior-high-scale",
    topic: "Job Scheduler",
    difficulty: "senior",
    prompt: "Design a large-scale scheduler that executes billions of delayed and cron-style jobs with fairness, deduplication, and recovery guarantees.",
  },
  {
    id: "feature-flags-junior-toggle-service",
    topic: "Feature Flag Service",
    difficulty: "junior",
    prompt: "Design a feature flag service that lets developers enable or disable product features by environment and user segment.",
  },
  {
    id: "feature-flags-mid-targeting-audit",
    topic: "Feature Flag Service",
    difficulty: "mid",
    prompt: "Design a feature flag platform with percentage rollouts, targeting rules, audit logs, and fast SDK evaluation.",
  },
  {
    id: "feature-flags-staff-global-consistency",
    topic: "Feature Flag Service",
    difficulty: "staff",
    prompt: "Design a globally distributed feature flag control plane with safe rollout guarantees, low-latency reads, and strong operational guardrails.",
  },
  {
    id: "webhooks-junior-events-basic",
    topic: "Webhook Delivery",
    difficulty: "junior",
    prompt: "Design a webhook delivery service that sends event notifications to third-party endpoints with retries and delivery logs.",
  },
  {
    id: "webhooks-mid-signing-backoff",
    topic: "Webhook Delivery",
    difficulty: "mid",
    prompt: "Design a webhook platform with signature verification, exponential backoff retries, dead-letter handling, and customer delivery visibility.",
  },
  {
    id: "webhooks-senior-multitenant-fanout",
    topic: "Webhook Delivery",
    difficulty: "senior",
    prompt: "Design a multi-tenant webhook delivery system that fans out millions of events, isolates noisy tenants, and preserves at-least-once guarantees.",
  },
  {
    id: "metrics-junior-basic-timeseries",
    topic: "Metrics Platform",
    difficulty: "junior",
    prompt: "Design a metrics platform that collects application counters and latency metrics and shows them on simple dashboards.",
  },
  {
    id: "metrics-mid-alerting-retention",
    topic: "Metrics Platform",
    difficulty: "mid",
    prompt: "Design a monitoring platform with time-series ingestion, alerting rules, retention policies, and dashboard queries over recent metrics.",
  },
  {
    id: "metrics-staff-high-cardinality",
    topic: "Metrics Platform",
    difficulty: "staff",
    prompt: "Design an observability metrics backend that handles high-cardinality labels, multi-tenant isolation, and cost-efficient long-term storage.",
  },
  {
    id: "gateway-junior-auth-routing",
    topic: "API Gateway",
    difficulty: "junior",
    prompt: "Design an API gateway that performs request routing, authentication checks, and rate limiting for a small group of backend services.",
  },
  {
    id: "gateway-mid-policies-quotas",
    topic: "API Gateway",
    difficulty: "mid",
    prompt: "Design an API gateway platform with per-tenant quotas, request transformation, access policies, and observability for external APIs.",
  },
  {
    id: "gateway-staff-global-edge",
    topic: "API Gateway",
    difficulty: "staff",
    prompt: "Design a globally distributed edge API gateway with policy propagation, abuse prevention, low-latency routing, and regional failover.",
  },
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickScenario(options: {
  difficulty?: Difficulty | "any";
  topic?: string | "any";
  excludeIds?: string[];
  dailySeed?: string;
}) {
  const filteredByDifficulty =
    !options.difficulty || options.difficulty === "any"
      ? DEFAULT_SCENARIOS
      : DEFAULT_SCENARIOS.filter((scenario) => scenario.difficulty === options.difficulty);

  const pool =
    !options.topic || options.topic === "any"
      ? filteredByDifficulty
      : filteredByDifficulty.filter((scenario) => scenario.topic === options.topic);

  const excludeSet = new Set(options.excludeIds ?? []);
  const freshPool = pool.filter((scenario) => !excludeSet.has(scenario.id));
  const candidates = freshPool.length > 0 ? freshPool : pool;

  if (candidates.length === 0) {
    throw new Error("No scenarios available for the selected filters.");
  }

  if (options.dailySeed) {
    const index = hashString(`${options.dailySeed}:${options.difficulty ?? "any"}:${options.topic ?? "any"}`) % candidates.length;
    return candidates[index];
  }

  return shuffle(candidates)[0];
}

export function listScenarioTopics() {
  return Array.from(new Set(DEFAULT_SCENARIOS.map((scenario) => scenario.topic))).sort();
}

export function getDifficultyGuidance(difficulty: Difficulty) {
  switch (difficulty) {
    case "junior":
      return "Keep the answer straightforward. Focus on core components, basic APIs, and a small-scale deployment with sensible defaults.";
    case "mid":
      return "Include solid component boundaries, data flow, scaling basics, and operational considerations expected from an experienced engineer.";
    case "senior":
      return "Include tradeoffs, failure handling, data consistency considerations, and scaling decisions that fit larger production workloads.";
    case "staff":
      return "Include system-wide tradeoffs, multi-region or multi-tenant concerns, cost and reliability implications, and strong operational reasoning.";
  }
}
