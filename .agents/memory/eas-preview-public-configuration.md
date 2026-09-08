---
name: EAS preview public configuration
description: How EJazz public runtime URLs reach remotely built preview APKs.
---

EAS preview builds must explicitly use the EAS `preview` environment, and the EJazz public Radio, Xtra, and News URLs must exist there as project environment variables.

**Why:** Replit workspace secrets are available locally but are not automatically inherited by remote EAS builds. A successful APK can otherwise bundle empty public URLs and fail only on a physical device.

**How to apply:** When changing or rebuilding preview APKs, verify variable existence in EAS without printing values. Keep this preview-only unless the user explicitly requests production configuration changes.