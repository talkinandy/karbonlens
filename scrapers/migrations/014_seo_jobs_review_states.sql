-- 014_seo_jobs_review_states.sql — human-review queue for the autopilot (WS2a)
--
-- The autopilot no longer auto-publishes on gate pass. A gate-passed artifact
-- is parked as status='qa_passed' for a human to Approve (→ published) or
-- Reject (→ rejected) on /admin/seo. This adds the two new lifecycle states to
-- the seo_jobs status CHECK constraint.
--
-- Lifecycle now: queued → generating →
--   qa_failed (gate rejected, 422)
--   qa_passed (gate ok, awaiting human review)  ← new
--     → published (human approved, news_posts inserted)
--     → rejected  (human rejected)              ← new
--   skipped / applied / error (as before)
--
-- The original constraint was defined inline in migration 012 (Postgres
-- auto-named it). Drop whatever CHECK references `status`, then re-add with the
-- expanded set, so this is robust to the auto-generated name.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'seo_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE seo_jobs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE seo_jobs
  ADD CONSTRAINT seo_jobs_status_check
  CHECK (status IN (
    'queued', 'generating', 'qa_passed', 'qa_failed',
    'published', 'applied', 'rejected', 'skipped', 'error'
  ));
