# api/ — Claude Code Instructions (Standalone API)

> This file covers the **standalone Next.js API** (`api/`) only.
> For full project context see the root `CLAUDE.md`.

---

## What lives here
The SeekMeal backend. A Next.js 14 app that exposes **only API Route Handlers** — no web UI, no pages. Runs on port 3001 locally. Deployed via Vercel (root directory pointed to `api/`).

---

## Folder structure

```
api/
├── app/
│   └── api/                          # All Route Handlers
│       ├── generate-meals/route.ts
│       ├── smart-meal-recommendation/route.ts
│       ├── regenerate-meal/route.ts
│       ├── meals/route.ts
│       ├── meals/[mealId]/
│       │   ├── foods/route.ts
│       │   └── log-actual/route.ts
│       ├── analyze-food-image/route.ts
│       ├── analyze-food-text/route.ts
│       ├── travel-mode/route.ts
│       ├── travel-mode/generate-day/route.ts
│       └── coach/chat/route.ts
├── lib/
│   ├── supabase.ts                   # Supabase client (anon key)
│   ├── supabase/server.ts            # Supabase server client (service role)
│   ├── ai-json.ts                    # Safe AI JSON parsing
│   └── anthropic/client.ts          # Anthropic Claude client (single instance)
├── next.config.js
├── package.json                      # dev: next dev --port 3001
└── tsconfig.json
```

---

## Route Handler rules

### Structure
- Every route is a Next.js Route Handler (`route.ts`) — not Express, not tRPC
- No web pages, no `page.tsx` files, no layouts — API only
- Return consistent JSON shape: `{ data, error }`

### Validation
- Validate all inputs before any Supabase or AI call
- Return `400` for bad input, `401` for auth failures, `500` for unexpected errors
- Never return raw AI output — always parse through `lib/ai-json.ts`

### Supabase
- Use `lib/supabase/server.ts` (service role) for protected operations
- Use `lib/supabase.ts` (anon key) for public reads only
- Never expose the service role key in responses or logs

### AI
- Anthropic routes use `lib/anthropic/client.ts` — single instance, do not re-instantiate
- Gemini is used in select routes — check the existing route before adding a new AI call
- All AI responses go through `lib/ai-json.ts` for safe parsing

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only — never expose) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (if used) |

---

## Shared logic with `mobile/`
`api/lib/` shares **copies** (not imports) of some logic with `mobile/lib/`:
- `ai-json.ts`, `meals.ts` (if present), `adjustMealPlan.ts` (if present)

If you change any of these, flag that `mobile/lib/` may need the same update.

---

## Dev server
```bash
cd api
npm install
npm run dev        # http://localhost:3001
```

Point `mobile/.env` `EXPO_PUBLIC_API_URL=http://localhost:3001` when testing locally.

---

## Vercel deployment
- Vercel root directory is set to `api/`
- Do not change `next.config.js` port or output settings without checking Vercel config

---

## Do not
- Add web UI pages (`page.tsx`, `layout.tsx`) — this is API only
- Import from `../mobile/` — the two apps are fully independent
- Log or return env variable values in responses
- Change the port away from 3001 without updating mobile env docs and Vercel settings
- Edit existing Supabase SQL migrations — create new ones only
