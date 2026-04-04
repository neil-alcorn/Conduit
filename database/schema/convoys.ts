// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/convoys.ts
// description: Drizzle schema for the convoys table.
// owner:       BOTH
// update:      Manual when convoy persistence structure changes.
// schema:      database/migrations/001_initial.sql
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const convoys = pgTable("convoys", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  workType: text("work_type").notNull(),
  stage: integer("stage").notNull().default(0),
  status: text("status").notNull().default("active"),
  adoWorkItem: text("ado_work_item"),
  audienceScores: jsonb("audience_scores").notNull(),
  bpGateRequired: text("bp_gate_required").notNull().default("false"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
