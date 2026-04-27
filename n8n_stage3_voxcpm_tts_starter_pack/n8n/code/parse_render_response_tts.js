/**
 * n8n Code node: Parse Render Response TTS
 * Input: JSON returned by video-worker v0.3.0.
 * Output: fields used by PostgreSQL update query.
 */

const data = $json;

if (!data || data.status !== 'ok') {
  throw new Error(`Render failed or invalid response: ${JSON.stringify(data).slice(0, 1000)}`);
}

return [
  {
    json: {
      task_id: data.task_id,
      video_path: data.video_path,
      cover_path: data.cover_path || null,
      subtitle_path: data.subtitle_path || null,
      clips_json: JSON.stringify(data.clips || []),
      render_manifest: JSON.stringify(data),
      voice_path: data.voice_path || null,
      audio_duration: Number(data.audio_duration || 0),
      audio_engine: data.audio_engine || 'VoxCPM',
    },
  },
];
