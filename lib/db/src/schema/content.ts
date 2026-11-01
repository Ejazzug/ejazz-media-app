import { pgEnum, pgTable, text, timestamp, boolean, jsonb, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contentTypeEnum = pgEnum("content_type", [
  "fact",
  "poll",
  "announcement",
  "quiz",
  "song_battle",
  "push_alert",
  "show_alert",
  // A designed card: the same row shape, with template_id + template_fields saying which
  // card template drew it.  See cardTemplates.ts for the catalogue.
  "card",
]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "live", "withdrawn", "expired"]);
// Where a card or item appears in the app.  "home" is the single featured slot the shipped
// app renders today; "carousel" and "feed" are stored and served now and become visible on
// a phone at the next Codemagic build -- this box cannot produce one.
export const contentPlacementEnum = pgEnum("content_placement", ["home", "carousel", "feed"]);
export const pushTopicEnum = pgEnum("push_topic", ["all", "radio", "xtra"]);
export type PushTopic = (typeof pushTopicEnum.enumValues)[number];

export const contentItemsTable = pgTable("content_items", {
  id: serial("id").primaryKey(),
  type: contentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  imageUrl: text("image_url"),
  // Push behaviour: an optional link, and what a tap does -- "details" opens the full message
  // in the app, "link" opens linkUrl straight away. Markup in body: [label](https://...).
  linkUrl: text("link_url"),
  openMode: text("open_mode").notNull().default("details"),
  relatedArtist: text("related_artist"),
  relatedSong: text("related_song"),
  relatedShow: text("related_show"),
  relatedStation: text("related_station"),
  placement: contentPlacementEnum("placement").notNull().default("home"),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  pushTopic: pushTopicEnum("push_topic").notNull().default("all"),
  status: contentStatusEnum("status").notNull().default("draft"),
  pollOptions: jsonb("poll_options").$type<{ label: string; votes: number }[]>(),
  quizCorrectIndex: integer("quiz_correct_index"),
  // Card templates: which one drew this card, and the values its placeholders were given.
  // For a card the server writes a designer render URL into imageUrl from these two, so a
  // card needs no new app field to be visible.
  templateId: text("template_id"),
  templateFields: jsonb("template_fields").$type<Record<string, string>>(),
  // The approval decision for this item, as a fact on the row the scheduler already reads.
  // Default "approved" so every pre-existing row and every kind whose gate is off behaves
  // exactly as before.  The POLICY (which kinds need approving) stays in the dashboard's
  // lib/content_os.py -- this is the decision only, never a second policy store.
  approvalState: text("approval_state").notNull().default("approved"),
  approvalNote: text("approval_note"),
  approvalBy: text("approval_by"),
  approvalAt: timestamp("approval_at", { withTimezone: true }),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  // When set on a draft item, the API scheduler publishes it (and sends its push) at this time.
  scheduleAt: timestamp("schedule_at", { withTimezone: true }),
  pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The approval fields are deliberately NOT writable through the content CRUD: a card that
// could approve itself with a PATCH would make the gate decorative.  They move only through
// the approval endpoints.
export const insertContentItemSchema = createInsertSchema(contentItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  pushSentAt: true,
  approvalState: true,
  approvalNote: true,
  approvalBy: true,
  approvalAt: true,
});
export const updateContentItemSchema = insertContentItemSchema.partial();

export type InsertContentItem = z.infer<typeof insertContentItemSchema>;
export type UpdateContentItem = z.infer<typeof updateContentItemSchema>;
export type ContentItem = typeof contentItemsTable.$inferSelect;
