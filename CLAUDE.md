# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build (TypeScript errors are intentionally ignored)
npm run start    # Run production server
npm run lint     # Run ESLint
```

## Environment

Copy `.env.example` to `.env` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
CRON_SECRET
```

Database schema: run `/scripts/*.sql` files in numerical order via the Supabase SQL editor.

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

**Post-match cascade** — engines must fire in this order after every `submitAnnotation`:
1. `updateStandings` + `updatePlayerStats`
2. `processMatchFatigue`
3. `processInjuries` + `processRedCards`
4. morale update + email generation

### Auth

Uses a custom session (not Supabase Auth) stored in `localStorage` as `pifa_auth_session`. `lib/auth-context.tsx` is the global provider. The `role` field (`admin` / `user`) drives route redirects from `app/page.tsx`.

### Supabase Clients

`lib/supabase.ts` exports both a browser client and `supabaseAdmin` (service role key). Always use `supabaseAdmin` inside `/app/api/` routes.

### AI Integration (Groq)

Used in `/api/player/chat`, `/api/market/clause-chat`, and `/api/news/generate`. All three routes implement a cascading model fallback:
`openai/gpt-oss-120b` → `gpt-oss-20b` → `llama-4-scout` → `qwen3-32b`

### Key UI Patterns

- `components/pifa/` — domain-specific components (lineup builder, match drawer, player cards, chat)
- `components/ui/` — shadcn/Radix UI base primitives
- Shield images are resized client-side via `canvas` before upload to Supabase Storage
- Real-time global chat uses a Supabase Realtime channel (`global-chat.tsx`)
- Push notifications go through `lib/push-notifications.ts` (Expo)
