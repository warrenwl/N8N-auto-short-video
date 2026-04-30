-- n8n Postgres node: Execute Query
-- Query parameters:
-- $1 = next_status        APPROVED, REJECTED, NEED_REVIEW, MEDIA_READY, AUDIO_READY, SCRIPT_READY, IDEA, or FAILED
-- $2 = review_status      APPROVED, REJECTED, NEED_REVIEW, RERENDER_REQUESTED, VIDEO_RERENDER_REQUESTED, RECOVERY_REQUESTED, COVER_RECOVERY_REQUESTED, or MANUAL_FAILED
-- $3 = review_note        optional, may be empty string
-- $4 = action_source      e.g. review_center
-- $5 = task_id
-- $6 = review_token
-- This query always returns one row, even if the update is blocked.
WITH updated AS (
  UPDATE video_topics
  SET
    status = $1,
    review_status = $2,
    review_note = NULLIF($3, ''),
    review_action_source = $4,
    title = CASE WHEN $1 = 'IDEA' THEN NULL ELSE title END,
    hook = CASE WHEN $1 = 'IDEA' THEN NULL ELSE hook END,
    script = CASE WHEN $1 = 'IDEA' THEN NULL ELSE script END,
    cover_text = CASE WHEN $1 = 'IDEA' THEN NULL ELSE cover_text END,
    hashtags = CASE WHEN $1 = 'IDEA' THEN '[]'::jsonb ELSE hashtags END,
    shots_json = CASE WHEN $1 = 'IDEA' THEN '[]'::jsonb ELSE shots_json END,
    risk_check = CASE WHEN $1 = 'IDEA' THEN '{}'::jsonb ELSE risk_check END,
    template_type = CASE WHEN $1 = 'IDEA' THEN 'knowledge' ELSE template_type END,
    reviewed_at = CASE WHEN $1 IN ('APPROVED', 'REJECTED') THEN now() ELSE reviewed_at END,
    approved_at = CASE WHEN $1 = 'APPROVED' THEN now() WHEN $1 IN ('NEED_REVIEW', 'MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA', 'FAILED') THEN NULL ELSE approved_at END,
    rejected_at = CASE WHEN $1 = 'REJECTED' THEN now() WHEN $1 IN ('NEED_REVIEW', 'MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA', 'FAILED') THEN NULL ELSE rejected_at END,
    render_started_at = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE render_started_at END,
    render_finished_at = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE render_finished_at END,
    media_started_at = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE media_started_at END,
    media_finished_at = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE media_finished_at END,
    audio_started_at = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE audio_started_at END,
    audio_finished_at = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE audio_finished_at END,
    voice_path = CASE WHEN $1 IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE voice_path END,
    audio_duration = CASE WHEN $1 IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE audio_duration END,
    audio_engine = CASE WHEN $1 IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE audio_engine END,
    video_path = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE video_path END,
    subtitle_path = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE subtitle_path END,
    clips_json = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE clips_json END,
    cover_path = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE cover_path END,
    shot_images_json = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE shot_images_json END,
    media_engine = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE media_engine END,
    media_manifest = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE media_manifest END,
    comfyui_prompt_ids = CASE WHEN $1 IN ('MEDIA_READY', 'SCRIPT_READY', 'IDEA') OR $2 = 'COVER_RECOVERY_REQUESTED' THEN NULL ELSE comfyui_prompt_ids END,
    render_manifest = CASE WHEN $1 IN ('MEDIA_READY', 'AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE render_manifest END,
    error = CASE
      WHEN $1 = 'FAILED' THEN COALESCE(NULLIF($3, ''), '人工标记失败')
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = $5
    AND review_token = $6
    AND (
      ($1 IN ('APPROVED', 'REJECTED') AND status = 'NEED_REVIEW')
      OR ($1 = 'NEED_REVIEW' AND status IN ('APPROVED', 'REJECTED'))
      OR ($1 = 'MEDIA_READY' AND status = 'REJECTED')
      OR ($1 = 'AUDIO_READY' AND $2 = 'VIDEO_RERENDER_REQUESTED' AND status IN ('REJECTED', 'COVER_READY', 'RENDERING_VIDEO'))
      OR ($1 = 'AUDIO_READY' AND $2 = 'COVER_RECOVERY_REQUESTED' AND status IN ('AUDIO_READY', 'GENERATING_COVER'))
      OR ($1 = 'SCRIPT_READY' AND status IN ('REJECTED', 'SCRIPT_READY', 'GENERATING_AUDIO'))
      OR ($1 = 'IDEA' AND status = 'GENERATING_SCRIPT')
      OR ($1 = 'FAILED' AND status IN ('GENERATING_SCRIPT', 'SCRIPT_READY', 'MEDIA_READY', 'GENERATING_AUDIO', 'AUDIO_READY', 'GENERATING_COVER', 'COVER_READY', 'RENDERING_VIDEO'))
    )
  RETURNING
    true AS success,
    'UPDATED'::text AS result_code,
    id,
    title,
    status,
    review_status,
    review_note,
    video_path,
    cover_path,
    review_token,
    reviewed_at,
    approved_at,
    rejected_at
), existing AS (
  SELECT
    false AS success,
    CASE
      WHEN id IS NULL THEN 'INVALID_TASK_OR_TOKEN'
      WHEN $1 IN ('APPROVED', 'REJECTED') AND status <> 'NEED_REVIEW' THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'NEED_REVIEW' AND status NOT IN ('APPROVED', 'REJECTED') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'MEDIA_READY' AND status <> 'REJECTED' THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'AUDIO_READY' AND $2 = 'VIDEO_RERENDER_REQUESTED' AND status NOT IN ('REJECTED', 'COVER_READY', 'RENDERING_VIDEO') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'AUDIO_READY' AND $2 = 'COVER_RECOVERY_REQUESTED' AND status NOT IN ('AUDIO_READY', 'GENERATING_COVER') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'SCRIPT_READY' AND status NOT IN ('REJECTED', 'SCRIPT_READY', 'GENERATING_AUDIO') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'IDEA' AND status <> 'GENERATING_SCRIPT' THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'FAILED' AND status NOT IN ('GENERATING_SCRIPT', 'SCRIPT_READY', 'MEDIA_READY', 'GENERATING_AUDIO', 'AUDIO_READY', 'GENERATING_COVER', 'COVER_READY', 'RENDERING_VIDEO') THEN 'INVALID_SOURCE_STATUS'
      ELSE 'NOT_UPDATED'
    END::text AS result_code,
    id,
    title,
    status,
    review_status,
    review_note,
    video_path,
    cover_path,
    review_token,
    reviewed_at,
    approved_at,
    rejected_at
  FROM video_topics
  WHERE id = $5
    AND review_token = $6
)
SELECT * FROM updated
UNION ALL
SELECT * FROM existing WHERE NOT EXISTS (SELECT 1 FROM updated)
UNION ALL
SELECT
  false AS success,
  'INVALID_TASK_OR_TOKEN'::text AS result_code,
  $5 AS id,
  NULL::text AS title,
  NULL::text AS status,
  NULL::text AS review_status,
  NULL::text AS review_note,
  NULL::text AS video_path,
  NULL::text AS cover_path,
  NULL::text AS review_token,
  NULL::timestamp AS reviewed_at,
  NULL::timestamp AS approved_at,
  NULL::timestamp AS rejected_at
WHERE NOT EXISTS (SELECT 1 FROM updated) AND NOT EXISTS (SELECT 1 FROM existing);
