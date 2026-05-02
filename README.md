# N8N Video Agent

基于 n8n + Docker 的自动化短视频生成流水线，从选题到成片全自动完成。

## 架构概览

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  n8n     │───>│ video-worker │───>│ VoxCPM TTS   │    │  PostgreSQL  │
│ :5678    │    │ :8000        │    │ :8010 (宿主机)│    │  :5432       │
└──────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     │                  │                                       │
     │                  └── ffmpeg 合成 → final.mp4             │
     └── GLM API 脚本生成 ──────────────────────────────────────┘
```

## 服务组件

| 服务 | 端口 | 说明 |
|------|------|------|
| **n8n** | 5678 | 工作流引擎，编排整个生成流程 |
| **video-worker** | 8000 | 视频渲染服务（FastAPI），负责图片生成、ffmpeg 合成 |
| **VoxCPM TTS** | 8010 | 语音合成服务（宿主机运行），基于 VoxCPM2 模型 |
| **PostgreSQL 17** | 5432 | n8n 数据库 + `video_agent` 业务数据库 |

## 数据库

### 连接信息

- 主机：`localhost:5432`（宿主机访问）/ `postgres:5432`（容器内访问）
- 用户：`n8n`
- n8n 数据库：`n8n`
- 业务数据库：`video_agent`

### 状态流转

```
IDEA → GENERATING_SCRIPT → SCRIPT_READY → MEDIA_READY → RENDERED → NEED_REVIEW → APPROVED → PUBLISHED
                                                                    ↘ FAILED
