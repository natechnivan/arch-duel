# Arch Duel

[![CI](https://github.com/natechnivan/arch-duel/actions/workflows/ci.yml/badge.svg)](https://github.com/natechnivan/arch-duel/actions/workflows/ci.yml)

Arch Duel is a system design interview game built with Next.js, Gemini, Postgres, and Drizzle. Each round shows an AI-generated design answer for a real system design prompt, and the player has to classify whether the answer is solid, incomplete, flawed, or pure buzzword filler.

Live app: https://arch-duel.vercel.app/

## Current Features

The project currently ships with:

- Practice rounds and daily challenge mode
- Difficulty and topic filters
- Guest play with browser-persisted score and session continuity
- Account registration and login with secure cookie sessions
- Persistent attempts, streaks, weak-area tracking, and leaderboard data
- A paginated `/history` page for logged-in users
- An `/admin` console for scenario pack management
- AI-assisted scenario generation and live prompt validation tools for admins

This is no longer just a static prompt list. The playable scenario catalog, generated rounds, attempts, and account data are all persisted in Postgres.

## How Gameplay Works

1. Start a round or open the daily challenge.
2. Read the generated design answer for the selected topic and difficulty.
3. Classify it as one of:
   - `legit`
   - `incomplete`
   - `flawed`
   - `buzzword_bs`
4. Pick the missing or most impacted bucket:
   - `none`
   - `api`
   - `data_model`
   - `scaling`
   - `caching`
   - `queue_stream`
   - `consistency`
   - `partitioning`
   - `observability`
   - `security`
   - `other_tradeoffs`
5. Submit to get the score, verdict, explanation, hidden issue, fix suggestions, and learning takeaway.
6. Retry the same round in practice mode if you want feedback without affecting score.

Scoring:

- Correct kind and bucket: `+10`
- Correct kind, wrong bucket: `+7`
- Close miss between `incomplete` and `flawed`: `+5`
- Otherwise: `+0`

If the ground truth is `legit`, the bucket is treated as `none`.

## Main User Features

- Daily challenge flow with CDN cache headers and one scored daily attempt per user/session per UTC day
- Standard rounds with recent-scenario exclusion to reduce repeats
- Active round restore from local storage if the tab reloads
- Practice retry mode after scoring
- Logged-in dashboard with:
  - total attempts
  - accuracy
  - score
  - streak
  - recent weak areas
  - difficulty breakdown
  - recent attempt history
- Top-10 leaderboard
- Full paginated history page for authenticated users
- Theme switching with `system`, `light`, and `dark`

## Admin Features

The admin console at `/admin` is enabled only for accounts whose email appears in `ADMIN_EMAILS`.

Admins can:

- Seed the built-in core scenario pack into the database
- Create and edit scenario packs
- Create and edit individual scenarios
- Generate batches of AI-authored scenarios into a selected pack
- Run live prompt validation against sample scenarios to catch contract or quality issues

The app uses a database-backed scenario catalog at runtime. If database scenarios exist, gameplay pulls from those. The built-in scenario list acts as seed data and fallback topic metadata, not the primary operating model.

## Architecture

### Frontend

- `app/page.tsx`: main game UI, auth modal flow, dashboard, leaderboard, topic filter, daily cache handling, and round state persistence
- `app/history/page.tsx`: paginated attempt history for logged-in users
- `app/admin/page.tsx`: admin console for packs, scenarios, generation, and validation

### API

- `POST /api/generate`: generates and stores a round
- `POST /api/evaluate`: scores a submission using the persisted round answer key
- `POST /api/round-result`: restores the last scored result for a round
- `GET /api/bootstrap`: returns session user and active topics
- `GET /api/dashboard`: returns leaderboard, user stats, history summary, and admin data
- `GET /api/history`: returns paginated attempt history for the current user
- `POST /api/auth/register`: creates an account
- `POST /api/auth/login`: creates a cookie-backed session
- `POST /api/auth/logout`: clears the active session
- `GET /api/auth/me`: returns the current session user
- `GET /api/admin/overview`: checks admin access
- `POST /api/admin/seed-defaults`: seeds the default scenario pack
- `GET/POST /api/admin/scenario-packs`: list or create packs
- `GET/PATCH /api/admin/scenario-packs/[packId]`: inspect or update a pack
- `POST /api/admin/scenarios`: create a scenario
- `PATCH /api/admin/scenarios/[scenarioId]`: update a scenario
- `POST /api/admin/generate-scenarios`: create AI-generated scenario rows
- `POST /api/admin/validate-prompts`: validate prompt output against sample scenarios

### Persistence Model

Database tables in [db/schema.ts](/e:/Apps/arch-duel/db/schema.ts):

- `users`
- `sessions`
- `scenario_packs`
- `scenarios`
- `rounds`
- `attempts`

Important implementation detail: the browser never receives the round answer key from `/api/generate`. The server stores it in `rounds`, and `/api/evaluate` resolves the expected answer from the database before scoring.

## Tech Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16, React 18, TypeScript |
| Styling | Tailwind CSS |
| AI | Google Gemini via `@google/generative-ai` |
| Validation | Zod |
| Database | Postgres |
| ORM | Drizzle ORM + Drizzle Kit |

## Local Setup

### Prerequisites

- Node.js 18+
- A Postgres database
- A Gemini API key from https://aistudio.google.com/app/apikey

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgres://user:password@host:5432/database
ADMIN_EMAILS=admin@example.com
```

Notes:

- `DATABASE_URL` or `POSTGRES_URL` is required for real gameplay, scoring, accounts, admin tools, and persistence.
- `ADMIN_EMAILS` is a comma-separated allowlist for `/admin`.

### Install And Run

```bash
git clone https://github.com/natechnivan/arch-duel.git
cd arch-duel
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Open `http://localhost:3000`.

### Available Commands

```bash
npm run dev
npm run build
npm start
npm run lint
npm run typecheck
npm run db:push
npm run db:studio
```

## Database Notes

- Drizzle config lives in [drizzle.config.ts](/e:/Apps/arch-duel/drizzle.config.ts)
- DB client setup is in [db/index.ts](/e:/Apps/arch-duel/db/index.ts)
- Query helpers are in [db/queries.ts](/e:/Apps/arch-duel/db/queries.ts)
- Default built-in scenarios live in [app/api/_lib/scenarios.ts](/e:/Apps/arch-duel/app/api/_lib/scenarios.ts)

On a fresh database, sign up with an admin email and then use `/admin` to run `Seed Default Scenarios`. That creates the initial playable scenario pack in Postgres.

## Current Built-In Topic Coverage

The built-in scenario set currently covers:

- URL Shortener
- Rate Limiter
- Notification System
- Feed
- Chat
- File Upload
- Analytics Pipeline
- Search
- Payments
- Recommendation System
- Video Streaming
- Collaborative Editing
- Job Scheduler
- Feature Flag Service
- Webhook Delivery
- Metrics Platform
- API Gateway

Difficulty coverage spans `junior`, `mid`, `senior`, and `staff`, depending on the scenario.

## Operational Behavior

- Gemini calls are retried on overload-style failures
- Client fetches retry transient `429`, `502`, `503`, and `504` responses
- Daily rounds are cacheable at the CDN layer
- The app keeps a minimum shimmer/loading display to avoid UI flicker
- Guest score is stored in `localStorage`
- Logged-in score and history come from persisted attempts in Postgres
- The active round is cached locally so refreshes can restore in-progress play

## Known Constraints

- Gemini availability still affects round generation and explanation quality
- Leaderboard and stats use application-side aggregation logic and are not optimized for very large datasets yet
- Anonymous players get local score persistence, but the richer stats and history flows are account-based

## License

MIT. See [LICENSE](/e:/Apps/arch-duel/LICENSE).
