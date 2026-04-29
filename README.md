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

日常只需要使用 `01 -> 06 -> 08`：

- `01_postgres_script_workflow.json`：生成脚本包，`IDEA -> SCRIPT_READY`。
- `06_split_render_workflow.json`：分段渲染，`SCRIPT_READY -> NEED_REVIEW`；同时承接审核中心的已拒绝重渲染和仅重新合成视频。
- `08_review_list_workflow.json`：人工审核中心，处理通过、拒绝、退回和重新渲染。

`02/02b/03/04/05` 是阶段演进留下的历史链路，保留用于回溯，不建议日常使用。

| 文件 | 说明 |
|------|------|
| `available/01_postgres_script_workflow.json` | 选题 → GLM 生成脚本 → 写入数据库 |
| `available/06_split_render_workflow.json` | 分段渲染：语音 → 封面 → Remotion 合成；已拒绝视频可跳过封面重渲染，也可仅重新合成视频 |
| `available/08_review_list_workflow.json` | 人工审核中心：浏览器查看待审/已通过/已拒绝视频，并直接处理审核动作 |
| `01_postgres_script_workflow.json` | 当前可用工作流的根目录副本 |
| `02_postgres_render_workflow.json` | 单镜头渲染 |
| `02b_postgres_render_multishot_workflow.json` | 多镜头渲染 |
| `03_voxcpm_tts_render_workflow.json` | TTS 语音合成 + 渲染合成 |
| `04_comfyui_tts_render_workflow.json` | ComfyUI 封面/分镜图 + VoxCPM + FFmpeg |
| `05_remotion_dynamic_render_workflow.json` | ComfyUI 封面 + VoxCPM + Remotion 动态版式 |
| `06_split_render_workflow.json` | 当前可用工作流的根目录副本 |
| `08_review_list_workflow.json` | 当前可用工作流的根目录副本 |

工作流通过 GLM API（OpenAI 兼容接口）生成脚本，`GLM_API_KEY` 和 `GLM_MODEL` 从 `.env` 读取。

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
| `knowledge` | 概念解释、方法论、科普知识、观点展开；没有明显步骤/对比/故事线时默认使用 | 概念解释卡，关键词 chip，节奏稳定 |
| `list` | 三步法、清单、避坑、操作流程、编号建议 | STEP 标签，编号关键词，逐项推进 |
| `contrast` | 误区 vs 正解、前后对比、反常识观点、纠偏类内容 | VIEW 标签，误区/正解双栏，蓝橙对比色 |
| `story` | 个人经历、案例、转折叙事、时间推进 | STORY 标签，时间线关键词，轻微漂移动效 |

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

- 上半区“正常首渲染路径”：在 n8n 里点 `Execute workflow`，领取 `SCRIPT_READY` 记录，完整执行语音/字幕、ComfyUI 封面、Remotion 合成。
- 下半区“已拒绝重渲染路径”：由审核中心“重新渲染视频”按钮自动调用 `/webhook/video-rerender-split`，领取 `MEDIA_READY + RERENDER_REQUESTED` 记录，只重新生成语音/字幕并 Remotion 合成，跳过 ComfyUI/封面生成。
- 第三条“仅重新合成视频路径”：由审核中心“仅重新合成视频”按钮自动调用 `/webhook/video-rerender-video-only`，领取 `AUDIO_READY + VIDEO_RERENDER_REQUESTED` 记录，复用已有语音/字幕/封面，只重新执行 Remotion 合成。

