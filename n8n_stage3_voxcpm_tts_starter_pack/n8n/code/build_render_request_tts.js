/**
 * n8n Code node: Build Render Request TTS
 * Input: one row from PostgreSQL video_topics.
 * Output: JSON body for POST http://video-worker:8000/render
 */

const row = $json;

function parseJsonMaybe(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

let shots = parseJsonMaybe(row.shots_json, []);
if (!Array.isArray(shots) || shots.length === 0) {
  shots = [
    {
      shot_id: 1,
      duration: Number(row.duration || 8),
      subtitle: row.hook || row.cover_text || row.title || row.topic,
      visual_prompt_cn: row.cover_text || row.title || row.topic,
    },
  ];
}

shots = shots.map((shot, index) => ({
  shot_id: shot.shot_id ?? index + 1,
  duration: Number(shot.duration || 5),
  subtitle: String(shot.subtitle || ''),
  visual_prompt_cn: String(shot.visual_prompt_cn || shot.prompt || shot.subtitle || ''),
  visual_prompt_en: String(shot.visual_prompt_en || ''),
}));

return [
  {
    json: {
      task_id: String(row.id),
      title: String(row.title || row.topic || 'AI 短视频'),
      script: String(row.script || row.hook || row.topic || ''),
      cover_text: String(row.cover_text || row.title || row.topic || ''),
      shots,
      width: 1080,
      height: 1920,
      fps: 30,
      enable_tts: true,
      // n8n inside Docker calls video-worker inside Docker.
      // video-worker then calls the host Mac's VoxCPM server through host.docker.internal.
      tts_base_url: 'http://host.docker.internal:8010',
    },
  },
];
