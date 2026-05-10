-- Novel workflow V1 query snippets for n8n Postgres nodes.
-- These are intended to be copied into individual Postgres nodes as needed.

-- 1) Create a project and enqueue Bible generation.
-- $1 title
-- $2 genre
-- $3 audience
-- $4 style
-- $5 premise
-- $6 target_total_chapters
-- $7 target_words_per_chapter
WITH project AS (
  INSERT INTO novel_projects (
    title,
    genre,
    audience,
    style,
    premise,
    target_total_chapters,
    target_words_per_chapter,
    status
  )
  VALUES (
    trim($1),
    trim($2),
    NULLIF(trim($3), ''),
    NULLIF(trim($4), ''),
    NULLIF(trim($5), ''),
    COALESCE(NULLIF($6::text, '')::integer, 20),
    COALESCE(NULLIF($7::text, '')::integer, 2000),
    'CREATED'
  )
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  SELECT id, 'GENERATE_BIBLE', 'PENDING'
  FROM project
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  project.*,
  job.id AS job_id
FROM project
LEFT JOIN job ON true;

-- 2) Claim one pending job by type.
-- $1 job_type
WITH claimed AS (
  SELECT id
  FROM novel_generation_jobs
  WHERE job_type = $1
    AND status = 'PENDING'
    AND attempt_count < max_attempts
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE novel_generation_jobs j
SET
  status = 'RUNNING',
  started_at = NOW(),
  attempt_count = attempt_count + 1,
  updated_at = NOW()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;

-- 3) Mark a job succeeded.
-- $1 job_id
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;

-- 4) Mark a job failed or retryable.
-- $1 job_id
-- $2 error_message
UPDATE novel_generation_jobs
SET
  status = CASE
    WHEN attempt_count >= max_attempts THEN 'FAILED'
    ELSE 'PENDING'
  END,
  error_message = $2,
  finished_at = CASE
    WHEN attempt_count >= max_attempts THEN NOW()
    ELSE finished_at
  END,
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;

-- 5) Record one AI run.
-- $1 project_id
-- $2 chapter_id
-- $3 job_id
-- $4 run_type
-- $5 model
-- $6 prompt_version
-- $7 request_payload_json
-- $8 response_payload_json
-- $9 parsed_payload_json
-- $10 success
-- $11 error_message
-- $12 started_at
-- $13 finished_at
WITH input AS (
  SELECT
    NULLIF($12, '')::timestamptz AS started_at,
    NULLIF($13, '')::timestamptz AS finished_at
)
INSERT INTO novel_ai_runs (
  project_id,
  chapter_id,
  job_id,
  run_type,
  model,
  prompt_version,
  request_payload,
  response_payload,
  parsed_payload,
  success,
  error_message,
  started_at,
  finished_at,
  duration_ms
)
SELECT
  NULLIF($1, '')::uuid,
  NULLIF($2, '')::uuid,
  NULLIF($3, '')::uuid,
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  COALESCE(NULLIF($7, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($8, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($9, '')::jsonb, '{}'::jsonb),
    COALESCE(NULLIF($10::text, '')::boolean, TRUE),
  NULLIF($11, ''),
  input.started_at,
  input.finished_at,
  CASE
    WHEN input.started_at IS NOT NULL AND input.finished_at IS NOT NULL
      THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (input.finished_at - input.started_at)) * 1000)::integer)
    ELSE NULL
  END
FROM input
RETURNING *;

-- 6) Read project data for Bible generation.
-- $1 project_id
SELECT *
FROM novel_projects
WHERE id = $1::uuid;