```

### 核心表：`video_topics`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，自动生成 |
| topic | TEXT | 选题内容 |
| platform | TEXT | 发布平台，默认 `youtube` |
| style | TEXT | 视频风格，默认 `口播科普` |
| duration_seconds | INTEGER | 目标时长（秒），默认 45 |
| language | TEXT | 语言，默认 `zh-CN` |
| target_audience | TEXT | 目标受众 |
| status | TEXT | 当前状态（见上方流转图） |
| title | TEXT | 生成的标题 |
| hook | TEXT | 开头钩子文案 |
| script | TEXT | 生成的完整脚本 |
| cover_text | TEXT | 封面文字 |
| hashtags | JSONB | 标签列表，默认 `[]` |
| shots_json | JSONB | 分镜数据，默认 `[]` |
| risk_check | JSONB | 风险检查结果，默认 `{}` |
| video_path | TEXT | 最终视频路径 |
| cover_path | TEXT | 封面图路径 |
| publish_url | TEXT | 发布后 URL |
| error | TEXT | 错误信息 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间（自动更新） |

## n8n 工作流

当前主线推荐使用的工作流统一放在：

```text
n8n/workflow/available/
```

当前已跑通主线为 `00 -> 01 -> 06 -> 08 -> 09`，并有 `10` 自动巡检兜底：

- `00_topic_center_workflow.json`：选题中心，支持人工录入和 GLM 自动生成候选选题，确认入池为 `video_topics(IDEA)`。
- `01_postgres_script_workflow.json`：生成脚本包，`IDEA -> SCRIPT_READY`；保留手动触发，同时提供 `/webhook/video-script-start` 给选题中心单条“一键生成视频”按钮调用。
- `06_split_render_workflow.json`：分段渲染，`SCRIPT_READY -> NEED_REVIEW`；保留手动触发，同时提供 `/webhook/video-render-start` 承接 01 完成后的自动首渲染，也承接审核中心的已拒绝重渲染和仅重新合成视频。
- `08_review_list_workflow.json`：人工审核中心，处理通过、拒绝、退回和重新渲染；卡片会展示最近任务事件，便于排查卡住原因。
- `09_douyin_semiauto_publish_workflow.json`：已通过视频的抖音半自动发布，生成发布包并推送 Server酱微信提醒。
- `10_auto_recovery_workflow.json`：生成中任务自动巡检，每 5 分钟扫描超时任务并按阶段自动恢复。

`00` 的计划文档见 `docs/00_topic_idea_pipeline_plan.md`，目标是补齐 `video_topics(IDEA)` 的来源：人工录入 / 批量导入 / GLM 生成 / 候选池筛选 / 确认入池。当前已完成人工录入、GLM 生成候选和确认入池闭环；`/webhook/topic-center` 中 `AI生成` 标签页会调用 `/webhook/topic-generate`，生成结果只写入 `topic_candidates(NEW, source=glm)`，不会自动入池或自动生成视频。`手动录入` 标签页来源固定为 `manual`。`已入池` 标签页中 `IDEA` 状态视频会显示“生成视频”按钮，点击后调用 01 的 `/webhook/video-script-start`，01 写回 `SCRIPT_READY` 后自动调用 06 的 `/webhook/video-render-start`，最终进入 `NEED_REVIEW`。

后续新增的 `/webhook/topic-center` 需要和现有 `/webhook/video-review-list` 互相预留跳转入口：选题中心可直接进入视频审核中心，视频审核中心也可直接回到选题中心。

`02/02b/03/04/05` 是阶段演进留下的历史链路，保留用于回溯，不建议日常使用。

| 文件 | 说明 |
|------|------|
| `available/00_topic_center_workflow.json` | 选题中心：AI生成/人工录入 → 候选池 → 确认入池 → `video_topics(IDEA)` |
| `available/01_postgres_script_workflow.json` | 选题 → GLM 生成脚本 → 写入数据库；支持 `/webhook/video-script-start` 单条触发 |
| `available/06_split_render_workflow.json` | 分段渲染：语音 → 封面 → Remotion 合成；支持 `/webhook/video-render-start` 单条首渲染，已拒绝视频可跳过封面重渲染，也可仅重新合成视频 |
| `available/08_review_list_workflow.json` | 人工审核中心：浏览器查看待审/已通过/已拒绝视频，并直接处理审核动作 |
| `available/09_douyin_semiauto_publish_workflow.json` | 抖音半自动发布：发布包 → 微信提醒 → 手动确认回写 |
| `available/10_auto_recovery_workflow.json` | 自动巡检与恢复：扫描超时生成中任务，按阶段自动恢复，超过上限后标记失败并提醒 |
| `00_topic_center_workflow.json` | 当前可用工作流的根目录副本 |
| `01_postgres_script_workflow.json` | 当前可用工作流的根目录副本 |
| `02_postgres_render_workflow.json` | 单镜头渲染 |
| `02b_postgres_render_multishot_workflow.json` | 多镜头渲染 |
| `03_voxcpm_tts_render_workflow.json` | TTS 语音合成 + 渲染合成 |
| `04_comfyui_tts_render_workflow.json` | ComfyUI 封面/分镜图 + VoxCPM + FFmpeg |
| `05_remotion_dynamic_render_workflow.json` | ComfyUI 封面 + VoxCPM + Remotion 动态版式 |
| `06_split_render_workflow.json` | 当前可用工作流的根目录副本 |
| `08_review_list_workflow.json` | 当前可用工作流的根目录副本 |
| `09_douyin_semiauto_publish_workflow.json` | 当前可用工作流的根目录副本 |
| `10_auto_recovery_workflow.json` | 当前可用工作流的根目录副本 |

工作流通过 GLM API（OpenAI 兼容接口）生成脚本，`GLM_API_KEY` 和 `GLM_MODEL` 从 `.env` 读取。

### GLM 候选选题配置

00 工作流的 M5 自动生成候选配置在：

```text
config/topic_idea_config.jsonc
```

修改这个文件后，重新打开 `/webhook/topic-center?status=AI_GENERATE` 或重新触发 `/webhook/topic-generate` 即可生效。该配置控制 `AI生成` 标签页的默认下拉数据和 GLM 选题提示词。`分类` 是一级内容领域，`选题方向` 是该分类下的二级栏目/生成范围，GLM 会再生成具体候选选题：

```jsonc
{
  "defaults": {
    "count": 1,
    "direction": "认知偏差",
    "category": "认知成长",
    "audience": "30岁左右有焦虑感的普通上班族",
    "tone": "理性克制",
    "content_structure": "反常识观点",
    "style": "理性克制"
  },
  "category_direction_groups": [
    {"category": "认知成长", "directions": ["认知偏差", "判断力训练"]},
    {"category": "AI自动化", "directions": ["办公提效", "内容生产"]}
  ],
  "audience_groups": [
    {"group": "职场阶段", "items": ["刚毕业1-3年的职场新人"]}
  ],
  "audience_recommendations": [
    {
      "category": "认知成长",
      "default": ["30岁左右有焦虑感的普通上班族"],
      "directions": {
        "认知偏差": ["普通家庭出身、想靠长期积累改变处境的人"]
      }
    }
  ],
  "tones": ["理性克制", "温和陪伴"],
  "content_structures": ["反常识观点", "实操清单"]
}
```

数量默认 1 条，页面提供 1/2/5/10 下拉，并保留自定义输入 1-20。目标受众采用“推荐优先 + 全部可选 + 自定义”的交互：`audience_recommendations` 会根据当前分类和选题方向优先展示推荐受众，`audience_groups` 仍作为全量受众池保留在下拉中。

`AI生成` 的风格已拆成 `tone` 和 `content_structure`：`tone` 控制表达语气，`content_structure` 控制切入结构。GLM 候选输出会额外要求 `core_angle/pain_point/promise/opening_hook/risk_note/score_reason`，这些字段保存在候选 `raw_payload.raw_candidate` 中，并在候选卡片展示。重复判断也会同时参考 `topic/title/core_angle`，比单纯标题精确匹配更稳一点。

`AI生成` 采用异步任务：点击后先写入 `topic_generation_jobs(RUNNING)` 并立即返回，页面右侧“生成任务”区域会展示 5 秒刷新倒计时并轮询 `/webhook/topic-generation-jobs`。刷新页面不会丢失进度；GLM 完成后 job 会变为 `SUCCEEDED`，并写入 `topic_candidates.status = NEW`、`source = glm`、`source_ref = glm:<batch_id>`。GLM prompt、响应、生成参数会写入候选 `raw_payload`。`template_type` 不在候选阶段填写，仍由 01 脚本生成阶段根据正文内容输出并写回 `video_topics.template_type`。

GLM-5.1 会消耗较多 reasoning tokens，M5 候选生成默认 `max_tokens = 8000`；如果后台分支失败导致任务长期停在 `RUNNING`，任务列表轮询会把超过 5 分钟的 job 自动标记为 `FAILED` 并展示失败原因。

### GLM 脚本提示词配置

01 工作流的固定提示词已提取到：

```text
config/glm_script_prompt_config.jsonc
```

修改这个文件后，重新运行 01 工作流即可生效，不需要改 workflow JSON。配置支持注释，常用字段如下：

```jsonc
{
  // GLM 模型和采样参数
  "model": "glm-5.1",
  "temperature": 0.7,
  "max_tokens": 8000,

  // 模型角色和全局约束
  "system_prompt": "你是一个专业短视频编导...",

  // 主提示词模板，{{...}} 会被当前数据库记录替换
  "user_prompt_template": "选题：{{topic}}\n平台：{{platform}}\n目标时长：{{duration_seconds}} 秒"
}
```

可用占位符：`{{topic}}`、`{{platform}}`、`{{style}}`、`{{duration_seconds}}`、`{{language}}`、`{{target_audience}}`。

## Remotion 动态模板

`05_ComfyUI封面_Remotion动态版式_VoxCPM_TTS` 使用 Remotion 动态版式生成正片。模板由数据库字段 `video_topics.template_type` 指定，01 工作流会让 GLM 从以下 4 个值里选择：

| template_type | 选择依据 | 当前视觉效果 |
|---|---|---|
| `knowledge` | 概念解释、方法论、科普知识、观点展开；没有明显步骤/对比或故事线时默认使用 | 轻量概念卡：细网格知识背景、左侧细高亮条、主观点大标题、少量关键词 chip，适合稳定知识口播 |
| `list` | 三步法、清单、避坑、操作流程、编号建议 | 短视频步骤卡：步骤轨道背景、窄 STEP 编号栏、右侧纵向清单，弱化 PPT 感并强化逐条推进 |
| `contrast` | 误区 vs 正解、前后对比、反常识观点、纠偏类内容 | 对比观点版：左右冷暖分区背景、双栏“误区 / 正解”为视觉主角，减少正文重复 |
| `story` | 个人经历、案例、转折叙事、时间推进 | 时间线叙事版：时间线轨道背景、短节点列表，适合场景、冲突、转折、结论型叙述 |

### 如何指定模板

默认由 01 工作流的 GLM 输出决定：

```json
{
  "template_type": "list"
}
```

也可以在跑 05 前手动指定：

```sql
UPDATE video_topics
SET template_type = 'contrast'
WHERE id = '你的任务ID';
```

worker 会校验 `template_type` 是否存在于视觉配置；非法值会回退到 `knowledge`。

### 视觉配置文件

模板视觉参数集中在：

```text
config/remotion_visual_config.jsonc
```

这是带注释的 JSONC 文件。关键字段含义：

| 字段 | 作用 |
|---|---|
| `selection_rule` | 给人和 GLM 看的模板选择依据，说明什么内容适合这个模板 |
| `required_fields` | 这个模板依赖的 shot 字段，如 `headline/body/keywords/subtitle` |
| `layout` | 主画面结构：`concept` 概念卡、`steps` 步骤卡、`contrast` 对比双栏、`timeline` 时间线 |
| `keyword_style` | 关键词展示：`chips` 标签块、`numbered` 编号块、`split` A/B 对比块、`timeline` 单列时间线 |
| `visual_behavior` | 对当前模板画面表现的中文说明，便于后续继续拆独立组件 |
| `motion` | 背景推近、漂移、关键词入场节奏 |
| `caption` | 字幕字号、换行宽度、透明度、关键词高亮延迟 |
| `card` | 中间卡片透明度、边框、阴影、圆角、数字水印 |
| `outro` | 结尾 recap 页文案和时长 |
| `brand` | 账号角标显示策略，账号名和头像来自 `config/Account/mes.json` |
| `platform_profiles` | 不同平台的字幕大小、位置和安全区预设，如 `douyin/xiaohongshu/default` |

配置改完后，重启 `video-worker` 和 `remotion_renderer`，再重新跑 05 才会对新视频生效。

### 视频观感优化项

当前 Remotion 版本已经按 1-8 顺序加入以下观感优化：

1. 节奏感：`motion.transition_frames` 给每个 shot 增加入场/出场缓冲，`motion.emphasis_scale` 给重点画面轻微放大，减少硬切和 PPT 感。
2. 字幕层级：`caption.max_chars_per_line/max_lines/bottom_px/emphasis_scale` 控制两行字幕、底部位置和轻微强调；关键词会做局部高亮。
3. 模板视觉差异：`knowledge/list/contrast/story` 分别对应概念卡、步骤卡、对比双栏、时间线叙事。
4. 背景动态：`motion.background_zoom/pan_px` 控制封面背景推近和漂移，正片继承封面主色。
5. 信息密度：`card.max_body_chars/compact_body_chars` 会把过长正文压成画面摘要，完整口播仍由字幕和语音承载，避免正文卡片挤爆。
6. 封面与正片统一：`auto_from_cover=true` 时会从 ComfyUI 封面提取主色，传给 Remotion 的标题、关键词、进度条和片尾。
7. 片头片尾/账号资产：顶部账号小角标读取 `config/Account/mes.json` 并默认居中展示，片尾先展示 1-2 秒总结观点，再切到独立干净关注页展示头像下方点击 `+` 的关注动效。
8. 音画联动/平台适配：`audio_reactive` 使用字幕边界驱动画面节奏；`platform_profiles` 支持平台差异化字幕大小、底部距离和左右安全区。当前 `douyin` 会把字幕上移到 `caption_bottom_px=320`，并用 `caption_right_px=174` 避让右侧点赞/评论/转发区。

账号配置文件：

```json
{
  "account_name": "雾夜看雪",
  "account_logo": "account.jpg",
  "follow_voice_text": "关注我，每天进步一点。"
}
```

头像文件放在同目录，例如：

```text
config/Account/account.jpg
```

worker 渲染时会把头像复制到当前任务的 `output/<task_id>/account_logo.*`，再由 Remotion renderer 通过 `/asset` 读取，避免容器路径和本机路径不一致。

`follow_voice_text` 是片尾关注页的统一账号话术，支持 `{account_name}` 和 `{title}` 占位符。`config/remotion_visual_config.jsonc` 里的 `outro.voice_enabled` 控制是否追加这段片尾语音。

## 视频渲染流程

1. n8n 调用 video-worker `POST /render`
2. video-worker 调用 VoxCPM TTS 生成语音（可选）
3. 为每个分镜生成占位图
4. ffmpeg 将图片转为视频片段
5. 合并片段 → 烧录字幕 → 混流音频 → 输出 `final.mp4`
6. 写入 `manifest.json`，返回路径给 n8n

### 06 分段渲染流程

`06_分段渲染_ComfyUI封面_Remotion动态版式_VoxCPM_TTS` 把 05 的大 worker 调用拆成 3 个可观察、可单独重试的 worker 阶段：

画布分为两条路径：

- 上半区“正常首渲染路径”：在 n8n 里点“执行工作流”会领取最早一条 `SCRIPT_READY` 记录；由 01 自动调用 `/webhook/video-render-start?task_id=...&token=...` 时只领取指定 `SCRIPT_READY` 记录。两种入口都会完整执行语音/字幕、ComfyUI 封面、Remotion 合成。
- 下半区“已拒绝重渲染路径”：由审核中心“重新渲染视频”按钮自动调用 `/webhook/video-rerender-split`，领取 `MEDIA_READY + RERENDER_REQUESTED` 记录，只重新生成语音/字幕并 Remotion 合成，跳过 ComfyUI/封面生成。
- 第三条“仅重新合成视频路径”：由审核中心“仅重新合成视频”按钮自动调用 `/webhook/video-rerender-video-only`，领取 `AUDIO_READY + VIDEO_RERENDER_REQUESTED` 记录，复用已有语音/字幕/封面，只重新执行 Remotion 合成。

1. `数据库 - 领取SCRIPT_READY首渲染`：领取一条 `SCRIPT_READY`，状态改为 `GENERATING_AUDIO`。
2. `HTTP请求 - 生成语音`：调用 `POST /render/audio`，生成 `voice_main.wav`、`voice_outro.wav`、`voice.wav`、`audio_manifest.json`，并完成字幕时长分配。
3. `数据库 - 更新为AUDIO_READY`：回写 `voice_path/audio_duration/audio_engine/render_manifest`，状态改为 `AUDIO_READY`。
4. `数据库 - 标记生成封面中`：封面生成开始，状态改为 `GENERATING_COVER`。
5. `HTTP请求 - 生成封面`：调用 `POST /render/cover`，生成 ComfyUI 封面 `cover_base.png/cover.png`；如果关闭 ComfyUI 或失败且允许 fallback，则生成与 Remotion 底色和模板色适配的主题封面，不展示 ComfyUI 提示词。
6. `数据库 - 更新为COVER_READY`：回写 `cover_path/media_manifest/comfyui_prompt_ids`，状态改为 `COVER_READY`。
7. `数据库 - 标记合成视频中`：视频合成开始，状态改为 `RENDERING_VIDEO`。
8. `HTTP请求 - 合成Remotion视频`：调用 `POST /render/remotion`，读取前两步的 `audio_manifest.json` 和 `media_manifest.json`，生成 `subtitles.srt`、`subtitles.json`、`remotion_manifest.json`、`final.mp4`、`manifest.json`。
9. `数据库 - 更新为NEED_REVIEW首渲染`：回写最终视频、字幕、manifest 等字段，状态改为 `NEED_REVIEW`。

保留的兼容入口：

- `POST /render`：05 工作流继续可用，一次性执行完整渲染。
- `POST /render/audio`：只生成语音和字幕时间轴。
- `POST /render/cover`：只生成封面。
- `POST /render/remotion`：只做 Remotion 合成。

### 08 人工审核中心

`08_人工审核中心` 同时提供审核列表页和审核动作 Webhook。日常只需要打开列表页，页面按钮会自动调用同一个工作流里的动作接口。

审核动作必须同时带 `task_id` 和 `review_token`，避免只靠任务 ID 修改状态。

初始化/升级审核字段：

```bash
docker exec -i n8n-video-postgres psql -U n8n -d video_agent < sql/20_add_review_columns.sql
docker exec -i n8n-video-postgres psql -U n8n -d video_agent < sql/21_generate_review_tokens.sql
docker exec -i n8n-video-postgres psql -U n8n -d video_agent < sql/37_create_video_task_events.sql
docker exec -i n8n-video-postgres psql -U n8n -d video_agent < sql/38_add_auto_recovery_fields.sql
```

页面入口：

```text
http://localhost:5678/webhook/video-review-list
```

可选标签页参数：

```text
http://localhost:5678/webhook/video-review-list?status=NEED_REVIEW
http://localhost:5678/webhook/video-review-list?status=GENERATING
http://localhost:5678/webhook/video-review-list?status=APPROVED
http://localhost:5678/webhook/video-review-list?status=REJECTED
http://localhost:5678/webhook/video-review-list?status=ALL
```

动作接口仍然是：

```text
http://localhost:5678/webhook/video-review-action?action=<action>&task_id=<任务ID>&token=<review_token>
```

支持动作：

| action | 状态流转 | 页面入口 |
|---|---|---|
| `approve` | `NEED_REVIEW` → `APPROVED` | 待审核卡片“通过”按钮 |
| `reject` | `NEED_REVIEW` → `REJECTED` | 待审核卡片“拒绝”按钮 |
| `back_review` | `APPROVED/REJECTED` → `NEED_REVIEW` | 已通过/已拒绝卡片“退回待审核”按钮 |
| `rerender` | `REJECTED` → `MEDIA_READY` | 已拒绝卡片“重新渲染视频”按钮，自动触发 06 的重渲染入口；重新生成语音/字幕并合成视频，不重新生成封面 |
| `rerender_cover` | `REJECTED` → `AUDIO_READY` | 已拒绝卡片“重新生成封面”按钮，自动触发 06 的封面重生成入口；复用已有语音，重新生成封面后自动合成视频 |
| `rerender_video_only` | `REJECTED` → `AUDIO_READY` | 已拒绝卡片“仅重新合成视频”按钮，自动触发 06 的仅重合成入口；复用已有语音/字幕/封面，只重新生成 `final.mp4` |
| `reset_script` | `GENERATING_SCRIPT` → `IDEA` | 生成中卡片超时后“重新生成脚本”按钮，自动触发 01 |
| `trigger_render` | `SCRIPT_READY` → `SCRIPT_READY` | 生成中卡片等待超时后“重新触发渲染”按钮，自动触发 06 |
| `reset_audio` | `GENERATING_AUDIO` → `SCRIPT_READY` | 正常首渲染语音阶段超时后“重新生成语音”按钮，自动触发 06 正常首渲染入口 |
| `rerender_audio_retry` | `GENERATING_AUDIO + RERENDER_REQUESTED` → `MEDIA_READY` | 已拒绝“重新渲染视频”的语音阶段失败或超时后，自动恢复到重渲染入口并重新触发 `/webhook/video-rerender-split` |
| `trigger_cover` | `AUDIO_READY` → `AUDIO_READY` | 生成中卡片等待超时后“继续生成封面”按钮，自动触发 06 封面恢复入口 |
| `reset_cover` | `GENERATING_COVER` → `AUDIO_READY` | 生成中卡片超时后“重新生成封面”按钮，复用语音并自动触发 06 封面恢复入口 |
| `reset_render` | `COVER_READY/RENDERING_VIDEO` → `AUDIO_READY` | 生成中卡片超时后“重新合成视频”按钮，复用语音/封面并自动触发 06 仅重合成入口 |
| `mark_failed` | 生成中状态 → `FAILED` | 生成中卡片超时后“标记失败”按钮 |

页面展示规则：

- 顶部展示 `待审核/生成中/已通过/已拒绝/已发布/今日审核` 统计。
- `生成中` 标签页会按阶段展示进度；当 `GENERATING_SCRIPT` 超过 5 分钟、正常首渲染 `GENERATING_AUDIO` 超过 15 分钟、重渲染 `GENERATING_AUDIO + RERENDER_REQUESTED` 超过 5 分钟、`GENERATING_COVER/RENDERING_VIDEO` 超过 20 分钟时，卡片会显示“需要补救”区域。
- 当前补救支持：脚本、等待渲染、语音、封面、视频合成阶段都能按阶段恢复；任一超时生成中任务可“标记失败”，避免任务长期挂在中间状态。
- 封面/视频合成恢复会显式携带数据库中的 `voice_path/audio_duration/audio_engine`。即使 output 目录里的旧 `audio_manifest.json` 被清理，worker 也会优先用已有语音重建音频 manifest，避免误重新生成语音。
- 每个视频卡片会展示“最近事件”折叠区，数据来自 `video_task_events`。01/06/08/10 会记录脚本、语音、封面、视频合成、人工审核、人工补救、自动恢复和失败标记等事件。
- `10_自动巡检与恢复_生成中任务` 每 5 分钟扫描超时生成中任务，并按同一套补救策略自动触发 01/06；每条任务最多自动恢复 2 次，仍超时会标记 `FAILED`、禁用后续自动恢复并通过 Server酱提醒。已拒绝“重新渲染视频”的语音生成失败会由 06 立即写入 `error/review_note` 和 `STAGE_FAILED` 事件，10 看到该错误 1 分钟后即可恢复重试。
- `10` 也会先做产物探测修复：如果 `GENERATING_COVER` 已经落盘 `cover.png/media_manifest.json` 但数据库没回写，会补齐封面字段并触发“仅重新合成视频”；如果 `RENDERING_VIDEO` 已经落盘 `final.mp4/manifest.json` 但数据库没回写，会补齐成片字段并直接进入 `NEED_REVIEW`。
- 自动恢复次数会显示在审核中心卡片中；详细动作会进入“最近事件”。
- 修改 n8n Code 节点后先运行 `./scripts/check_n8n_code_node_sandbox.js`，避免把 `path` 等 n8n task runner 禁用模块写入 workflow。
- 标签页支持查看 `NEED_REVIEW`、`GENERATING`、`APPROVED`、`REJECTED`、`PUBLISHED` 和 `ALL`。
- `GENERATING` 会聚合展示生成/重渲染进度状态：`GENERATING_SCRIPT`、`SCRIPT_READY`、`MEDIA_READY`、`GENERATING_AUDIO`、`AUDIO_READY`、`GENERATING_COVER`、`COVER_READY`、`RENDERING_VIDEO`、`FAILED`、`RENDER_FAILED`。选题中心点击“生成视频”后会先进入 `GENERATING_SCRIPT`；点击“重新渲染视频”后，记录会先进入这里，并由 06 的 `/webhook/video-rerender-split` 自动领取；点击“重新生成封面”后，会由 `/webhook/video-rerender-cover` 自动领取，复用语音重出封面并合成视频；点击“仅重新合成视频”后，会由 `/webhook/video-rerender-video-only` 自动领取，只跑 Remotion 合成，直到处理完成后回到 `NEED_REVIEW`。
- `GENERATING` 标签页会展示 5 秒刷新倒计时，并在卡片里展示阶段进度条、百分比、更新时间、已用时间；失败状态会展示 `error` 里的错误信息。
- 完成时间使用 `render_finished_at → media_finished_at → created_at → updated_at` 的优先级，并按 `Asia/Shanghai` 格式化成本地可读时间，例如 `2026-04-29 11:00:12`，不会直接展示带 `T/Z` 的 ISO 时间。
- 拒绝原因默认用下拉选择：`脚本不行`、`画面不行`、`声音不行`、`字幕不行`、`整体重做`；旁边的补充说明可选，提交后会和下拉原因合并写入 `review_note`。
- 视频预览读取 `video_path` 指向的本地文件，路径通常是 `/data/output/<task_id>/final.mp4`，对应宿主机目录 `data/output/<task_id>/final.mp4`。
- 如果数据库记录还在，但本地 `final.mp4` 已被清理或移动，页面会显示“视频文件不可预览 / 本地文件可能已被清理”。这种记录需要重新渲染或恢复文件后才能预览。
- Remotion renderer 的 `/asset` 静态资源接口支持 `HEAD` 和 `Range` 请求，浏览器 `<video>` 可以正常读取 metadata、拖动和播放已存在的视频文件。
- `待审核`标签里的通过/拒绝会进入审核动作完成页，页面按最终状态上色并提供“返回对应列表 / 查看待审核 / 查看已通过 / 查看已拒绝”按钮；其他标签里的退回/重渲染/仅重新合成视频/发布相关动作会在当前列表页内执行，成功后刷新当前页，不再展示二级结果页。
- `APPROVED` 视频未进入发布链路时，显示“退回待审核 / 直接发布到抖音”；进入发布链路后，隐藏这两个按钮，显示“撤回发布 / 再次发送提醒”；确认已手动发布后，视频状态变为 `PUBLISHED`，进入“已发布”标签页且不再显示操作按钮。

导入/更新审核中心工作流：

```bash
docker cp n8n/workflow/08_review_list_workflow.json n8n-video-n8n:/tmp/08_review_list_workflow.json
docker exec n8n-video-n8n n8n import:workflow --input=/tmp/08_review_list_workflow.json --projectId=NGUCqFuUfTK6tdLq
docker exec n8n-video-n8n n8n update:workflow --id=videoAgentReviewListMvp08 --active=true
docker compose restart n8n
```

导入/更新自动巡检工作流：

```bash
docker cp n8n/workflow/10_auto_recovery_workflow.json n8n-video-n8n:/tmp/10_auto_recovery_workflow.json
docker exec n8n-video-n8n n8n import:workflow --input=/tmp/10_auto_recovery_workflow.json --projectId=NGUCqFuUfTK6tdLq
docker exec n8n-video-n8n n8n update:workflow --id=videoAgentAutoRecoveryMvp10 --active=true
docker compose restart n8n
```

### 09 抖音半自动发布

`09_抖音半自动发布` 为审核中心 `已通过` 标签页的“直接发布到抖音”按钮提供后端链路。它不会自动登录或代发抖音，而是生成手机可下载的发布包，并通过 Server酱推送微信提醒。

发布链路：

1. 审核中心点击“直接发布到抖音”，调用 `/webhook/douyin-publish-start?task_id=<任务ID>&token=<review_token>`。
2. 09 校验视频仍是 `APPROVED`，创建或复用 `video_publish_jobs` 中的 douyin 发布任务。
3. `publish-helper` 把 `final.mp4`、封面、文案和 metadata 复制到 `/data/publish/douyin/<job_id>/`，宿主机可通过 `http://localhost/publish/douyin/<job_id>/final.mp4` 访问。
4. 09 通过 Server酱发送微信提醒，提醒里包含下载链接、文案、`我已发布` 和 `暂不发布` 链接。
5. 点击 `我已发布` 后，发布任务变为 `MANUAL_PUBLISHED`，主题视频变为 `PUBLISHED`；点击 `暂不发布` 后，发布任务变为 `MANUAL_SKIPPED`，主题视频保持 `APPROVED`。

