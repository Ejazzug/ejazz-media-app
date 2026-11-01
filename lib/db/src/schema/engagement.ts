import { pgTable, text, timestamp, integer, serial, date, primaryKey, unique, index } from "drizzle-orm/pg-core";
import { contentItemsTable } from "./content";

/**
 * What the audience did with a content item: impressions, clicks, votes and likes.
 *
 * Two shapes on purpose, decided with the owner 2026-11-01:
 *
 * - Impressions and clicks are PER DAY PER ITEM aggregates, never one row per event. This
 *   box has 7.8 GB of RAM, no swap and no retention job anywhere in its history, so an
 *   event log would grow without a bound or a sweeper. A day row is updated in place.
 * - Votes and likes keep one row per voter, because the whole point of building them is to
 *   count each person once. `voter_key` is the app's own install id -- there are no accounts
 *   and no push tokens, so it is the only identity available. It is never treated as a
 *   person, only as a tally key, and the length check bounds what a caller can store.
 *
 * NOTHING increments any of these yet: the shipped app POSTs nothing, anywhere, and these
 * counts can only start moving after a Codemagic build this box cannot produce. Until then
 * every figure derived from them reads an honest zero rather than a fabricated one.
 */
export const contentMetricsTable = pgTable(
  "content_metrics",
  {
    contentItemId: integer("content_item_id")
      .notNull()
      .references(() => contentItemsTable.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.contentItemId, t.day] }) }),
);

export const contentVotesTable = pgTable(
  "content_votes",
  {
    id: serial("id").primaryKey(),
    contentItemId: integer("content_item_id")
      .notNull()
      .references(() => contentItemsTable.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    voterKey: text("voter_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneVoteEach: unique().on(t.contentItemId, t.voterKey),
    byItem: index("content_votes_item_idx").on(t.contentItemId),
  }),
);

export const contentLikesTable = pgTable(
  "content_likes",
  {
    contentItemId: integer("content_item_id")
      .notNull()
      .references(() => contentItemsTable.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.contentItemId, t.voterKey] }) }),
);

export type ContentMetricsRow = typeof contentMetricsTable.$inferSelect;
export type ContentVoteRow = typeof contentVotesTable.$inferSelect;
export type ContentLikeRow = typeof contentLikesTable.$inferSelect;