-- 7) Upsert generated Bible and enqueue outline generation.
-- $1 project_id
-- $2 world_setting
-- $3 story_core
-- $4 main_character_json
-- $5 supporting_characters_json
-- $6 villain_setting_json
-- $7 power_system
-- $8 relationship_map_json
-- $9 organizations_json
-- $10 locations_json
-- $11 plot_constraints_json
-- $12 expansion_notes
-- $13 tone_rules
-- $14 forbidden_rules
-- $15 selling_points_json
-- $16 generation_model
-- $17 raw_payload_json
WITH bible AS (
  INSERT INTO novel_bibles (
    project_id,
    world_setting,
    story_core,
    main_character,
    supporting_characters,
    villain_setting,
    power_system,
    relationship_map,
    organizations,
    locations,
    plot_constraints,
    expansion_notes,
    tone_rules,
    forbidden_rules,
    selling_points,
    generation_model,
    raw_payload
  )
  VALUES (
    $1::uuid,
    $2,
    $3,
    COALESCE(NULLIF($4, '')::jsonb, '{}'::jsonb),
    COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($6, '')::jsonb, '[]'::jsonb),
    $7,
    COALESCE(NULLIF($8, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($10, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($11, '')::jsonb, '[]'::jsonb),
    NULLIF($12, ''),
    $13,
    $14,
    COALESCE(NULLIF($15, '')::jsonb, '[]'::jsonb),
    $16,
    COALESCE(NULLIF($17, '')::jsonb, '{}'::jsonb)
  )
  ON CONFLICT (project_id) DO UPDATE
  SET
    world_setting = EXCLUDED.world_setting,
    story_core = EXCLUDED.story_core,
    main_character = EXCLUDED.main_character,
    supporting_characters = EXCLUDED.supporting_characters,
    villain_setting = EXCLUDED.villain_setting,
    power_system = EXCLUDED.power_system,
    relationship_map = EXCLUDED.relationship_map,
    organizations = EXCLUDED.organizations,
    locations = EXCLUDED.locations,
    plot_constraints = EXCLUDED.plot_constraints,
    expansion_notes = EXCLUDED.expansion_notes,
    tone_rules = EXCLUDED.tone_rules,
    forbidden_rules = EXCLUDED.forbidden_rules,
    selling_points = EXCLUDED.selling_points,
    generation_model = EXCLUDED.generation_model,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW()
  RETURNING *
), project AS (
  UPDATE novel_projects
  SET status = 'BIBLE_READY'
  WHERE id = $1::uuid
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  VALUES ($1::uuid, 'GENERATE_OUTLINE', 'PENDING')
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  bible.*,
  (SELECT id FROM job LIMIT 1) AS outline_job_id
FROM bible;

-- 8) Read project and Bible for outline generation.
-- $1 project_id
SELECT
  p.*,
  b.world_setting,
  b.story_core,
  b.main_character,
  b.supporting_characters,
  b.villain_setting,
  b.power_system,
  b.relationship_map,
  b.organizations,
  b.locations,
  b.plot_constraints,
  b.expansion_notes,
  b.tone_rules,
  b.forbidden_rules,
  b.selling_points
FROM novel_projects p
JOIN novel_bibles b ON b.project_id = p.id
WHERE p.id = $1::uuid;

-- 9) Upsert one chapter outline.
-- $1 project_id
-- $2 chapter_no
-- $3 volume_no
-- $4 title
-- $5 summary
-- $6 chapter_goal
-- $7 conflict_point
-- $8 emotional_point
-- $9 hook
INSERT INTO novel_chapter_outlines (
  project_id,
  chapter_no,
  volume_no,
  title,
  summary,
  chapter_goal,
  conflict_point,
  emotional_point,
  hook,
  status
)
VALUES (
  $1::uuid,
  $2::integer,
  COALESCE(NULLIF($3::text, '')::integer, 1),
  NULLIF($4, ''),
  NULLIF($5, ''),
  NULLIF($6, ''),
  NULLIF($7, ''),
  NULLIF($8, ''),
  NULLIF($9, ''),
  'READY'
)
ON CONFLICT (project_id, chapter_no) DO UPDATE
SET
  volume_no = EXCLUDED.volume_no,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  chapter_goal = EXCLUDED.chapter_goal,
  conflict_point = EXCLUDED.conflict_point,
  emotional_point = EXCLUDED.emotional_point,
  hook = EXCLUDED.hook,
  status = 'READY',
  updated_at = NOW()
RETURNING *;

-- 10) Mark outline ready and enqueue chapter 1 director card.
-- $1 project_id
WITH project AS (
  UPDATE novel_projects
  SET status = 'OUTLINE_READY'
  WHERE id = $1::uuid
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  VALUES ($1::uuid, 'PLAN_CHAPTER_DIRECTOR', 1, 'PENDING')
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  project.*,
  (SELECT id FROM job LIMIT 1) AS first_chapter_job_id
FROM project;

-- 11) Read context for chapter generation or rewrite.
-- $1 project_id
-- $2 chapter_no
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_words_per_chapter,
  b.world_setting,
  b.story_core,
  b.main_character,
  b.supporting_characters,
  b.villain_setting,
  b.power_system,
  b.tone_rules,
  b.forbidden_rules,
  b.selling_points,
  o.id AS outline_id,
  o.chapter_no,
  o.title AS outline_title,
  o.summary AS outline_summary,
  o.chapter_goal,
  o.conflict_point,
  o.emotional_point,
  o.hook,
  prev.title AS previous_chapter_title,
  prev.summary AS previous_chapter_summary
FROM novel_projects p
JOIN novel_bibles b ON b.project_id = p.id
JOIN novel_chapter_outlines o ON o.project_id = p.id
LEFT JOIN LATERAL (
  SELECT title, summary
  FROM novel_chapters
  WHERE project_id = p.id
    AND chapter_no < $2::integer
    AND is_current = TRUE
    AND status IN ('APPROVED', 'PUBLISHED')
  ORDER BY chapter_no DESC
  LIMIT 1
) prev ON true
WHERE p.id = $1::uuid
  AND o.chapter_no = $2::integer
  AND o.status = 'READY';

-- 12) Read active continuity facts for chapter N, excluding same-chapter AI facts.
-- $1 project_id
-- $2 chapter_no
SELECT fact_type, fact_key, fact_value
FROM novel_continuity_facts
WHERE project_id = $1::uuid
  AND status = 'ACTIVE'
  AND (
    chapter_no IS NULL
    OR chapter_no < $2::integer
    OR source = 'human'
  )
ORDER BY created_at DESC
LIMIT 80;