发布任务状态：

- `PACKAGING`：正在生成发布包。
- `PACKAGE_READY`：发布包已生成。
- `REMINDING`：正在发送提醒。
- `REMIND_SENT`：提醒已发送，审核中心会显示“撤回发布 / 再次发送提醒”。
- `MANUAL_PUBLISHED`：你已确认手动发布，主题视频变为 `PUBLISHED`。
- `MANUAL_SKIPPED`：你暂不发布或在审核中心撤回发布，主题视频保持 `APPROVED`。

初始化/升级发布表：

```bash
docker exec -i n8n-video-postgres psql -U n8n -d video_agent < sql/25_create_video_publish_jobs.sql
```

发布服务端口：

- 容器内：`http://publish-helper:8010`
- 宿主机标准入口：`http://localhost`
- 宿主机兼容入口：`http://localhost:8011`
- 微信提醒默认使用标准 `80` 端口，不再显示 `:8011`；`8011` 仅保留给电脑本地调试。

环境变量：

```text
SERVERCHAN_SENDKEY=你的 Server酱 SendKey
PUBLIC_N8N_BASE_URL=http://你的Mac本地域名.local
PUBLIC_FILE_BASE_URL=http://你的Mac本地域名.local/publish
```

如果手机要从微信里直接下载视频，`PUBLIC_*` 不要配置成 `localhost`。优先使用 Mac 的 Bonjour/mDNS 本地域名，例如 `http://warrndeMacBook-Air.local/publish`；这样换 WiFi 后通常不需要跟着改 IP。可用 `scutil --get LocalHostName` 查看本地域名前缀。若手机所在网络不支持 `.local` 解析，再临时改成当前 WiFi IP。发布确认链接也走标准 `80` 端口，由 publish-helper 代理到 n8n，避免微信提示非标准端口。

