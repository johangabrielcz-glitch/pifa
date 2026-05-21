# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build (TypeScript errors are intentionally ignored — next.config.mjs sets ignoreBuildErrors: true)
npm run start    # Run production server
npm run lint     # Run ESLint
```

There is **no test framework configured**. `scripts/*.mjs` and `scripts/test-engine.ts` are ad-hoc data-repair / verification scripts run manually with `node` against a live Supabase instance — they are not a test suite.

## Environment

Copy `.env.example` to `.env` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
CRON_SECRET
```

Database schema: run `/scripts/*.sql` files in numerical order via the Supabase SQL editor. RLS is intentionally disabled (`03-disable-rls.sql`) since auth is custom, not Supabase Auth.

## Architecture

### Routing (Next.js App Router)

Three route groups with distinct purposes:
- `app/(auth)/` — DT login and admin login
- `app/(admin)/` — admin console, CRUD for clubs/players/seasons/matches, broadcasting
- `app/(dashboard)/` — DT interface: multi-tab main page, transfer market, match detail/submission

### Business Engines (`/lib/*-engine.ts`)

All game logic lives in these five modules — never implement game mechanics directly in components or API routes:

| Engine | Responsibility |
|---|---|
| `match-engine.ts` | Result submission (`submitAnnotation`), standings, deadline management, W.O. auto-resolve |
| `market-engine.ts` | Transfer offers, direct buys, clause negotiations (`startClauseNegotiation`), player dismissals |
| `injury-engine.ts` | Stamina deduction, injury probability, red card suspensions, recovery |
| `contract-engine.ts` | Player eligibility (`canUsePlayer`), salary payments, season-end contract decrement |
| `morale-engine.ts` | Post-match morale updates, player email generation, `wants_to_leave` flag |

**Post-match cascade** — `finalizeMatch` (in `match-engine.ts`) fires these in a fixed order; `checkAndAutoResolveExpired` (cron) repeats the same sequence for W.O. resolutions. **Do not reorder** — see the in-code comment at the morale step:

1. `updateStandings` (league + group stage only) + `updatePlayerStats`
2. News generation (`POST /api/news/generate`, fire-and-forget)
3. `processEndOfMatchMorale` for both clubs — **must run before injury engine**, because `decrementSuspensionsAndInjuries` heals players and would make benched-but-now-healthy players incorrectly eligible for morale drops
4. `decrementSuspensionsAndInjuries` for both clubs
5. `processMatchFatigue`
6. `processRestRecovery`
7. `processInjuries`
8. `processRedCards`
9. `checkWaveCompletion` → `processByeRecovery` (stamina back for clubs that had no match this matchday)

Each injury-engine step is wrapped in its own `try/catch` so one failure doesn't block the rest. The string `[STATS-DONE]` is written to `matches.notes` after step 1 to make `updatePlayerStats` idempotent across W.O. / re-finalize paths.

### Auth

Uses a custom session (not Supabase Auth) stored in `localStorage` as `pifa_auth_session`. `lib/auth-context.tsx` is the global provider. The `role` field (`admin` / `user`) drives route redirects from `app/page.tsx`.

### Supabase Clients

`lib/supabase.ts` exports both a browser client (`supabase`) and `supabaseAdmin` (service role key, no session persistence). Always use `supabaseAdmin` inside `/app/api/` routes and inside every engine in `/lib/*-engine.ts` — they all `import { supabaseAdmin as supabase } from './supabase'`. If `SUPABASE_SERVICE_ROLE_KEY` is missing, it silently falls back to the anon key, which will break writes once RLS is re-enabled.

### Domain types

`lib/types.ts` is the single source of truth for the Supabase `Database` type and every domain shape (`Match`, `Player`, `Competition` config variants, `MatchAnnotation`, `GoalEntry`, `AssistEntry`, `SubstitutionEntry`, etc.). Engines and components import from here; don't redefine these shapes locally.

### AI Integration (Groq)

Used in `/api/player/chat`, `/api/market/clause-chat`, and `/api/news/generate`. All three routes implement the same cascading model fallback against `https://api.groq.com/openai/v1/chat/completions`:

```
openai/gpt-oss-120b
  → openai/gpt-oss-20b
  → meta-llama/llama-4-scout-17b-16e-instruct
  → llama-3.3-70b-versatile
  → qwen/qwen3-32b
```

Keep the list in sync across all three routes when changing models. News generation is fired automatically by `finalizeMatch` (best-effort) and can also be invoked manually from the admin console.

### Cron jobs (Vercel)

`vercel.json` schedules:

- `/api/cron/resolve-expired` — every minute. Calls `checkAndAutoResolveExpired` to auto-finalize matches past their deadline (W.O. rules).
- `/api/cron/reminders` — every 2 hours. Sends push reminders.

Both require header `Authorization: Bearer ${CRON_SECRET}`.

### Match deadlines

`calculateMatchDeadlines(seasonId)` runs when a season is activated. Deadlines are assigned by sequential day-slot keyed on `(category, matchday, leg)` where `category = league | cup` (with `groups_knockout` normalized to `cup`). Parallel leagues / parallel cups share a slot; different categories or matchdays consume sequential days starting at `activatedAt + 24h`. Re-activating a season recomputes from now.

### Key UI Patterns

- `components/pifa/` — domain-specific components (lineup builder, match drawer, player cards, chat)
- `components/ui/` — shadcn/Radix UI base primitives
- Shield images are resized client-side via `canvas` before upload to Supabase Storage
- Real-time global chat uses a Supabase Realtime channel (`global-chat.tsx`)
- Push notifications go through `lib/push-notifications.ts` (Expo)
