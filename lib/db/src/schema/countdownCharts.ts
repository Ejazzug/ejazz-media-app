import { pgTable, text, jsonb, timestamp, date, primaryKey } from "drizzle-orm/pg-core";

/**
 * A saved countdown (the dashboard's /countdown picker) that the operator has put on one or
 * both stations' Radio screens. Only assigned countdowns are ever snapshotted, so history
 * costs nothing for countdowns nobody shows.
 * countdown_id is the dashboard's own countdown id (countdowns.json), e.g. "daily-top-10".
 */
export const countdownChartStationsTable = pgTable("countdown_chart_stations", {
  countdownId: text("countdown_id").primaryKey(),
  name: text("name").notNull(),
  stations: jsonb("stations").$type<("radio" | "xtra")[]>().notNull().default([]),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * The countdown's shareable card: the picture the dashboard draws of this chart, and the
   * caption written to go with it (dashboard: lib/countdown_cards.py).
   *
   * Kept here, next to the assignment, for the same reason the snapshots are kept at all -- the
   * app must not depend on the dashboard being up. The sync that reads the chart stores these in
   * the same pass; null means that countdown has no card (no design chosen, or switched off), and
   * the app simply shows no share button. The URL is absolute and already carries the image's
   * own version, so a redrawn card is never served from a stale cache.
   */
  cardUrl: text("card_url"),
  cardCaption: text("card_caption"),
  cardUpdatedAt: timestamp("card_updated_at", { withTimezone: true }),
});

/**
 * One countdown's chart as it stood on a calendar day (Kampala date).
 *
 * `entries` is the most compact shape that still round-trips: a bare array of
 * [title, artist] pairs ordered best-first, so a song's position is its index + 1 and no
 * keys are repeated per song (about 0.6 KB for a Top 10). A row is only written when the
 * chart actually CHANGED, so a day with no row means "same as the latest earlier row" --
 * readers resolve a date to the newest row on or before it.
 */
export const countdownChartSnapshotsTable = pgTable(
  "countdown_chart_snapshots",
  {
    countdownId: text("countdown_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    entries: jsonb("entries").$type<[string, string][]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.countdownId, t.day] })],
);

export type CountdownChartStations = typeof countdownChartStationsTable.$inferSelect;
export type CountdownChartSnapshot = typeof countdownChartSnapshotsTable.$inferSelect;
