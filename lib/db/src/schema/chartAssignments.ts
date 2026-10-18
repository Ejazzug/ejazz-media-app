import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export type ChartSnapshotEntry = { position: number; title: string; artist: string };

/**
 * A chart (generated on the Flask dashboard) that the operator has assigned to one or both
 * stations. The chart is SNAPSHOTTED here at assignment time so the app never depends on
 * the dashboard being reachable, and so nothing reaches listeners until it is assigned.
 * chart_id is the dashboard's own record id (podcasts/charts/<id>.json).
 */
export const chartAssignmentsTable = pgTable("chart_assignments", {
  chartId: text("chart_id").primaryKey(),
  title: text("title").notNull(),
  chartDate: text("chart_date"),
  entries: jsonb("entries").$type<ChartSnapshotEntry[]>().notNull().default([]),
  stations: jsonb("stations").$type<("radio" | "xtra")[]>().notNull().default([]),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChartAssignment = typeof chartAssignmentsTable.$inferSelect;
