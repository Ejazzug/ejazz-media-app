---
name: WordPress media hotlinking
description: Why EJazz WordPress featured images require a no-referrer browser policy.
---

Prefer each WordPress attachment's original `source_url` over Jetpack-resized `i0.wp.com` variants, and keep browser image requests on a no-referrer policy.

**Why:** Jetpack image variants returned HTTP 403, and the original EJazz-hosted attachment also returned 403 when the Expo preview origin was sent as the referrer. The same original attachment succeeds without a cross-site referrer.

**How to apply:** Preserve this behavior when changing the news mapper, image component, or document metadata. Native requests work without the preview referrer; web previews need the explicit policy.