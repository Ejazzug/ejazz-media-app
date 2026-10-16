---
name: R8 release optimization
description: Release-build optimization choice for EJazz Android.
---

Release builds should use R8 with the optimized Android ProGuard rules. Keep resource shrinking disabled unless a later Android validation explicitly checks it.

**Why:** The project wants better Play Console DEX optimization and obfuscation metrics, while resource shrinking is a separate risk that was not needed for that goal.

**How to apply:** Preserve the optimized rules through Expo prebuild and test a preview Android build before publishing; do not promise a specific obfuscation percentage because most app logic is JavaScript.
