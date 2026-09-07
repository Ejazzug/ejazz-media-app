---
name: Expo lint compatibility
description: Why this Expo project uses a lightweight TypeScript ESLint setup instead of Expo's preset.
---

Use the lightweight TypeScript ESLint configuration unless the Expo preset's dependency graph has changed and can be verified cleanly.

**Why:** The Expo SDK 57 lint preset loaded a React Hooks plugin whose nested dependency lacked the package export it imported under pnpm. Adding a newer direct copy did not change the plugin's isolated nested resolution.

**How to apply:** When updating lint tooling, test the Expo preset in isolation first. Keep the current setup if the preset still fails during configuration loading; do not add workspace-wide dependency overrides solely for lint.