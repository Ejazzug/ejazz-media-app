import { pgEnum, pgTable, text, integer, jsonb, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const showStationEnum = pgEnum("show_station", ["radio", "xtra"]);

/** How a programme entry repeats. */
export type ShowRepeatMode = "weekly" | "monthly" | "dates";

/** One airing window inside a day. A show can have several (e.g. 09:00 and 18:00). */
export type ShowSlot = { startMinute: number; endMinute: number };

export const showsTable = pgTable("shows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostName: text("host_name"),
  station: showStationEnum("station").notNull(),
  // 0 = Sunday .. 6 = Saturday, local (EAT) time.
  //
  // Kept as the entry's FIRST occurrence even though daysOfWeek/slots below are the
  // real schedule: the shipped app validates every row of GET /api/shows for a numeric
  // dayOfWeek/startMinute and drops the whole lineup if one is missing, and those builds
  // cannot be changed retroactively. The public route expands an entry into rows of this
  // old shape; the admin route returns the entry itself, for editing.
  dayOfWeek: integer("day_of_week").notNull(),
  // minutes since local midnight
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  description: text("description"),

  /** "weekly" (daysOfWeek), "monthly" (datesOfMonth) or "dates" (dates). */
  repeatMode: text("repeat_mode").notNull().default("weekly"),
  /** Weekly mode: every weekday it airs on, 0 = Sunday. Empty = [dayOfWeek]. */
  daysOfWeek: jsonb("days_of_week").$type<number[]>(),
  /** Monthly mode: days of the month, 1-31. A month without that date simply skips it. */
  datesOfMonth: jsonb("dates_of_month").$type<number[]>(),
  /** Dates mode: exact calendar dates, "YYYY-MM-DD" in EAT. */
  dates: jsonb("dates").$type<string[]>(),
  /** Every airing window in the day. Empty = [{startMinute, endMinute}] above. */
  slots: jsonb("slots").$type<ShowSlot[]>(),
  /** Programme artwork (https). Falls back to the station logo in the app. */
  imageUrl: text("image_url"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShowSchema = createInsertSchema(showsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateShowSchema = insertShowSchema.partial();

export type InsertShow = z.infer<typeof insertShowSchema>;
export type UpdateShow = z.infer<typeof updateShowSchema>;
export type Show = typeof showsTable.$inferSelect;
