import { pgTable, serial, text, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

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
 *
 * The five columns after the timestamps carry the library sweep and the repurpose hub. They
 * were added by hand (ALTER TABLE, 2026-11-18); this file is kept matching so a push is a
 * no-op, which is the only reason a push is survivable here.
 *
 * - proof_state  '' = never proofread, 'auto' = passed the automatic three-pass proofread,
 *                'human' = a person's wording (a CSV round trip, or an edit in the facts
 *                section -- which also forces source='manual').
 * - proof_notes  what the passes changed, and what a person ought to check: the unsourced
 *                names and numbers grounding.py reports, plus the wording pass's
 *                before/after. Written to be READ by a human, never parsed.
 * - pushed_at    set by "Push to hub" in the facts section. This column IS the whole
 *                cross-service contract: the dashboard's lib/song_facts.py reads it over the
 *                loopback door and draws the hub's tray from it. The decision is a fact on
 *                the row rather than an opinion in another service's overlay -- the same
 *                discipline an App Card's approval state already follows.
 * - retry_after  when a "no fact" marker (enabled=false, body='') may be asked again.
 *                Without it alreadyTried() blocks a song for good, which is how 109 songs
 *                came to be permanently dead after one ask on an ungrounded provider.
 * - sources      the grounding citations behind an 'ai' fact. Google redirect URIs that
 *                expire, so they are citations FOR A HUMAN to check -- never sources that
 *                anything here can re-fetch and quote from.
 * - variants     OTHER WORDINGS of this song's fact, so a listener who hears the song twice
 *                does not read the same sentence twice. `body` is the first wording and the
 *                one everything else edits; the serving path rotates over
 *                [body, ...variants].
 *
 *                A variant is a rephrasing or a second fact about the same song -- never a
 *                different song. One row per song is deliberate: the unique
 *                (artist_key, title_key) index below is what findFact, alreadyTried, the
 *                generator's upsert, the sheet sync and the CSV import are all built on, and
 *                a second row per song would mean changing every one of them.
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
    proofState: text("proof_state").notNull().default(""),
    proofNotes: text("proof_notes").notNull().default(""),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    sources: jsonb("sources").$type<{ title: string; url: string }[]>(),
    variants: jsonb("variants").$type<string[]>(),
  },
  (t) => [uniqueIndex("song_facts_key_idx").on(t.artistKey, t.titleKey)],
);

export type SongFact = typeof songFactsTable.$inferSelect;
