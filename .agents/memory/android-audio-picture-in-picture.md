---
name: Android audio PiP
description: Product decision for picture-in-picture behavior in the EJazz audio app.
---

Android PiP is an optional, user-invoked compact player for live radio and podcasts. It is not a video pipeline and should not automatically open when the app is backgrounded.

**Why:** EJazz's current media experience is audio-only; PiP is useful as a small playback panel without adding fake video.

**How to apply:** Keep PiP controls connected to shared playback state, expose the entry point only while playing on supported Android versions, and validate the native flow on an Android build rather than the web preview.
