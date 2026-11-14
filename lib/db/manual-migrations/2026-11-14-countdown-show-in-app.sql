-- countdown_chart_stations.show_in_app -- the dashboard's "Show in the app" switch.
--
-- Run this BEFORE deploying the api-server build that reads the column: every query against this
-- table selects every column, so the app's chart endpoints would error until it exists.
--
-- Additive and safe to run twice: nothing is dropped, nothing is rewritten, and every existing
-- row defaults to true, which is what those charts were already doing.
--
--   psql "$DATABASE_URL" -f lib/db/manual-migrations/2026-11-14-countdown-show-in-app.sql
--
-- Written by hand rather than with `pnpm push`: that generates 17 statements with no transaction
-- and drops constraints on its way through (see the repo notes).

ALTER TABLE countdown_chart_stations
  ADD COLUMN IF NOT EXISTS show_in_app boolean NOT NULL DEFAULT true;
