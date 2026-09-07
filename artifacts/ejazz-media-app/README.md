# EJazz Media App

The official EJazz Media Android app: live EJazz Radio, EJazz Xtra, and an editorial EJazz News reading experience designed around one promise — **Your Vibe. Your News. Your EJazz.**

## Run locally

From the repository root:

```bash
pnpm install
pnpm --filter @workspace/ejazz-media-app run dev
```

Use the Expo preview or scan the QR code with Expo Go. The app is portrait-first and supports Android, iOS, and web preview.

## Configure the radio streams

The player is built around `expo-audio` with background playback and Android lock-screen controls enabled in `app.json`. Set the public stream URLs in the Expo build environment:

```text
EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL=https://your-radio-stream.example/live
EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL=https://your-extra-stream.example/live
```

Only public stream URLs belong in the app bundle. Never put stream-provider credentials or private keys in `EXPO_PUBLIC_*` values.

The player is intentionally resilient when a stream is missing or temporarily unavailable: it shows a user-friendly error with retry instead of crashing.

## Configure EJazz News

The current V1 UI uses a small local editorial seed so the app is immediately previewable. The content boundary is kept separate from the UI so it can be connected to the existing EJazz News website/CMS without changing navigation or article presentation.

When the CMS endpoint is selected, add a server-side proxy or public RSS/API URL using:

```text
EXPO_PUBLIC_EJAZZ_NEWS_API_URL=https://news.example/api
EXPO_PUBLIC_EJAZZ_NEWS_RSS_URL=https://news.example/feed.xml
```

Do not expose a CMS token in the mobile app. If authentication is required, add the proxy route to `artifacts/api-server` and keep the credential server-side.

## Firebase and Android release ownership

Firebase configuration, Google Play Console access, the Android signing key, and production environment values should be created in EJazz Media-owned accounts. Add the final Firebase Android configuration through the normal Expo app configuration flow once the EJazz Firebase project exists; do not commit private service-account credentials.

For a production Android release:

1. Confirm the final package ID in `app.json` (`com.ejazzmedia.app`).
2. Configure EJazz-owned signing credentials and Google Play access.
3. Set production stream and news configuration.
4. Build a signed Android App Bundle through the team’s chosen Expo/Android release process.
5. Upload the `.aab` to EJazz Media’s Google Play Console and test the internal track before promotion.

## V1 structure

- `context/PlayerContext.tsx` owns station selection, audio state, retry state, background playback, and lock-screen metadata.
- `components/MediaComponents.tsx` contains the reusable media UI: wordmark, station cards, story cards, player controls, and the persistent mini-player.
- `app/(tabs)/` contains the four primary destinations: Home, Radio, News, and More.
- `app/article.tsx` is the readable article route.
- `constants/colors.ts` is the single source of truth for the dark EJazz palette.

Future podcasts, video, artists, playlists, events, notifications, accounts, and premium content can be added as separate domain modules without changing the four-destination navigation contract.