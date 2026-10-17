import { jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Single-row table (id = 1) holding the remote app configuration that the
 * Control Room edits and the mobile app reads from GET /api/app-config.
 * The JSON shape is validated/normalised in the API server (lib/appConfig.ts).
 */
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettingsRow = typeof appSettingsTable.$inferSelect;