-- 13) Save a generated candidate chapter and enqueue AI review.
-- $1 project_id
-- $2 outline_id
-- $3 parent_chapter_id
-- $4 chapter_no
-- $5 title
-- $6 body
-- $7 summary
-- $8 word_count
-- $9 ai_model
WITH chapter AS (
  SELECT *
  FROM create_novel_chapter_version(
    $1::uuid,
    NULLIF($2, '')::uuid,
    NULLIF($3, '')::uuid,
    $4::integer,
    $5,
    $6,
    $7,
    COALESCE(NULLIF($8::text, '')::integer, 0),
    $9,
    'DRAFT_READY',
    FALSE
  )
), job AS (
  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  SELECT project_id, id, 'REVIEW_CHAPTER', chapter_no, 'PENDING'
  FROM chapter
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  chapter.*,
  (SELECT id FROM job LIMIT 1) AS review_job_id
FROM chapter;

-- 14) Insert one pending AI continuity fact for a generated candidate chapter.
-- $1 project_id
-- $2 chapter_id
-- $3 chapter_no
-- $4 chapter_generation_version
-- $5 fact_type
-- $6 fact_key
-- $7 fact_value
-- $8 confidence
INSERT INTO novel_continuity_facts (
  project_id,
  chapter_id,
  chapter_no,
  chapter_generation_version,
  fact_type,
  fact_key,
  fact_value,
  source,
  confidence,
  status
)
VALUES (
  $1::uuid,
  $2::uuid,
  $3::integer,
  $4::integer,
  $5,
  NULLIF($6, ''),
  $7,
  'ai',
  COALESCE(NULLIF($8::text, '')::numeric, 0.8),
  'PENDING'
)
RETURNING *;

-- 15) Save one AI review report and move chapter into NEED_REVIEW.
-- $1 project_id
-- $2 chapter_id
-- $3 ai_run_id
-- $4 consistency_score
-- $5 readability_score
-- $6 plot_score
-- $7 commercial_score
-- $8 total_score
-- $9 issues_json
-- $10 suggestions_json
-- $11 verdict
WITH report AS (
  INSERT INTO novel_review_reports (
    project_id,
    chapter_id,
    ai_run_id,
    consistency_score,
    readability_score,
    plot_score,
    commercial_score,
    total_score,
    issues,
    suggestions,
    verdict
  )
  VALUES (
    $1::uuid,
    $2::uuid,
    NULLIF($3, '')::uuid,
    NULLIF($4::text, '')::integer,
    NULLIF($5::text, '')::integer,
    NULLIF($6::text, '')::integer,
    NULLIF($7::text, '')::integer,
    NULLIF($8::text, '')::integer,
    COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($10, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($11, ''), 'MANUAL_REVIEW')
  )
  RETURNING *
), reviewed AS (
  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = $2::uuid
    AND status IN ('DRAFT_READY', 'AI_REVIEWED')
  RETURNING *
), project AS (
  UPDATE novel_projects
  SET status = 'REVIEWING'
  WHERE id = $1::uuid
  RETURNING *
), notify_job AS (
  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  SELECT project_id, id, 'NOTIFY_REVIEW', chapter_no, 'PENDING'
  FROM reviewed
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  report.*,
  (SELECT id FROM notify_job LIMIT 1) AS notify_job_id
FROM report;

-- 16) Recovery: close stale running jobs.
UPDATE novel_generation_jobs
SET
  status = CASE
    WHEN attempt_count >= max_attempts THEN 'FAILED'
    ELSE 'PENDING'
  END,
  error_message = CASE
    WHEN attempt_count >= max_attempts THEN '任务超时且达到最大重试次数'
    ELSE error_message
  END,
  finished_at = CASE
    WHEN attempt_count >= max_attempts THEN NOW()
    ELSE finished_at
  END,
  updated_at = NOW()
WHERE status = 'RUNNING'
  AND started_at < NOW() - INTERVAL '20 minutes'
RETURNING *;

-- 17) Recovery: mark review chapters failed after max retries.
UPDATE novel_chapters c
SET
  status = 'FAILED',
  error = j.error_message
FROM novel_generation_jobs j
WHERE c.id = j.chapter_id
  AND j.status = 'FAILED'
  AND j.job_type = 'REVIEW_CHAPTER'
  AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW')
RETURNING c.*;

-- 18) Recovery: backfill a missing next-chapter director or chapter job.
INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
SELECT
  p.id,
  'PLAN_CHAPTER_DIRECTOR',
  p.current_chapter_no + 1,
  'PENDING'
FROM novel_projects p
WHERE p.status = 'WRITING'
  AND p.current_chapter_no < p.target_total_chapters
  AND NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs j
    WHERE j.project_id = p.id
      AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
      AND j.chapter_no = p.current_chapter_no + 1
      AND j.status IN ('PENDING', 'RUNNING')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM novel_chapter_director_cards d
    WHERE d.project_id = p.id
      AND d.chapter_no = p.current_chapter_no + 1
      AND d.is_current = TRUE
      AND d.status IN ('READY', 'NEEDS_REVIEW')
  )
ON CONFLICT DO NOTHING
RETURNING *;
