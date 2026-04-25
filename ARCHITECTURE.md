# SeekMeal — `seekmeal-app` workspace

This document describes **only** the folder  
`/Projects/Seekmeal-fontback/seekmeal-app`  
and its mobile subproject **`SeekMealApp/`**. It explains how **frontend** and **backend** responsibilities are split, and how directories map to those roles.

---

## Workspace overview

| Area | Path | Stack | Role |
|------|------|--------|------|
| **Web frontend + API** | `seekmeal-app/` (repo root) | Next.js 14 (App Router), React, Tailwind | Browser UI, auth/session middleware, **Route Handlers** under `app/api/` |
| **Mobile frontend** | `seekmeal-app/SeekMealApp/` | Expo (React Native), Expo Router | iOS/Android app; talks to HTTP APIs via `EXPO_PUBLIC_API_URL` |
| **Dedicated API (optional)** | `seekmeal-app/seekmeal-api/` | Next.js 14, API routes only | Same AI/meal endpoints as the main Next app, runnable on **port 3001** for split deploys |

**Shared concepts:** Supabase (auth + data), AI (Anthropic / Gemini depending on route), meal plans, progress, travel mode, coach chat. Types in `types/` (web) and `SeekMealApp/types/` stay aligned with the product domain.

---

## Frontend — what it does

### 1. Next.js web (`seekmeal-app/` root)

**Purpose:** Full SeekMeal experience in the browser: onboarding, daily meals, progress charts, coach, settings, travel-mode screens, history.

**How it works:** Pages under `app/*/page.tsx` render UI. Client components use `lib/supabase` and call **same-origin** `/api/*` routes. `middleware.ts` refreshes Supabase auth cookies when configured.

**Main user-facing routes (`app/`):**

| Path | Typical responsibility |
|------|-------------------------|
| `app/page.tsx` | Home / main dashboard |
| `app/onboarding/` | First-run profile and preferences |
| `app/auth/` | Sign in / sign up |
| `app/progress/`, `app/history/` | Trends, logs, history |
| `app/coach/` | AI coach UI |
| `app/settings/` | Account and preferences |
| `app/travel-waiting/`, `travel-generating/`, `travel-future/`, `travel-completed/` | Travel meal flow |

**UI building blocks (`components/`):** e.g. `MealCard`, charts (`WeeklyProgressChart`, `WeightPredictionChart`), `Cat`, `BottomNav`, modals (`EditMealModal`, `SpecialEventModal`), `AuthGuard`, loading/skeleton pieces.

**Client hooks:** `app/hooks/useAuth.ts`, `app/hooks/useStreak.ts`; root `hooks/useCat.ts` for cat companion behaviour on web.

---

### 2. Expo mobile (`SeekMealApp/`)

**Purpose:** Native SeekMeal client; reuses product ideas from web but implemented in React Native.

**How it works:** Expo Router under `SeekMealApp/app/`. Authenticated area uses **tabs**; settings can stack extra screens. API calls go to the **Next backend** URL in env (`EXPO_PUBLIC_API_URL`), not to a server inside the Expo folder.

**Router layout:**

| Path | Typical responsibility |
|------|-------------------------|
| `app/_layout.tsx` | Root providers, navigation shell |
| `app/login.tsx` | Auth entry |
| `app/onboarding.tsx` | Onboarding flow |
| `app/(tabs)/_layout.tsx` | Bottom tabs container |
| `app/(tabs)/index.tsx` | Home tab |
| `app/(tabs)/progress.tsx` | Progress tab |
| `app/(tabs)/coach.tsx` | Coach tab |
| `app/(tabs)/settings.tsx` | Settings tab |
| `app/(tabs)/two.tsx` | Placeholder / secondary tab (name may evolve) |
| `app/settings/*` | Stacked settings (`personal-info`, `nutrition-goals`, `dietary-preferences`, `_layout`) |

**UI (`components/`, `screens/`):** e.g. `AuthScreen`, `MealCard`, `Cat`, bottom sheets (`BottomSheet`, `GlobalBottomSheet`, `SpecialEventBottomSheet`), `MealOptionsModal`, `GeneratingMealOverlay`, `ProgressRing`, legal WebView modal, toasts.

**State / i18n:** `contexts/` (language, generating, bottom sheet), `context/OnboardingContext.tsx`, `locales/*.json`, `lib/i18n.ts`.

**Shared logic (`SeekMealApp/lib/`):** Supabase client, meal helpers (`meals.ts`, `adjustMealPlan.ts`, `nutrition.ts`, `validation.ts`), `ai-json.ts`, cat state (`lib/cat/`), motivational copy, profile defaults, constants.

**Hooks:** `hooks/useAuth.ts`, `hooks/useStreak.ts`.

---

## Backend — what it does

Backends here are **Next.js Route Handlers** (`route.ts`), not a separate Express service. They run on the **Node server** that hosts Next (web root or `seekmeal-api`).

**Responsibilities:**

- Validate requests, read/write **Supabase** (meals, profiles, logs) using server-side keys where needed.
- Call **AI** (Anthropic client in `lib/anthropic/`, or Gemini in individual routes) for generation, coach replies, food analysis, travel days.
- Return JSON to the web app or to **SeekMealApp** (when the app’s `EXPO_PUBLIC_API_URL` points at this host).

### API surface — main Next app (`seekmeal-app/app/api/`)

