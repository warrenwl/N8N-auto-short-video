UPDATE video_topics
SET
  video_path = $1,
  cover_path = $2,
  subtitle_path = $3,
  clips_json = $4::jsonb,
  render_manifest = $5::jsonb,
  voice_path = $6,
  audio_duration = $7,
  audio_engine = $8,
  status = 'NEED_REVIEW',
  audio_finished_at = CURRENT_TIMESTAMP,
  render_finished_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  error = NULL
WHERE id = $9
RETURNING id, status, video_path, voice_path, audio_duration, updated_at;
