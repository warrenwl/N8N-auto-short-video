# 05_ComfyUI封面_Remotion动态版式_VoxCPM_TTS 计划文档

更新时间：2026-04-28 19:28 CST

## 1. 背景

当前 `04_ComfyUI真实封面分镜图_VoxCPM_TTS` 已经能完成：

- 从 PostgreSQL 领取 `SCRIPT_READY` 话题。
- 使用 VoxCPM 生成 `voice.wav`。
- 使用 ComfyUI 生成封面图和分镜静态图。
- 使用 FFmpeg 把静态分镜图生成视频片段、拼接、烧录字幕并合成语音。
- 回写 PostgreSQL 为 `NEED_REVIEW`。

但当前方案的正片画面仍是静态图片轮播，即使加入轻微缩放/平移，也容易呈现 PPT 感。对于知识口播、经验分享类短视频，更适合采用动态信息版式：用字幕、关键词、章节卡片、背景运动和节奏化转场承载内容。

因此下一阶段采用方案 B：

```text
ComfyUI 只生成封面主视觉
Remotion 负责正片动态版式、字幕、音频合成和最终视频输出
```

## 2. 目标

新增一条主流程：

```text
05_ComfyUI封面_Remotion动态版式_VoxCPM_TTS
```

目标是将成片链路调整为：

```text
01 生成脚本/分镜
  ↓
05 领取 SCRIPT_READY
  ↓
VoxCPM 生成口播 voice.wav
  ↓
ComfyUI 生成 cover_base.png / cover.png
  ↓
worker 生成 remotion_manifest.json
  ↓
Remotion 生成动态信息流 final.mp4
  ↓
PostgreSQL 回写 NEED_REVIEW
```

## 3. 非目标

本阶段暂不做：

- 每个分镜的 ComfyUI 静态图轮播。
- 图生视频、真人数字人、口型同步。
- 自动发布到平台。
- 多模板自动选择。
- 逐字级 ASR 对齐字幕。

这些可以作为后续阶段扩展。

## 4. 模块分工

### 4.1 PostgreSQL

继续使用 `video_topics` 表保存任务状态和产物路径。

需要复用或新增字段：

- `video_path`
- `cover_path`
- `subtitle_path`
- `clips_json`
- `render_manifest`
- `voice_path`
- `audio_duration`
- `audio_engine`
- `media_engine`
- `media_manifest`
- `comfyui_prompt_ids`

可选新增字段：

- `remotion_manifest`
- `render_engine`

如果不新增字段，也可以先把 Remotion 相关信息写入现有 `render_manifest` / `media_manifest`。

### 4.2 n8n

新增 workflow：

```text
05_ComfyUI封面_Remotion动态版式_VoxCPM_TTS
```

节点建议：

1. `Manual Trigger`
2. `Postgres - Claim One SCRIPT_READY Remotion`
3. `Code - Build Render Request Remotion`
4. `HTTP Request - Render Dynamic Video with Remotion`
5. `Code - Parse Render Response Remotion`
6. `Postgres - Update NEED_REVIEW Remotion`

请求体中新增：

```json
{
  "enable_tts": true,
  "enable_comfyui": true,
  "comfyui_mode": "cover_only",
  "render_engine": "remotion"
}
```

### 4.3 video-worker

继续作为总调度服务，保留：

- 读取 TTS 配置。
- 调 VoxCPM 生成 `voice.wav`。
- 根据真实音频时长计算字幕/分镜时间轴。
- 调 ComfyUI 生成封面图。
- 生成 `subtitles.srt` 和 `subtitles.json`。
- 生成 `remotion_manifest.json`。
- 调用 Remotion renderer 服务。
- 写入 `manifest.json` 并返回 n8n。

需要新增/调整：

- `render_engine: "ffmpeg" | "remotion"`。
- `comfyui_mode: "cover_only" | "all_shots"`。
- `generate_cover_image()`：只生成封面，不生成分镜图。
- `build_remotion_manifest()`：把素材和时间轴整理为 Remotion 输入。
- `render_with_remotion()`：调用 Remotion renderer HTTP 服务。

### 4.4 ComfyUI

本阶段只负责封面主视觉：

