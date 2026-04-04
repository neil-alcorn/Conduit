// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/audience-scores.ts
// description: Drizzle schema stub for persisted audience score snapshots in the app layer.
// owner:       BOTH
// update:      Manual when audience score persistence is finalized.
// schema:      convoys/schema/convoy.schema.json
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const audienceScores = pgTable("audience_scores", {
  id: text("id").primaryKey(),
  convoyId: text("convoy_id").notNull(),
  audience: text("audience").notNull(),
  score: integer("score").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
