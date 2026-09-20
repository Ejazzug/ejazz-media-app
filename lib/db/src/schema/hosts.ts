import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hostsTable = pgTable("hosts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  instagramUrl: text("instagram_url"),
  twitterUrl: text("twitter_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHostSchema = createInsertSchema(hostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateHostSchema = insertHostSchema.partial();

export type InsertHost = z.infer<typeof insertHostSchema>;
export type UpdateHost = z.infer<typeof updateHostSchema>;
export type Host = typeof hostsTable.$inferSelect;
