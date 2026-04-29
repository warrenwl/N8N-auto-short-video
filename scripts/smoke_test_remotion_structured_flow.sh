#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/warrn/study/N8N"
TASK_ID="${1:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
TOPIC="${2:-为什么很多人努力学习却没有明显进步？给普通人的三个复盘方法}"

cd "$ROOT_DIR"

require_service() {
  local name="$1"
  local url="$2"
  curl -fsS "$url" >/dev/null || {
    echo "Service not ready: $name ($url)" >&2
    exit 1
  }
}

require_service "video-worker" "http://localhost:8000/health"
require_service "remotion-renderer" "http://127.0.0.1:3001/health"
require_service "VoxCPM TTS" "http://127.0.0.1:8010/health"
require_service "ComfyUI" "http://127.0.0.1:8000/system_stats"

node - "$TASK_ID" "$TOPIC" >/tmp/n8n_structured_seed.sql <<'NODE'
const taskId = process.argv[2];
const topic = process.argv[3];

const data = {
  title: '努力学习没进步？先复盘这三件事',
  hook: '你以为学习没效果，是因为不够努力；但很多时候，是复盘方法错了。',
  script: '你以为学习没效果，是因为不够努力；但很多时候，是复盘方法错了。第一，别只记录学了什么，要写下哪里卡住。第二，把卡点拆成一个能立刻验证的小问题。第三，第二天用三分钟回看昨天的卡点有没有被解决。坚持一周，你会更清楚自己到底是在积累，还是只是在重复消耗。',
  cover_text: '复盘比努力更重要',
  template_type: 'list',
  hashtags: ['学习方法', '复盘', '职场成长', '效率提升'],
  shots: [
    {
      shot_id: 1,
      duration: 6,
      headline: '不是不够努力',
      body: '你以为学习没效果，是因为不够努力；但很多时候，是复盘方法错了。',
      keywords: ['学习没效果', '复盘方法', '努力误区'],
      layout_hint: '先给反差',
      visual_prompt_cn: '职场人夜晚学习，桌面笔记和电脑，真实摄影，情绪克制',
      visual_prompt_en: 'office worker studying at night, notes and laptop on desk, realistic photography',
      subtitle: '你以为学习没效果，是因为不够努力；但很多时候，是复盘方法错了。'
    },
    {
      shot_id: 2,
      duration: 7,
      headline: '记录真正卡点',
      body: '第一，别只记录学了什么，要写下哪里卡住。',
      keywords: ['卡点', '记录', '问题意识'],
      layout_hint: '步骤一',
      visual_prompt_cn: '笔记本上标记问题清单，近景，干净光线',
      visual_prompt_en: 'notebook with marked problem list, close-up, clean lighting',
      subtitle: '第一，别只记录学了什么，要写下哪里卡住。'
    },
    {
      shot_id: 3,
      duration: 7,
      headline: '拆成小问题',
      body: '第二，把卡点拆成一个能立刻验证的小问题。',
      keywords: ['拆解', '小问题', '立刻验证'],
      layout_hint: '步骤二',
      visual_prompt_cn: '白板上的问题拆解流程，简洁办公空间',
      visual_prompt_en: 'problem breakdown flow on whiteboard, clean office space',
      subtitle: '第二，把卡点拆成一个能立刻验证的小问题。'
    },
    {
      shot_id: 4,
      duration: 7,
      headline: '第二天回看',
      body: '第三，第二天用三分钟回看昨天的卡点有没有被解决。',
      keywords: ['三分钟', '回看', '解决卡点'],
      layout_hint: '步骤三',
      visual_prompt_cn: '早晨办公桌，日历和复盘清单，真实摄影',
      visual_prompt_en: 'morning desk with calendar and review checklist, realistic photography',
      subtitle: '第三，第二天用三分钟回看昨天的卡点有没有被解决。'
    },
    {
      shot_id: 5,
      duration: 8,
      headline: '积累不是重复',
      body: '坚持一周，你会更清楚自己到底是在积累，还是只是在重复消耗。',
      keywords: ['坚持一周', '真实积累', '避免消耗'],
      layout_hint: '结论收束',
      visual_prompt_cn: '职场人整理复盘笔记，窗边自然光，积极但克制',
      visual_prompt_en: 'professional organizing review notes by window, natural light, calm positive mood',
      subtitle: '坚持一周，你会更清楚自己到底是在积累，还是只是在重复消耗。'
    }
  ],
  risk_check: {
    copyright_risk: '低',
    sensitive_risk: '低',
    factual_risk: '低',
    notes: '通用学习方法建议，建议人工确认文案语气不过度承诺。'
  }
};

