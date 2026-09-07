# EJazz Media App

EJazz Media App is a premium Android-first consumer app for live EJazz radio, EJazz eXTRA, and readable EJazz News.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `pnpm --filter @workspace/ejazz-media-app run dev` — run the Expo mobile app
- `pnpm --filter @workspace/ejazz-media-app run typecheck` — typecheck the mobile app

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 57, Expo Router, expo-audio, AsyncStorage

## Where things live

- `artifacts/ejazz-media-app/app/(tabs)/` — Home, Radio, News, and More destinations
- `artifacts/ejazz-media-app/context/PlayerContext.tsx` — shared station selection and audio playback state
- `artifacts/ejazz-media-app/components/MediaComponents.tsx` — reusable media UI and persistent mini-player
- `artifacts/ejazz-media-app/constants/colors.ts` — EJazz dark palette
- `artifacts/ejazz-media-app/README.md` — mobile setup, stream configuration, news integration, and release ownership notes

## Architecture decisions

- The first mobile build is frontend-first and keeps radio/news endpoints configurable; no database is required for V1.
- `expo-audio` is configured for background playback and Android lock-screen controls; streams are supplied through public Expo environment variables.
- The four primary destinations are intentionally fixed to Home, Radio, News, and More.
- EJazz-owned Firebase, Google Play, signing, and API credentials are treated as external production configuration rather than committed project state.

## Product

Users can browse a dark editorial home, select between EJAZZ RADIO and EJAZZ eXTRA, start live playback, keep listening through News, read article pages, search/filter the seeded editorial feed, share stations or stories, and access simple About/contact/legal links.

## User preferences

- Keep the product premium and editorial: avoid generic SaaS dashboard patterns, excessive cards, gradients, shadows, or feature clutter.
- Prioritize visual quality, reliable playback, fast loading, readability, background audio, and maintainability.

## Gotchas

- Set the two public stream URL variables before testing live playback; missing URLs intentionally show the retryable unavailable state.
- Never put CMS tokens, Firebase service-account credentials, or signing secrets in `EXPO_PUBLIC_*` values or source code.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
