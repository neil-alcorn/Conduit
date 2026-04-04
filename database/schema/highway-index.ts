// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/highway-index.ts
// description: Drizzle schema stub for persisted highway index snapshots in the app layer.
// owner:       BOTH
// update:      Manual when Highway Index persistence is finalized.
// schema:      highway-index/schema/repo-entry.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const highwayIndex = pgTable("highway_index", {
  slug: text("slug").primaryKey(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
