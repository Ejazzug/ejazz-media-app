# Environment variables and Replit Secrets

This file lists names and purposes only. It must never contain credential values.

## EJazz application configuration

- `EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL` — Public live-stream URL used by the EJazz Radio player.
- `EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL` — Public live-stream URL used by the EJazz Xtra player.
- `EXPO_PUBLIC_EJAZZ_NEWS_API_URL` — Public WordPress-compatible news endpoint used to load articles.
- `GOOGLE_SERVICES_JSON` — Firebase Android client configuration supplied as JSON in Replit and as a secret file in EAS.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase service-account credential used only for preparing or updating EAS FCM V1 credentials.

## Expo and Replit tooling

- `EXPO_TOKEN` — Expo account access token used by non-interactive EAS tooling; it is never bundled into the app.
- `REPLIT_EXPO_SESSION_SECRET` — Replit-managed Expo preview session credential used by the mobile development workflow.
- `EAS_BUILD` — EAS-provided build marker that makes Firebase client configuration mandatory during native builds.
- `EXPO_PACKAGER_PROXY_URL` — Development-only URL through which Replit exposes the Expo packager.
- `REACT_NATIVE_PACKAGER_HOSTNAME` — Development-only hostname advertised by the React Native packager.
- `EXPO_PUBLIC_DOMAIN` — Public host injected into Expo builds when the application needs an absolute service URL.
- `EXPO_PUBLIC_REPL_ID` — Public Replit project identifier injected into the Expo runtime.
- `REPLIT_EXPO_DEV_DOMAIN` — Replit-managed development hostname for the Expo packager.
- `REPLIT_DEV_DOMAIN` — Replit-managed development hostname used by local workflows and build fallbacks.
- `REPLIT_INTERNAL_APP_DOMAIN` — Replit-managed deployed application hostname preferred by the static web build.
- `REPL_ID` — Replit-managed project identifier used to derive public build metadata.

## Server and workspace runtime

- `DATABASE_URL` — Replit-managed PostgreSQL connection string required by the shared database package.
- `PORT` — Host-assigned listening port used by application workflows.
- `BASE_PATH` — Mounted URL prefix used by static serving and artifact previews.
- `NODE_ENV` — Standard runtime mode used for production logging and development-only tooling.
- `LOG_LEVEL` — Optional API logging verbosity, defaulting to `info`.
- `npm_config_user_agent` — Package-manager metadata used to enforce pnpm-based installation.

## Provisioned but not currently consumed by checked-in source

- `SESSION_SECRET` — Reserved server-session signing secret for future authenticated API sessions.