```text
cover_prompt -> cover_base.png -> cover.png
```

默认使用本机 ComfyUI Desktop API：

```text
Docker 内访问：http://host.docker.internal:8000
宿主机访问：http://127.0.0.1:8000
```

继续使用模板：

```text
comfyui/zimage_text2image_api_template.json
```

### 4.5 Remotion renderer

新增服务目录建议：

```text
remotion-video/
  package.json
  tsconfig.json
  src/
    Root.tsx
    DynamicShortVideo.tsx
    components/
      Background.tsx
      Caption.tsx
      ChapterCard.tsx
      ProgressBar.tsx
    server.ts
```

服务接口建议：

```text
POST /render
```

请求体：

```json
{
  "manifest_path": "/data/output/<task_id>/remotion_manifest.json",
  "output_path": "/data/output/<task_id>/final.mp4"
}
```

返回：

```json
{
  "status": "ok",
  "video_path": "/data/output/<task_id>/final.mp4",
  "duration": 42.5,
  "render_engine": "Remotion"
}
```

## 5. Remotion Manifest 设计

建议文件路径：

```text
data/output/<task_id>/remotion_manifest.json
```

建议结构：

```json
{
  "task_id": "...",
  "title": "...",
  "cover_text": "...",
  "cover_path": "/data/output/<task_id>/cover.png",
  "voice_path": "/data/output/<task_id>/voice.wav",
  "audio_duration": 42.5,
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "template_type": "knowledge",
  "theme": {
    "style": "clean_knowledge",
    "primary_color": "#F8D66D",
    "background_color": "#111111"
  },
  "segments": [
    {
      "index": 1,
      "start": 0,
      "end": 5.2,
      "duration": 5.2,
      "subtitle": "普通人做副业，第一步不是找项目。",
      "headline": "先别急着找项目",
      "body": "普通人做副业，第一步不是找项目。",
      "keywords": ["副业", "第一步", "找项目"],
      "layout_hint": "先给反差"
    }
  ]
}
```

## 6. 动态版式设计

第一版 Remotion 模板建议：

- 竖屏：`1080x1920`
- 帧率：`30fps`
- 背景：
  - 使用 `cover.png` 作为模糊背景源。
  - 加半透明深色遮罩，提高字幕可读性。
  - 轻微缩放/漂移，避免静态。
- 内容：
  - 顶部显示标题或章节序号。
  - 中部显示每段的 headline / keywords。
  - 底部显示当前字幕。
  - 底部加入进度条。
- 转场：
  - 分镜段落之间使用轻微淡入/上滑。
  - 关键词卡片使用 stagger 动画。
- 音频：
  - 使用 `voice.wav`。
  - 视频总时长按音频真实时长加安全尾帧计算。

## 7. 验收标准

### 7.1 功能验收

- 能从 n8n 手动运行 `05_ComfyUI封面_Remotion动态版式_VoxCPM_TTS`。
- 能从 `SCRIPT_READY` 成功流转到 `NEED_REVIEW`。
- 输出目录包含：
  - `cover_base.png`
  - `cover.png`
  - `voice.wav`
  - `subtitles.srt`
  - `subtitles.json`
  - `remotion_manifest.json`
  - `final.mp4`
  - `manifest.json`
- PostgreSQL 回写：
  - `video_path`
  - `cover_path`
  - `voice_path`
  - `audio_duration`
  - `audio_engine = VoxCPM`
  - `media_engine = ComfyUI`
  - `render_manifest`

### 7.2 质量验收

- 正片不再呈现静态分镜图片轮播。
- 字幕和语音内容一致。
- 字幕时间轴基本匹配口播节奏。
- 视频包含音频流和视频流。
- 画面为竖屏 1080x1920。
- 封面由 ComfyUI 生成。
- 正片由 Remotion 生成动态信息版式。

### 7.3 回退验收

- 04 workflow 保留不动，可继续作为 FFmpeg/ComfyUI 全分镜图版本回退。
- worker 保留 `render_engine = "ffmpeg"` 兼容路径。
- Remotion 服务失败时，错误要写入 `error` 或返回给 n8n，不静默生成错误产物。

## 8. 实施里程碑

### M1：文档和接口定稿