function lit(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

console.log(`
INSERT INTO video_topics (
  id, topic, platform, style, duration_seconds, language, target_audience,
  title, hook, script, cover_text, template_type, hashtags, shots_json, risk_check, status
) VALUES (
  ${lit(taskId)}::uuid,
  ${lit(topic)},
  'douyin',
  '口播科普',
  35,
  'zh-CN',
  '想提升学习效率的普通职场人',
  ${lit(data.title)},
  ${lit(data.hook)},
  ${lit(data.script)},
  ${lit(data.cover_text)},
  ${lit(data.template_type)},
  ${lit(JSON.stringify(data.hashtags))}::jsonb,
  ${lit(JSON.stringify(data.shots))}::jsonb,
  ${lit(JSON.stringify(data.risk_check))}::jsonb,
  'SCRIPT_READY'
)
ON CONFLICT (id) DO UPDATE SET
  topic = EXCLUDED.topic,
  title = EXCLUDED.title,
  hook = EXCLUDED.hook,
  script = EXCLUDED.script,
  cover_text = EXCLUDED.cover_text,
  template_type = EXCLUDED.template_type,
  hashtags = EXCLUDED.hashtags,
  shots_json = EXCLUDED.shots_json,
  risk_check = EXCLUDED.risk_check,
  status = 'SCRIPT_READY',
  error = NULL;
`);
NODE

docker exec -i n8n-video-postgres psql -U n8n -d video_agent </tmp/n8n_structured_seed.sql >/dev/null

docker exec n8n-video-postgres psql -U n8n -d video_agent -tAc "
UPDATE video_topics
SET
  status = 'RENDERING',
  media_started_at = CURRENT_TIMESTAMP,
  render_started_at = CURRENT_TIMESTAMP,
  audio_started_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  error = NULL
WHERE id = '$TASK_ID'::uuid
RETURNING row_to_json(video_topics);
" | sed '/^UPDATE /d' >/tmp/n8n_structured_row.json

node - "$TASK_ID" >/tmp/n8n_structured_render_request.json <<'NODE'
const fs = require('fs');
const taskId = process.argv[2];
const row = JSON.parse(fs.readFileSync('/tmp/n8n_structured_row.json', 'utf8'));

const shots = row.shots_json.map((shot, index) => ({
  shot_id: shot.shot_id ?? index + 1,
  duration: Number(shot.duration || 5),
  subtitle: String(shot.subtitle || ''),
  headline: String(shot.headline || ''),
  body: String(shot.body || shot.subtitle || ''),
  keywords: Array.isArray(shot.keywords) ? shot.keywords.map(String).filter(Boolean).slice(0, 4) : [],
  layout_hint: String(shot.layout_hint || ''),
  visual_prompt_cn: String(shot.visual_prompt_cn || shot.prompt || shot.subtitle || ''),
  visual_prompt_en: String(shot.visual_prompt_en || ''),
}));

const title = String(row.title || row.topic || 'AI 短视频');
const coverText = String(row.cover_text || row.title || row.topic || '');

console.log(JSON.stringify({
  task_id: taskId,
  title,
  script: String(row.script || row.hook || row.topic || ''),
  cover_text: coverText,
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
    negative_prompt: '多个人，过度锐化，塑料质感，畸形手指，多余的手，畸形肢体，文字乱码，logo，水印，低清晰度，模糊'
  },
  render_engine: 'remotion',
  template_type: row.template_type || 'knowledge',
  remotion_renderer_url: 'http://host.docker.internal:3001',
}, null, 2));
NODE

curl -fsS -X POST http://localhost:8000/render \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/n8n_structured_render_request.json \
  >/tmp/n8n_structured_render_response.json

node >/tmp/n8n_structured_update.sql <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/n8n_structured_render_response.json', 'utf8'));

function lit(value) {
  return value === null || value === undefined ? 'NULL' : "'" + String(value).replace(/'/g, "''") + "'";
}

function json(value) {
  return lit(JSON.stringify(value ?? {})) + '::jsonb';
}

console.log(`
UPDATE video_topics SET
  video_path = ${lit(data.video_path)},
  cover_path = ${lit(data.cover_path || null)},
  subtitle_path = ${lit(data.subtitle_path || null)},
  clips_json = ${json(data.clips || [])},
  render_manifest = ${json(data)},
  voice_path = ${lit(data.voice_path || null)},
  audio_duration = ${Number(data.audio_duration || 0)},
  audio_engine = ${lit(data.audio_engine || 'VoxCPM')},
  shot_images_json = ${json(data.images || [])},
  media_engine = ${lit(data.media_engine || 'ComfyUI')},
  media_manifest = ${json(data.media_manifest || {})},
  comfyui_prompt_ids = ${json(data.comfyui_prompt_ids || {})},
  status = 'NEED_REVIEW',
  media_finished_at = CURRENT_TIMESTAMP,
  audio_finished_at = CURRENT_TIMESTAMP,
  render_finished_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  error = NULL
WHERE id = ${lit(data.task_id)}::uuid;
`);
NODE

docker exec -i n8n-video-postgres psql -U n8n -d video_agent </tmp/n8n_structured_update.sql >/dev/null

OUT_DIR="$ROOT_DIR/data/output/$TASK_ID"
ffprobe -v error -show_entries stream=codec_type,codec_name -show_entries format=duration -of json "$OUT_DIR/final.mp4" >/tmp/n8n_structured_ffprobe.json
mkdir -p "$OUT_DIR/preview_frames"
ffmpeg -y -ss 00:00:10 -i "$OUT_DIR/final.mp4" -frames:v 1 "$OUT_DIR/preview_frames/smoke_10s.png" >/tmp/n8n_structured_ffmpeg.log 2>&1

jq -n \
  --arg task_id "$TASK_ID" \
  --arg output_dir "$OUT_DIR" \
  --slurpfile render /tmp/n8n_structured_render_response.json \
  --slurpfile probe /tmp/n8n_structured_ffprobe.json \
  '{task_id: $task_id, output_dir: $output_dir, render: $render[0], ffprobe: $probe[0]}'