微信提醒会优先发送 `http://你的Mac本地域名.local/download/douyin/<job_id>` 下载页，而不是只发裸 `final.mp4`。下载页包含视频预览、强制附件下载入口、封面下载和文案下载；如果微信内只能播放不能保存，点右上角“在浏览器打开”后再点“下载视频文件”。

导入/更新 09 工作流：

```bash
docker cp n8n/workflow/09_douyin_semiauto_publish_workflow.json n8n-video-n8n:/tmp/09_douyin_semiauto_publish_workflow.json
docker exec n8n-video-n8n n8n import:workflow --input=/tmp/09_douyin_semiauto_publish_workflow.json --projectId=NGUCqFuUfTK6tdLq
docker exec n8n-video-n8n n8n update:workflow --id=videoAgentDouyinPublishMvp09 --active=true
docker compose restart n8n
```

## TTS 语音配置

`config/tts_voice_config.json` 控制语音风格和合成参数：

- `voice_prompt`：语音风格描述
- `cfg_value`：控制强度（默认 2.0）
- `inference_timesteps`：推理步数（默认 10）
- `max_chars`：单次 TTS 切块最大字符数，默认建议 80；过大会让整段旁白像一口气念完
- `chunk_by_paragraph`：是否按分镜段落拆成多次 TTS；为保证同一条视频音色稳定，当前建议设为 `false`
- `sentence_pause_seconds`：同一分镜内句子之间插入的静音停顿
- `paragraph_pause_seconds`：不同分镜/段落之间插入的静音停顿，通常应大于句间停顿
- `use_reference_audio`：是否启用参考音频；打开后主旁白和片尾会使用同一个参考音频约束音色

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入实际的 GLM_API_KEY 等配置
```

### 2. 启动服务

```bash
docker compose up -d
```

### 3. 启动 TTS 服务（宿主机）

```bash
bash scripts/run_voxcpm_tts_server.sh
```

### 4. 导入工作流

在 n8n 界面（http://localhost:5678）中导入 `n8n/workflow/` 下的工作流 JSON 文件，配置 PostgreSQL 凭据后即可运行。

## 停止服务

```bash
docker compose down
```

## 项目结构

```
├── config/topic_idea_config.jsonc # GLM 候选选题生成配置
├── config/tts_voice_config.json   # TTS 语音配置
├── docker-compose.yml             # Docker 编排
├── data/output/                   # 生成的视频输出
├── n8n/code/                      # n8n Code 节点源码备份
├── n8n/workflow/                  # n8n 工作流 JSON
├── postgres/init/                 # 数据库初始化 SQL
├── scripts/                       # 启动/测试脚本
├── sql/                           # 增量数据库脚本
├── tts/                           # VoxCPM TTS 服务
├── worker/                        # 视频渲染 worker
└── .env.example                   # 环境变量模板
```

## 安全提示

- `.env` 已被 `.gitignore` 忽略，API Key 和密码不会被提交
- 在 n8n 中使用 Credentials 管理敏感凭据
- 如 Key 意外泄露，请立即轮换并更新 `.env`
