import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * A short fact shown under the player while a matching song is on air.
 *
 * Matching is on NORMALISED keys (lib/trackKey.ts), never on the display text, because the
 * station's tags are messy ("Burna Boy - Last Last" in the title, empty artist, "feat."
 * variants). title_key = '' means an artist-level fact that applies to any of their songs;
 * a song-level fact wins over an artist-level one.
 *
 * source: 'ai' = written by Gemini the first time the song was seen, 'manual' = typed in the
 * Control Room. A manual fact is never overwritten by generation.
 */
export const songFactsTable = pgTable(
  "song_facts",
  {
    id: serial("id").primaryKey(),
    artistKey: text("artist_key").notNull(),
    titleKey: text("title_key").notNull().default(""),
    artist: text("artist").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    source: text("source").notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("song_facts_key_idx").on(t.artistKey, t.titleKey)],
);

export type SongFact = typeof songFactsTable.$inferSelect;
