// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        database/schema/workstreams.ts
// description: Drizzle schema for the workstreams table.
// owner:       BOTH
// update:      Manual when workstream persistence structure changes.
// schema:      database/migrations/001_initial.sql
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

import { convoys } from "./convoys";

export const workstreams = pgTable("workstreams", {
  id: text("id").primaryKey(),
  convoyId: text("convoy_id").notNull().references(() => convoys.id),
  repoSlug: text("repo_slug").notNull(),
  stage: integer("stage").notNull().default(0),
  status: text("status").notNull().default("pending"),
  dependsOn: text("depends_on").array(),
  branch: text("branch"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
