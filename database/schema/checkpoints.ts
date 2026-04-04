// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/checkpoints.ts
// description: Drizzle schema for the checkpoints table.
// owner:       BOTH
// update:      Manual when checkpoint persistence structure changes.
// schema:      database/migrations/001_initial.sql
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

import { workstreams } from "./workstreams";

export const checkpoints = pgTable("checkpoints", {
  id: text("id").primaryKey(),
  workstreamId: text("workstream_id").notNull().references(() => workstreams.id),
  stage: integer("stage").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  agentRole: text("agent_role").notNull(),
  acceptanceCriteria: jsonb("acceptance_criteria").notNull().default([]),
  agentSession: text("agent_session"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
