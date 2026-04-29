/**
 * n8n Code node: Build Render Request Remotion
 * Input: one row from PostgreSQL video_topics.
 * Output: JSON body for POST http://video-worker:8000/render
 */

const row = $json;
const id = String(row.id || '').trim();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  throw new Error(`No SCRIPT_READY video topic was claimed. Upstream Postgres row is missing a valid uuid id: ${JSON.stringify(row).slice(0, 1000)}`);
}

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
      duration: Number(row.duration || row.duration_seconds || 8),
      subtitle: row.hook || row.cover_text || row.title || row.topic,
      visual_prompt_cn: row.cover_text || row.title || row.topic,
    },
  ];
}

shots = shots.map((shot, index) => ({
  shot_id: shot.shot_id ?? index + 1,
  duration: Number(shot.duration || 5),
  subtitle: String(shot.subtitle || ''),
  headline: String(shot.headline || ''),
  body: String(shot.body || shot.subtitle || ''),
  keywords: Array.isArray(shot.keywords) ? shot.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 4) : [],
  layout_hint: String(shot.layout_hint || ''),
  visual_prompt_cn: String(shot.visual_prompt_cn || shot.prompt || shot.subtitle || ''),
  visual_prompt_en: String(shot.visual_prompt_en || ''),
}));

const title = String(row.title || row.topic || 'AI 短视频');
const coverText = String(row.cover_text || row.title || row.topic || '');
const templateType = String(row.template_type || row.remotion_template_type || 'knowledge');

return [
  {
    json: {
      task_id: id,
      title,
      script: String(row.script || row.hook || row.topic || ''),
      cover_text: coverText,
      platform: String(row.platform || 'default'),
      cover_prompt: `竖屏短视频封面背景，主题：${title}，封面文案参考：${coverText}，画面主体明确，留出上方标题空间，不要生成文字，不要logo，不要水印，商业短视频封面质感`,
      shots,
      width: 1080,
      height: 1920,
      fps: 30,

      enable_tts: true,
      tts_base_url: 'http://host.docker.internal:8010',

      enable_comfyui: true,
      comfyui_mode: 'cover_only',
      comfyui_options: {
        base_url: 'http://host.docker.internal:8000',
        workflow_template_path: '/app/comfyui/zimage_text2image_api_template.json',
        prompt_node_id: '63',
        save_node_id: '9',
        sampler_node_id: '57:3',
        latent_node_id: '57:13',
        filename_prefix: 'n8n-video',
        image_width: 720,
        image_height: 1280,
        timeout_seconds: 900,
        poll_interval_seconds: 2,
        fallback_to_placeholder: true,
        overlay_cover_text: true,
        prompt_prefix: '竖屏短视频封面主视觉，真实摄影，电影感光影，构图干净，手机竖屏，高清细节',
        negative_prompt: '多个人，过度锐化，塑料质感，畸形手指，多余的手，畸形肢体，文字乱码，logo，水印，低清晰度，模糊',
      },

      render_engine: 'remotion',
      template_type: templateType,
      remotion_renderer_url: 'http://host.docker.internal:3001',
    },
  },
];
