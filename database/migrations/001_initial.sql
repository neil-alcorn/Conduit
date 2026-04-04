-- CONDUIT Initial Schema Migration
-- Run once on first deployment of CONDUIT app
CREATE TABLE IF NOT EXISTS convoys (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  work_type       TEXT NOT NULL CHECK (work_type IN ('net-new','enhancement','maintenance','bug-fix')),
  stage           INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 8),
  status          TEXT NOT NULL DEFAULT 'active',
  ado_work_item   TEXT,
  audience_scores JSONB NOT NULL,
  bp_gate_required BOOLEAN NOT NULL DEFAULT false,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workstreams (
  id           TEXT PRIMARY KEY,
  convoy_id    TEXT NOT NULL REFERENCES convoys(id),
  repo_slug    TEXT NOT NULL,
  stage        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  depends_on   TEXT[],
  branch       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id                  TEXT PRIMARY KEY,
  workstream_id       TEXT NOT NULL REFERENCES workstreams(id),
  stage               INTEGER NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  agent_role          TEXT NOT NULL,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  agent_session       TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gate_events (
  id            TEXT PRIMARY KEY,
  convoy_id     TEXT NOT NULL REFERENCES convoys(id),
  workstream_id TEXT REFERENCES workstreams(id),
  gate_type     TEXT NOT NULL,
  stage         INTEGER NOT NULL,
  decision      TEXT NOT NULL CHECK (decision IN ('approved','rework','blocked')),
  approver      TEXT NOT NULL,
  rationale     TEXT,
  sync_hash     TEXT,
  findings      JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY gate_events_insert_only ON gate_events FOR INSERT WITH CHECK (true);
CREATE POLICY gate_events_read ON gate_events FOR SELECT USING (true);