- [x] 生成本计划文档。
- [x] 确认 `remotion_manifest.json` 字段。
- [x] 确认 05 workflow 名称和节点结构。

### M2：Remotion 最小渲染服务

- [x] 新建 `remotion-video/`。
- [x] 实现 `DynamicShortVideo` composition。
- [x] 实现 `POST /render` 服务。
- [x] 能读取 `/data/output/<task_id>/remotion_manifest.json`。
- [x] 能输出 `/data/output/<task_id>/final.mp4`。

### M3：worker 接入 Remotion

- [x] 新增 `render_engine` 字段。
- [x] 新增 `comfyui_mode` 字段。
- [x] 新增 cover-only ComfyUI 生成逻辑。
- [x] 新增 `subtitles.json` 输出。
- [x] 新增 `remotion_manifest.json` 输出。
- [x] 新增 `render_with_remotion()`。

### M4：n8n 05 workflow

- [x] 新增 SQL claim/update 文件。
- [x] 新增 Build Request Code。
- [x] 新增 Parse Response Code。
- [x] 新增并导入 05 workflow。

### M5：端到端验证

- [x] 直连 worker 测试。
- [ ] n8n 手动运行测试。
- [ ] 数据库状态回写验证。
- [x] `ffprobe` 验证 `final.mp4` 音视频流。
- [x] 视觉检查：动态版式不像静态图片轮播。

### M6：动态版式第一轮打磨

- [x] 增加顶部栏目/标题安全区。
- [x] 增加中央观点卡片层级。
- [x] 增加关键词阶梯式信息块。
- [x] 增加字幕关键词高亮。
- [x] 增加背景纹理、封面模糊背景和进度条发光。
- [x] 修正 headline/keywords 从字幕提取时把“第一/第二/第三”误当标题的问题。
- [x] 修正中间卡片显示摘要时造成的“文字被截断”感：`body/subtitle` 保留完整口播，`keywords` 仅作为摘要。

### M7：脚本结构增强

- [x] 01 工作流提示词新增 `template_type`、`headline`、`body`、`keywords`、`layout_hint` 输出要求。
- [x] PostgreSQL 新增 `template_type` 字段，取值限定为 `knowledge/list/contrast/story`。
- [x] 05 工作流的 Build Render Request 已转发 Remotion 专用字段。
- [x] worker 优先使用 LLM 输出的 Remotion 字段，缺失时才回退到规则派生。
- [x] Remotion 顶部标签根据 `template_type` 显示“知识口播 / 清单拆解 / 对比观点 / 故事口播”。

### M8：字幕与语音节奏对齐

- [x] worker 在 TTS 生成后使用 `ffmpeg silencedetect` 分析 `voice.wav` 中的静音停顿。
- [x] 字幕分段优先贴近音频静音边界，找不到足够可用停顿时回退到原来的文本长度权重算法。
- [x] `manifest.json` 新增 `subtitle_alignment`，记录对齐方法、检测到的静音点、选中的边界和回退原因。
- [x] Remotion manifest 的 `audio_duration` 改为音频时长与字幕时间轴总长的较大值，避免安全尾帧被裁掉。
- [x] 验证样例：`subtitle_alignment_smoke_001` 已返回 `subtitle_alignment.method = audio_silence_boundaries`，`final.mp4` 包含 H.264 视频流和 AAC 音频流。

### M9：视频观感配置化与模板分化

- [x] 新增 `config/remotion_visual_config.jsonc`，用带注释的配置说明封面取色、多模板、镜头运动、字幕、卡片、结尾页和音频节奏如何生效。
- [x] worker 读取 Remotion 视觉配置，并写入 `remotion_manifest.visual_config`。
- [x] worker 支持从 `cover.png` 提取高亮色；低饱和/偏灰时自动回退到模板配置色。
- [x] Remotion 背景支持配置化 zoom/pan、主色/辅色渐变和封面统一色调。
- [x] Remotion 四类模板开始视觉分化：`knowledge` 概念卡、`list` 步骤式、`contrast` 误区/正解对比、`story` 时间线风格。
- [x] 字幕样式支持配置化字号、行宽、背景透明度和关键词延迟高亮。
- [x] 中间信息卡片支持配置化玻璃透明度、边框、阴影、圆角和数字水印。
- [x] 自动结尾 recap 页已接入，展示 3 个关键词和 CTA。
- [x] 快速渲染验证：`visual_config_smoke_003`、`visual_knowledge_smoke_001`、`visual_list_smoke_001`、`visual_story_smoke_001` 均返回 `status=ok`。

