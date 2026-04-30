-- V4.1: apply DB repair for artifacts that already exist on disk.
-- Query parameters are provided by n8n Code - Inspect Existing Artifacts.

WITH input AS (
  SELECT
    $1::uuid AS task_id,
    $2::text AS old_status,
    $3::text AS repair_kind,
    $4::text AS next_status,
    NULLIF($5::text, '') AS review_status,
    NULLIF($6::text, '') AS trigger_url,
    $7::text AS message,
    NULLIF($8::text, '') AS cover_path,
    NULLIF($9::text, '') AS video_path,
    NULLIF($10::text, '') AS subtitle_path,
    COALESCE(NULLIF($11::text, '')::jsonb, '[]'::jsonb) AS clips_json,
    COALESCE(NULLIF($12::text, '')::jsonb, '{}'::jsonb) AS render_manifest,
    NULLIF($13::text, '') AS voice_path,
    NULLIF($14::text, '')::double precision AS audio_duration,
    NULLIF($15::text, '') AS audio_engine,
    COALESCE(NULLIF($16::text, '')::jsonb, '[]'::jsonb) AS shot_images_json,
    NULLIF($17::text, '') AS media_engine,
    COALESCE(NULLIF($18::text, '')::jsonb, '{}'::jsonb) AS media_manifest,
    COALESCE(NULLIF($19::text, '')::jsonb, '{}'::jsonb) AS comfyui_prompt_ids
), updated AS (
  UPDATE video_topics vt
  SET
    status = input.next_status,
    review_status = input.review_status,
    review_note = input.message,
    review_action_source = 'auto_artifact_repair_v4_1',
    cover_path = COALESCE(input.cover_path, vt.cover_path),
    video_path = CASE WHEN input.next_status = 'NEED_REVIEW' THEN input.video_path ELSE vt.video_path END,
    subtitle_path = CASE WHEN input.next_status = 'NEED_REVIEW' THEN input.subtitle_path ELSE vt.subtitle_path END,
    clips_json = CASE WHEN input.next_status = 'NEED_REVIEW' THEN input.clips_json ELSE vt.clips_json END,
    render_manifest = CASE WHEN input.next_status = 'NEED_REVIEW' THEN input.render_manifest ELSE vt.render_manifest END,
    voice_path = COALESCE(input.voice_path, vt.voice_path),
    audio_duration = COALESCE(input.audio_duration, vt.audio_duration),
    audio_engine = COALESCE(input.audio_engine, vt.audio_engine),
    shot_images_json = CASE WHEN input.next_status = 'NEED_REVIEW' THEN input.shot_images_json ELSE vt.shot_images_json END,
    media_engine = COALESCE(input.media_engine, vt.media_engine),
    media_manifest = CASE WHEN input.media_manifest <> '{}'::jsonb THEN input.media_manifest ELSE vt.media_manifest END,
    comfyui_prompt_ids = CASE WHEN input.comfyui_prompt_ids <> '{}'::jsonb THEN input.comfyui_prompt_ids ELSE vt.comfyui_prompt_ids END,
    media_finished_at = CASE
      WHEN input.repair_kind IN ('cover_completed', 'video_completed') THEN COALESCE(vt.media_finished_at, now())
      ELSE vt.media_finished_at
    END,
    render_finished_at = CASE
      WHEN input.repair_kind = 'video_completed' THEN COALESCE(vt.render_finished_at, now())
      ELSE NULL
    END,
    error = NULL,
    last_auto_recovery_at = now(),
    updated_at = now()
  FROM input
  WHERE vt.id = input.task_id
    AND vt.status = input.old_status
    AND vt.auto_recovery_disabled = false
  RETURNING
    vt.id,
    vt.topic,
    vt.title,
    input.old_status,
    vt.status AS new_status,
    input.repair_kind,
    input.trigger_url,
    input.message,
    vt.review_token
), event_insert AS (
  INSERT INTO video_task_events (
    video_topic_id,
    event_type,
    stage,
    old_status,
    new_status,
    actor,
    source,
    message,
    metadata
  )
  SELECT
    id,
    'AUTO_ARTIFACT_REPAIR',
    CASE WHEN repair_kind = 'cover_completed' THEN 'cover' ELSE 'video' END,
    old_status,
    new_status,
    'n8n',
    '10_auto_recovery_workflow',
    message,
    jsonb_build_object('repair_kind', repair_kind, 'trigger_url', trigger_url)
  FROM updated
  RETURNING 1
)
SELECT
  'AUTO_ARTIFACT_REPAIR'::text AS event_type,
  id,
  topic,
  title,
  old_status,
  new_status,
  repair_kind,
  trigger_url,
  message,
  review_token
FROM updated;
