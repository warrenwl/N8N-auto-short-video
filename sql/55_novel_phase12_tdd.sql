-- Phase 12 database TDD assertions for daily report snapshots.
-- Transactional: verifies behavior, then rolls back snapshot writes.

BEGIN;

DO $$
DECLARE
  v_report_date DATE := CURRENT_DATE;
  v_first RECORD;
  v_second RECORD;
  v_count INTEGER;
BEGIN
  IF to_regclass('public.novel_daily_report_snapshots') IS NULL THEN
    RAISE EXCEPTION 'missing table: novel_daily_report_snapshots';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'upsert_novel_daily_report_snapshot'
  ) THEN
    RAISE EXCEPTION 'missing function: upsert_novel_daily_report_snapshot';
  END IF;

  SELECT *
  INTO v_first
  FROM upsert_novel_daily_report_snapshot(v_report_date, 'phase12_tdd_first');

  IF v_first.report_date <> v_report_date THEN
    RAISE EXCEPTION 'snapshot report_date mismatch: %', v_first.report_date;
  END IF;

  IF v_first.latest_failed_jobs IS NULL OR jsonb_typeof(v_first.latest_failed_jobs) <> 'array' THEN
    RAISE EXCEPTION 'latest_failed_jobs should be jsonb array';
  END IF;

  IF v_first.slow_ai_runs IS NULL OR jsonb_typeof(v_first.slow_ai_runs) <> 'array' THEN
    RAISE EXCEPTION 'slow_ai_runs should be jsonb array';
  END IF;

  SELECT *
  INTO v_second
  FROM upsert_novel_daily_report_snapshot(v_report_date, 'phase12_tdd_second');

  SELECT COUNT(*)
  INTO v_count
  FROM novel_daily_report_snapshots
  WHERE report_date = v_report_date;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'snapshot upsert should keep one row per date, got %', v_count;
  END IF;

  IF v_second.note <> 'phase12_tdd_second' THEN
    RAISE EXCEPTION 'snapshot note should update on conflict, got %', v_second.note;
  END IF;

  IF v_second.captured_at < v_first.captured_at THEN
    RAISE EXCEPTION 'snapshot captured_at should not move backwards';
  END IF;

  RAISE NOTICE 'Phase 12 snapshot DB assertions passed for date %', v_report_date;
END $$;

SELECT
  'phase12_snapshot_db_tdd_passed' AS result,
  COUNT(*) FILTER (WHERE report_date = CURRENT_DATE) AS snapshot_rows_for_today
FROM novel_daily_report_snapshots;

ROLLBACK;
