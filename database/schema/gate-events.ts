// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/gate-events.ts
// description: Drizzle schema for the gate_events table.
// owner:       BOTH
// update:      Manual when gate event persistence structure changes.
// schema:      database/migrations/001_initial.sql
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

import { convoys } from "./convoys";
import { workstreams } from "./workstreams";

export const gateEvents = pgTable("gate_events", {
  id: text("id").primaryKey(),
  convoyId: text("convoy_id").notNull().references(() => convoys.id),
  workstreamId: text("workstream_id").references(() => workstreams.id),
  gateType: text("gate_type").notNull(),
  stage: integer("stage").notNull(),
  decision: text("decision").notNull(),
  approver: text("approver").notNull(),
  rationale: text("rationale"),
  syncHash: text("sync_hash"),
  findings: jsonb("findings").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
