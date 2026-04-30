-- V4 automatic stalled-task recovery.
-- n8n Postgres node: Execute Query
-- Finds stale generation tasks, performs a conservative recovery state change,
-- writes video_task_events, and returns webhook trigger URLs for recovered rows.

WITH thresholds AS (
  SELECT * FROM (VALUES
    ('GENERATING_SCRIPT'::text, 5 * 60, 'script'::text, 'IDEA'::text, 'RECOVERY_REQUESTED'::text, 'video-script-start'::text, '自动恢复：脚本生成超时，退回 IDEA 并重新请求 GLM'::text),
    ('SCRIPT_READY'::text, 5 * 60, 'render'::text, 'SCRIPT_READY'::text, 'RECOVERY_REQUESTED'::text, 'video-render-start'::text, '自动恢复：等待渲染超时，重新触发 06'::text),
    ('GENERATING_AUDIO'::text, 15 * 60, 'audio'::text, 'SCRIPT_READY'::text, 'RECOVERY_REQUESTED'::text, 'video-render-start'::text, '自动恢复：语音生成超时，退回脚本完成状态并重新生成语音'::text),
    ('AUDIO_READY'::text, 10 * 60, 'cover'::text, 'AUDIO_READY'::text, 'COVER_RECOVERY_REQUESTED'::text, 'video-rerender-cover'::text, '自动恢复：语音完成后等待超时，继续生成封面'::text),
    ('GENERATING_COVER'::text, 20 * 60, 'cover'::text, 'AUDIO_READY'::text, 'COVER_RECOVERY_REQUESTED'::text, 'video-rerender-cover'::text, '自动恢复：封面生成超时，复用语音重新生成封面'::text),
    ('COVER_READY'::text, 10 * 60, 'video'::text, 'AUDIO_READY'::text, 'VIDEO_RERENDER_REQUESTED'::text, 'video-rerender-video-only'::text, '自动恢复：封面完成后等待超时，复用素材重新合成视频'::text),
    ('RENDERING_VIDEO'::text, 20 * 60, 'video'::text, 'AUDIO_READY'::text, 'VIDEO_RERENDER_REQUESTED'::text, 'video-rerender-video-only'::text, '自动恢复：视频合成超时，复用素材重新合成视频'::text)
  ) AS t(status, threshold_seconds, stage, next_status, review_status, webhook_path, message)
), candidates AS (
  SELECT
    vt.*,
    th.stage,
    th.next_status,
    th.review_status AS next_review_status,
    th.webhook_path,
    th.message,
    th.threshold_seconds,
    EXTRACT(EPOCH FROM (
      now() - COALESCE(
        CASE
          WHEN vt.status = 'GENERATING_AUDIO' THEN vt.audio_started_at::timestamptz
          WHEN vt.status = 'GENERATING_COVER' THEN vt.media_started_at::timestamptz
          WHEN vt.status = 'RENDERING_VIDEO' THEN vt.render_started_at::timestamptz
          ELSE NULL
        END,
        vt.updated_at::timestamptz,
        vt.created_at::timestamptz
      )
    ))::integer AS stale_seconds
  FROM video_topics vt
  JOIN thresholds th ON th.status = vt.status
  WHERE vt.auto_recovery_disabled = false
    AND vt.review_token IS NOT NULL
), stale AS (
  SELECT *
  FROM candidates
  WHERE stale_seconds >= threshold_seconds
  ORDER BY updated_at ASC
  LIMIT 5
  FOR UPDATE SKIP LOCKED
), to_recover AS (
  SELECT * FROM stale WHERE auto_recovery_attempts < 2
), recovered AS (
  UPDATE video_topics vt
  SET
    status = tr.next_status,
    review_status = tr.next_review_status,
    review_note = tr.message,
    review_action_source = 'auto_recovery_v4',
    auto_recovery_attempts = vt.auto_recovery_attempts + 1,
    last_auto_recovery_at = now(),
    title = CASE WHEN tr.next_status = 'IDEA' THEN NULL ELSE vt.title END,
    hook = CASE WHEN tr.next_status = 'IDEA' THEN NULL ELSE vt.hook END,
    script = CASE WHEN tr.next_status = 'IDEA' THEN NULL ELSE vt.script END,
    cover_text = CASE WHEN tr.next_status = 'IDEA' THEN NULL ELSE vt.cover_text END,
    hashtags = CASE WHEN tr.next_status = 'IDEA' THEN '[]'::jsonb ELSE vt.hashtags END,
    shots_json = CASE WHEN tr.next_status = 'IDEA' THEN '[]'::jsonb ELSE vt.shots_json END,
    risk_check = CASE WHEN tr.next_status = 'IDEA' THEN '{}'::jsonb ELSE vt.risk_check END,
    template_type = CASE WHEN tr.next_status = 'IDEA' THEN 'knowledge' ELSE vt.template_type END,
    audio_started_at = CASE WHEN tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.audio_started_at END,
    audio_finished_at = CASE WHEN tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.audio_finished_at END,
    voice_path = CASE WHEN tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.voice_path END,
    audio_duration = CASE WHEN tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.audio_duration END,
    audio_engine = CASE WHEN tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.audio_engine END,
    media_started_at = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.media_started_at END,
    media_finished_at = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.media_finished_at END,
    cover_path = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.cover_path END,
    shot_images_json = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.shot_images_json END,
    media_engine = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.media_engine END,
    media_manifest = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.media_manifest END,
    comfyui_prompt_ids = CASE WHEN tr.next_review_status = 'COVER_RECOVERY_REQUESTED' OR tr.next_status IN ('SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.comfyui_prompt_ids END,
    render_started_at = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.render_started_at END,
    render_finished_at = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.render_finished_at END,
    video_path = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.video_path END,
    subtitle_path = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.subtitle_path END,
    clips_json = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.clips_json END,
    render_manifest = CASE WHEN tr.next_status IN ('AUDIO_READY', 'SCRIPT_READY', 'IDEA') THEN NULL ELSE vt.render_manifest END,
    error = NULL,
    updated_at = now()
  FROM to_recover tr
  WHERE vt.id = tr.id
  RETURNING
    vt.id,
    vt.topic,
    vt.title,
    vt.status,
    vt.review_token,
    vt.auto_recovery_attempts,
    tr.status AS old_status,
    tr.stage,
    tr.webhook_path,
    tr.message,
    tr.stale_seconds
), failed AS (
  UPDATE video_topics vt
  SET
    status = 'FAILED',
    review_status = 'AUTO_RECOVERY_FAILED',
    review_note = '自动恢复超过 2 次仍超时，已标记失败，请人工检查',
    review_action_source = 'auto_recovery_v4',
    error = '自动恢复超过 2 次仍超时，已标记失败，请人工检查',
    auto_recovery_disabled = true,
    last_auto_recovery_at = now(),
    updated_at = now()
  FROM stale st
  WHERE vt.id = st.id
    AND st.auto_recovery_attempts >= 2
  RETURNING
    vt.id,
    vt.topic,
    vt.title,
    vt.status,
    vt.review_token,
    vt.auto_recovery_attempts,
    st.status AS old_status,
    st.stage,
    NULL::text AS webhook_path,
    '自动恢复超过 2 次仍超时，已标记失败，请人工检查'::text AS message,
    st.stale_seconds
), event_rows AS (
  SELECT 'AUTO_RECOVERY'::text AS event_type, * FROM recovered
  UNION ALL
  SELECT 'AUTO_RECOVERY_FAILED'::text AS event_type, * FROM failed
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
    event_type,
    stage,
    old_status,
    status,
    'n8n',
    '10_auto_recovery_workflow',
    message,
    jsonb_build_object(
      'attempts', auto_recovery_attempts,
      'stale_seconds', stale_seconds,
      'webhook_path', webhook_path
    )
  FROM event_rows
  RETURNING 1
)
SELECT
  er.event_type,
  er.id,
  er.topic,
  er.title,
  er.old_status,
  er.status AS new_status,
  er.stage,
  er.review_token,
  er.auto_recovery_attempts,
  er.stale_seconds,
  er.message,
  er.webhook_path,
  CASE
    WHEN er.webhook_path IS NULL THEN NULL
    ELSE 'http://localhost:5678/webhook/' || er.webhook_path || '?task_id=' || er.id::text || '&token=' || er.review_token
  END AS trigger_url
FROM event_rows er
ORDER BY er.event_type, er.stage, er.id;