## 9. 风险和决策

### 风险 1：Remotion/Chromium 依赖较重

决策：Remotion 独立为 `remotion-renderer` 服务，不塞进 Python `video-worker` 镜像。

### 风险 2：Docker Hub 网络不稳定

决策：尽量少 rebuild Python worker。Remotion 服务首次构建可能需要 Node 镜像，必要时可先用本机 Node 运行验证，再容器化。

### 风险 3：字幕精确对齐不足

当前字幕是按音频总时长和字幕长度分配，不是逐字 ASR 对齐。第一版接受这个方案，后续可接 Whisper/ASR 做精确时间戳。

### 风险 4：信息版式内容单调

第一版先实现稳定模板。后续通过 `theme` 和 `template_id` 扩展多套版式。

## 10. 当前状态

截至 2026-04-28：

- 01 workflow：脚本/分镜生成可用。
- 03 workflow：VoxCPM TTS + FFmpeg 成片可用。
- 04 workflow：ComfyUI 真封面/分镜图 + VoxCPM TTS + FFmpeg 成片已接入，但静态分镜图轮播观感不理想。
- 05 workflow：已新增并导入 n8n。
- Remotion renderer：已在本机 `tmux` 会话 `remotion_renderer` 中运行，端口 `3001`。
- worker：已支持 `render_engine = "remotion"` 和 `comfyui_mode = "cover_only"`。
- 直连验证：`remotion_cover_e2e_002` 已成功生成 `final.mp4`，包含 H.264 视频流和 AAC 音频流。
- 视觉优化验证：`remotion_cover_e2e_002/final_style_v2.mp4` 已成功生成，抽帧 `preview_frames/style_v2_6s.png` 为 1080x1920。
- n8n UI 手动运行记录：2026-04-28 发现无 `SCRIPT_READY` 任务时 Build 节点会把空 id 转成 `"undefined"`，导致输出 `data/output/undefined` 且最终 PostgreSQL UUID 更新失败；已增加 UUID 防守校验并重新导入 05 workflow。下一次测试前需先通过 01 生成新的 `SCRIPT_READY` 任务。
- 结构化 Remotion 字段验证：`remotion_structured_fields_smoke_001` 已成功生成 `final.mp4`，`remotion_manifest.json` 包含 `template_type`、`headline`、`body`、`keywords`、`layout_hint`，抽帧 `preview_frames/structured_6s.png` 为 1080x1920。
- 完整本地链路验证：`d55251d8-12f8-46ab-8163-685c37beef68` 已完成 VoxCPM TTS、ComfyUI 封面、Remotion 成片和 PostgreSQL `NEED_REVIEW` 回写；`final.mp4` 包含 H.264 视频流和 AAC 音频流，抽帧 `preview_frames/full_flow_10s.png` 为 1080x1920。
- 已新增一键本地验收脚本：`scripts/smoke_test_remotion_structured_flow.sh`。该脚本会检查 worker、Remotion、VoxCPM、ComfyUI 服务，插入结构化测试任务，执行渲染，回写数据库，并生成 `ffprobe` 与 10 秒抽帧。
- GLM Coding API 复核：此前 `401 令牌已过期或验证不正确` 是本地 curl 测试命令的临时变量展开问题，不是 key 失效。已用 n8n 容器内 `GLM_API_KEY` 重新调用 `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`，返回 HTTP 200，并成功拿到 JSON content。注意 GLM-5.1 会消耗较多 reasoning tokens，`max_tokens` 过低时可能 `finish_reason=length` 且 `content` 为空；01 工作流保持 `max_tokens=8000`。
- 字幕对齐验证：`subtitle_alignment_smoke_001` 已完成小型接口渲染，`subtitle_alignment` 选中真实静音边界 `[1.902, 4.929]`，对应三段字幕时间轴 `0.000-1.902 / 1.902-4.929 / 4.929-6.580`。