1. `Postgres - Claim SCRIPT_READY Split`：领取一条 `SCRIPT_READY`，状态改为 `GENERATING_AUDIO`。
2. `HTTP Request - Generate Audio`：调用 `POST /render/audio`，生成 `voice_main.wav`、`voice_outro.wav`、`voice.wav`、`audio_manifest.json`，并完成字幕时长分配。
3. `Postgres - Update AUDIO_READY`：回写 `voice_path/audio_duration/audio_engine/render_manifest`，状态改为 `AUDIO_READY`。
4. `Postgres - Mark GENERATING_COVER`：封面生成开始，状态改为 `GENERATING_COVER`。
5. `HTTP Request - Generate Cover`：调用 `POST /render/cover`，生成 ComfyUI 封面 `cover_base.png/cover.png`；如果关闭 ComfyUI 或失败且允许 fallback，则生成 placeholder 封面。
6. `Postgres - Update COVER_READY`：回写 `cover_path/media_manifest/comfyui_prompt_ids`，状态改为 `COVER_READY`。
7. `Postgres - Mark RENDERING_VIDEO`：视频合成开始，状态改为 `RENDERING_VIDEO`。
8. `HTTP Request - Render Remotion Video`：调用 `POST /render/remotion`，读取前两步的 `audio_manifest.json` 和 `media_manifest.json`，生成 `subtitles.srt`、`subtitles.json`、`remotion_manifest.json`、`final.mp4`、`manifest.json`。
9. `Postgres - Update NEED_REVIEW Split`：回写最终视频、字幕、manifest 等字段，状态改为 `NEED_REVIEW`。

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
```

页面入口：

```text
http://localhost:5678/webhook/video-review-list
```

可选 Tab 参数：

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
| `rerender_video_only` | `REJECTED` → `AUDIO_READY` | 已拒绝卡片“仅重新合成视频”按钮，自动触发 06 的仅重合成入口；复用已有语音/字幕/封面，只重新生成 `final.mp4` |

页面展示规则：

- 顶部展示 `待审核/已通过/已拒绝/今日审核` 统计。
- 顶部展示 `待审核/生成中/已通过/已拒绝/今日审核` 统计。
- Tab 支持查看 `NEED_REVIEW`、`GENERATING`、`APPROVED`、`REJECTED` 和 `ALL`。
- `GENERATING` 会聚合展示重渲染/生成进度状态：`SCRIPT_READY`、`MEDIA_READY`、`GENERATING_AUDIO`、`AUDIO_READY`、`GENERATING_COVER`、`COVER_READY`、`RENDERING_VIDEO`、`FAILED`、`RENDER_FAILED`。点击“重新渲染视频”后，记录会先进入这里，并由 06 的 `/webhook/video-rerender-split` 自动领取；点击“仅重新合成视频”后，会由 `/webhook/video-rerender-video-only` 自动领取，只跑 Remotion 合成，直到处理完成后回到 `NEED_REVIEW`。
- `GENERATING` Tab 会每 5 秒自动刷新，并在卡片里展示阶段进度条、百分比、更新时间、已用时间；失败状态会展示 `error` 里的错误信息。
- 完成时间使用 `render_finished_at → media_finished_at → created_at → updated_at` 的优先级，并按 `Asia/Shanghai` 格式化成本地可读时间，例如 `2026-04-29 11:00:12`，不会直接展示带 `T/Z` 的 ISO 时间。
- 拒绝原因默认用下拉选择：`脚本不行`、`画面不行`、`声音不行`、`字幕不行`、`整体重做`；旁边的补充说明可选，提交后会和下拉原因合并写入 `review_note`。
- 视频预览读取 `video_path` 指向的本地文件，路径通常是 `/data/output/<task_id>/final.mp4`，对应宿主机目录 `data/output/<task_id>/final.mp4`。
- 如果数据库记录还在，但本地 `final.mp4` 已被清理或移动，页面会显示“视频文件不可预览 / 本地文件可能已被清理”。这种记录需要重新渲染或恢复文件后才能预览。
- Remotion renderer 的 `/asset` 静态资源接口支持 `HEAD` 和 `Range` 请求，浏览器 `<video>` 可以正常读取 metadata、拖动和播放已存在的视频文件。
- `待审核`标签里的通过/拒绝会进入审核动作完成页，页面按最终状态上色并提供“返回对应列表 / 查看待审核 / 查看已通过 / 查看已拒绝”按钮；其他标签里的退回/重渲染/仅重新合成视频会在当前列表页内执行，成功后刷新当前页，不再展示二级结果页。

导入/更新审核中心工作流：

```bash
docker cp n8n/workflow/08_review_list_workflow.json n8n-video-n8n:/tmp/08_review_list_workflow.json
docker exec n8n-video-n8n n8n import:workflow --input=/tmp/08_review_list_workflow.json --projectId=NGUCqFuUfTK6tdLq
docker exec n8n-video-n8n n8n update:workflow --id=videoAgentReviewListMvp08 --active=true
docker compose restart n8n
```

## TTS 语音配置

`config/tts_voice_config.json` 控制语音风格和合成参数：

- `voice_prompt`：语音风格描述
- `cfg_value`：控制强度（默认 2.0）
- `inference_timesteps`：推理步数（默认 10）
- `max_chars`：分句最大字符数

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
