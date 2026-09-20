import { pgEnum, pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const showStationEnum = pgEnum("show_station", ["radio", "xtra"]);

export const showsTable = pgTable("shows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostName: text("host_name"),
  station: showStationEnum("station").notNull(),
  // 0 = Sunday .. 6 = Saturday, local (EAT) time
  dayOfWeek: integer("day_of_week").notNull(),
  // minutes since local midnight
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  description: text("description"),
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
