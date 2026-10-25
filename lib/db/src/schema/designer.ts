import { pgTable, text, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The EJazz in-house designer's three stores. Postgres holds the brand, the presets and the
 * operator's own templates; /opt/radio/lib/designer.py is the RENDERER OF RECORD and the only
 * thing that draws a pixel. Nothing here is read by the shipped app.
 *
 * These tables were created by hand (pg_dump, then CREATE TABLE -- see CLAUDE.md "Traps" on
 * why drizzle-kit push is never used here). This file is kept matching so a push would be a
 * no-op; change both together or they drift.
 */

/**
 * One brand asset. `value` means something different per kind, deliberately -- one small table
 * beats three nearly-identical ones:
 *   logo   -> an absolute path on this box, inside designer.ASSET_ROOTS or the renderer
 *             refuses to read it
 *   colour -> a hex string, e.g. "#FF0056"
 *   font   -> a font name the renderer resolves in /opt/radio/fonts (OFL only)
 */
export const brandAssetsTable = pgTable("brand_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"logo" | "colour" | "font">().notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A saved set of presentation overrides, applied on top of a template at render time. It can
 * set the background, a shared style and per-placeholder style -- never geometry, and never a
 * new placeholder, because a preset that could move things would be a second template and then
 * "what does this design look like" has two answers.
 */
export const presetsTable = pgTable("presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull().default("design"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An operator-made template. The id is the template's own slug (it names the rendered file), so
 * it is the primary key rather than a uuid. The templates that shipped with the box live on
 * disk in /opt/radio/templates/ and are NOT copied in here: the render route falls back to
 * disk, so a shipped template keeps working whether or not anyone has opened it in the editor.
 */
export const templatesTable = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrandAsset = typeof brandAssetsTable.$inferSelect;
export type DesignPreset = typeof presetsTable.$inferSelect;
export type DesignTemplate = typeof templatesTable.$inferSelect;
