---
name: GitHub integration boundaries
description: Distinguishes GitHub API connector access from authenticated Git operations in the Agent shell.
---

Do not assume that an active GitHub API connector or an “Active” GitHub Source Control settings entry gives the Agent shell working Git credentials. Verify with a non-interactive `git ls-remote` before planning a push.

**Why:** In this Repl, the OAuth API connector had repository admin access while HTTPS Git still failed authentication; the askpass bridge could be unavailable or return an unusable credential even after Source Control was refreshed. Both Git-data blob writes and Contents API writes through the connector later hit persistent Cloudflare 403 responses, so API access was not a reliable substitute for Git transport.

**How to apply:** Test remote read access before mutating branch state. Keep a parentless local commit/branch ready for the intended initial push, and avoid requesting or embedding personal access tokens when Replit’s credential bridge is unavailable.