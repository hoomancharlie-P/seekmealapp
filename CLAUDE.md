# Seekmeal-mobile — Claude Code Instructions

## What this app is
SeekMeal is an AI-assisted meal planning and nutrition app. Users get personalized daily meal plans, log food (via photo or text), track progress, use travel mode for trips, and chat with an AI coach. A cat companion adds a habit/personality layer. Backend uses Supabase (auth + data) and Gemini AI for generation, coach replies, and food understanding.

---

## Workspace layout

```
Seekmeal-mobile/
├── mobile/          # Expo (React Native) mobile app — iOS & Android
├── api/             # Next.js 14 standalone API — serves mobile via HTTP
├── .claudeignore
└── CLAUDE.md
```

| Area | Path | Stack |
|------|------|-------|
| Mobile frontend | `mobile/` | Expo SDK, React Native, Expo Router, TypeScript |
| Backend API | `api/` | Next.js 14, Route Handlers only, TypeScript |

**There is no web frontend.** This is a mobile-first project. Do not create web pages, web components, or browser-specific code.

---

## Tech stack

- **Mobile:** Expo SDK, React Native, Expo Router (file-based), TypeScript
- **Backend:** Next.js 14 Route Handlers (no web UI)
- **Auth + DB:** Supabase (client-side in mobile, server-side SSR in API)
- **AI:** Google Gemini (primary), Anthropic Claude (`api/lib/anthropic/client.ts`) depending on route
- **i18n (mobile):** `mobile/locales/*.json` via `mobile/lib/i18n.ts`

---

## How the pieces connect

```
mobile/ ──── EXPO_PUBLIC_API_URL ────► api/app/api/*  ────► Supabase + AI
```

- Mobile never talks to Supabase directly for data mutations — always goes through `api/`
- Mobile uses Supabase client-side only for auth session management
- All API calls from mobile use `EXPO_PUBLIC_API_URL` env variable — never hardcoded URLs

---

## API routes (full list)

| Route | Function |
|-------|----------|
| `generate-meals` | Generate meal plan with AI |
| `smart-meal-recommendation` | Contextual meal suggestions |
| `regenerate-meal` | Regenerate a single meal |
| `meals` | List / create / update meals |
| `meals/[mealId]/foods` | Foods attached to a meal |
| `meals/[mealId]/log-actual` | Log what user actually ate |
| `analyze-food-image` | Interpret food from image |
| `analyze-food-text` | Interpret food from text |
| `travel-mode` | Travel mode orchestration |
| `travel-mode/generate-day` | Generate travel day meals |
| `coach/chat` | AI coach conversation |

---

## Shared logic — important note

`mobile/lib/` and `api/lib/` both contain copies of:
- `ai-json.ts` — safe AI JSON parsing
- `meals.ts` — meal business logic
- `adjustMealPlan.ts` — meal plan adjustment

**These are intentionally separate copies** (different runtime environments). If you change logic in one, check if the same change is needed in the other and update both.

---

## Running locally

### API
```bash
cd api
npm install
npm run dev        # runs on port 3001
```

### Mobile
```bash
cd mobile
npm install
npx expo start
```
Set `EXPO_PUBLIC_API_URL=http://localhost:3001` in `mobile/.env`.

---

## Do not
- Create web pages, web components, or anything browser-specific
- Import between `mobile/` and `api/` — they are independent apps
- Hardcode API URLs in mobile code — always use `EXPO_PUBLIC_API_URL`
- Expose `.env` values or Supabase service-role keys to the client
- Edit existing Supabase SQL migrations — create new ones instead
- Use `'use client'`, `useRouter` from `next/navigation`, or `window.*` in mobile code

---

## When making changes — checklist
- [ ] Does this change the API contract? If yes, update both the route and the mobile API call
- [ ] Did you add a new env variable? Document it in the relevant README
- [ ] Did you add a new AI call? Use the existing client and `ai-json.ts` utility
- [ ] Did you change Supabase schema? Write a new migration — never edit existing ones
- [ ] Did you change shared logic (`ai-json`, `meals`, `adjustMealPlan`)? Check if the other app needs the same change