| Route | Function (summary) |
|-------|----------------------|
| `generate-meals` | Generate meal plan / day content with AI |
| `smart-meal-recommendation` | Contextual meal suggestions |
| `regenerate-meal` | Regenerate a single meal |
| `meals` | List/create/update meals (collection) |
| `meals/[mealId]/foods` | Foods attached to a meal |
| `meals/[mealId]/log-actual` | Log what the user actually ate |
| `analyze-food-image` | Interpret food from an image |
| `analyze-food-text` | Interpret food from free text |
| `travel-mode` | Travel-mode orchestration |
| `travel-mode/generate-day` | Generate travel day meals |
| `coach/chat` | AI coach conversation |
| `test-supabase`, `test-supabase/admin` | Diagnostics for Supabase connectivity |

### API surface — `seekmeal-api` (`seekmeal-api/app/api/`)

Same **product** endpoints as above **except** the `test-supabase` routes — optimized for running as a **standalone API** (default dev script uses **port 3001**).

**Libraries used by APIs:**

- `seekmeal-app/lib/` — `supabase` (client/server), `supabase-server.ts`, `meals.ts`, `adjustMealPlan.ts`, `ai-json.ts`, `anthropic/client.ts`, cat helpers under `lib/cat/`.
- `seekmeal-api/lib/` — `supabase.ts`, `supabase/server.ts`, `ai-json.ts` (lighter footprint than full web `lib/`).

---

## Folder and file structure

Below is a **logical** tree (omits `node_modules`, `.next`, build artifacts, and one-off assets). Use it as a map, not an exhaustive file listing.

```
seekmeal-app/
├── app/                          # Next.js App Router (WEB FRONTEND + API)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── api/                      # BACKEND — HTTP Route Handlers
│   │   ├── generate-meals/route.ts
│   │   ├── smart-meal-recommendation/route.ts
│   │   ├── regenerate-meal/route.ts
│   │   ├── meals/route.ts
│   │   ├── meals/[mealId]/foods/route.ts
│   │   ├── meals/[mealId]/log-actual/route.ts
│   │   ├── analyze-food-image/route.ts
│   │   ├── analyze-food-text/route.ts
│   │   ├── travel-mode/route.ts
│   │   ├── travel-mode/generate-day/route.ts
│   │   ├── coach/chat/route.ts
│   │   └── test-supabase/...
│   ├── auth/page.tsx
│   ├── onboarding/page.tsx
│   ├── progress/page.tsx
│   ├── history/page.tsx
│   ├── coach/page.tsx
│   ├── settings/page.tsx
│   ├── travel-*/page.tsx
│   └── hooks/                    # Web-only hooks (useAuth, useStreak)
├── components/                   # Web React components
├── hooks/useCat.ts
├── lib/                          # Web + server shared libraries
│   ├── supabase/, supabase.ts, supabase-server.ts
│   ├── anthropic/client.ts
│   ├── meals.ts, adjustMealPlan.ts, ai-json.ts
│   └── cat/
├── types/                        # Shared TS types (meal, cat, database, …)
├── public/
├── middleware.ts                 # Supabase session refresh on web
├── next.config.mjs
├── package.json
│
├── SeekMealApp/                  # MOBILE FRONTEND (Expo)
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── onboarding.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── coach.tsx
│   │   │   ├── settings.tsx
│   │   │   └── two.tsx
│   │   └── settings/
│   ├── components/
│   ├── screens/
│   ├── contexts/, context/
│   ├── hooks/
│   ├── lib/
│   ├── locales/
│   ├── types/
│   ├── constants/
│   ├── assets/
│   ├── app.json, app.config.js
│   ├── eas.json
│   └── package.json
│
└── seekmeal-api/                 # OPTIONAL DEDICATED BACKEND (Next API only)
    ├── app/api/                  # Same route names as web `app/api` (no test-supabase)
    ├── lib/
    │   ├── supabase.ts
    │   ├── supabase/server.ts
    │   └── ai-json.ts
    ├── package.json              # dev: next dev --port 3001
    └── tsconfig.json
```

**Other useful roots under `seekmeal-app/`** (supporting files, not core runtime architecture): SQL migrations/seeds (`*.sql`), `SETUP.md`, `middleware.ts` peers like `types/canvas-confetti.d.ts`, `scripts/`, Vercel config under `.vercel/`, and internal docs (`*.md`).

---

## How the pieces connect

1. **Web:** Browser → Next pages → `/api/*` on the **same** Next server → Supabase + AI.
2. **Mobile:** SeekMealApp → HTTP `EXPO_PUBLIC_API_URL` + `/api/...` → same Route Handler contracts as web → Supabase + AI.

For local development, run **either** the main Next app at the **`seekmeal-app` root** **or** **`seekmeal-api` on 3001`**, and point **`SeekMealApp`** env at that base URL.

---

## Quick reference

| Question | Answer |
|----------|--------|
| Where is the **browser UI**? | `seekmeal-app/app/*` + `seekmeal-app/components/` |
| Where is the **mobile UI**? | `seekmeal-app/SeekMealApp/app/*`, `components/`, `screens/` |
| Where is the **HTTP API** for meals / AI / coach? | `seekmeal-app/app/api/*` and/or `seekmeal-app/seekmeal-api/app/api/*` |
| Where is **auth/session** for web? | `middleware.ts` + `lib/supabase` (SSR/cookies) |
| Where does **mobile** store API base URL? | `SeekMealApp` env: `EXPO_PUBLIC_API_URL` (see `SeekMealApp/README_SEEKMEAL.md`) |
