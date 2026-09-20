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
]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "live", "withdrawn", "expired"]);
export const contentPlacementEnum = pgEnum("content_placement", ["home"]);

export const contentItemsTable = pgTable("content_items", {
  id: serial("id").primaryKey(),
  type: contentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  imageUrl: text("image_url"),
  relatedArtist: text("related_artist"),
  relatedSong: text("related_song"),
  relatedShow: text("related_show"),
  relatedStation: text("related_station"),
  placement: contentPlacementEnum("placement").notNull().default("home"),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  status: contentStatusEnum("status").notNull().default("draft"),
  pollOptions: jsonb("poll_options").$type<{ label: string; votes: number }[]>(),
  quizCorrectIndex: integer("quiz_correct_index"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContentItemSchema = createInsertSchema(contentItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateContentItemSchema = insertContentItemSchema.partial();

export type InsertContentItem = z.infer<typeof insertContentItemSchema>;
export type UpdateContentItem = z.infer<typeof updateContentItemSchema>;
export type ContentItem = typeof contentItemsTable.$inferSelect;
