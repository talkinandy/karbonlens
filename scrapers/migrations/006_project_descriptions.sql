-- 006_project_descriptions.sql — T30
--
-- Per-project AI-researched narrative: a short public summary and a longer
-- gated analyst briefing with citations. Descriptions are generated
-- out-of-band (Claude research agent with WebSearch + WebFetch, see
-- docs/runbooks/project-descriptions.md when it lands) and upserted here;
-- the runtime app is read-only against this table.
--
-- `input_fingerprint` is a sha256 over the known-fact inputs fed to the
-- research agent (name, developer, province, methodology, hectares,
-- status, current issuance totals). When those inputs change, the
-- fingerprint changes, and the refresh loop regenerates the description.

CREATE TABLE IF NOT EXISTS project_descriptions (
  project_id         uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  summary_md         text NOT NULL,
  detail_md          text NOT NULL,
  citations          jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_fingerprint  text NOT NULL,
  model              text NOT NULL DEFAULT 'claude-agent-websearch',
  confidence         text NOT NULL,
  confidence_reason  text,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_descriptions_confidence_ck CHECK (
    confidence IN ('high', 'medium-high', 'medium', 'low')
  )
);

CREATE INDEX IF NOT EXISTS idx_proj_desc_generated
  ON project_descriptions (generated_at DESC);
