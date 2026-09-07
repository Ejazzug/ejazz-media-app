---
name: Centova recent-track cap
description: Provider limitation affecting jingle filtering and previous-track backfill for EJazz Radio.
---

The public Centova recent-tracks RPC returns at most 10 entries even when a larger limit is requested, and common page, offset, start, and from parameters are ignored.

**Why:** A jingle-heavy 10-entry window can contain fewer real songs than the UI normally displays, so filtering only the current payload causes history to shrink.

**How to apply:** Scan the full returned window, exclude station-jingle artists only from history, and preserve previously observed valid tracks across polling responses for honest backfill. Never fabricate missing tracks.