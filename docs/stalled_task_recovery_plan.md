# 生成中任务补救版本计划

## 目标

当 n8n 重启、worker 超时、外部服务短暂不可用导致 `video_topics` 长时间停在中间状态时，审核中心要能看出“卡住了”，并提供不浪费已有素材的恢复动作。

## V1：人工急救按钮（已完成）

- 在视频审核中心 `GENERATING` Tab 展示超时提示。
- `GENERATING_AUDIO` 超过 15 分钟后可“重新生成语音”。
- 任一超时生成中任务可“标记失败”。
- 已修复生成中已用时间的 UTC/本地时区偏差。

## V2：分阶段精准恢复（已完成）

本阶段补齐每个主要阶段的专属恢复动作：

| 状态 | 补救动作 | 目标状态 | 后续触发 |
|---|---|---|---|
| `GENERATING_SCRIPT` | 重新生成脚本 | `IDEA` | `/webhook/video-script-start` |
| `SCRIPT_READY` | 重新触发渲染 | `SCRIPT_READY` | `/webhook/video-render-start` |
| `GENERATING_AUDIO` | 重新生成语音 | `SCRIPT_READY` | `/webhook/video-render-start` |
| `AUDIO_READY` + `VIDEO_RERENDER_REQUESTED` | 仅重新合成视频 | `AUDIO_READY` | `/webhook/video-rerender-video-only` |
| `AUDIO_READY` 其他情况 | 继续生成封面 | `AUDIO_READY` | `/webhook/video-rerender-cover` |
| `GENERATING_COVER` | 重新生成封面 | `AUDIO_READY` | `/webhook/video-rerender-cover` |
| `COVER_READY` | 重新合成视频 | `AUDIO_READY` | `/webhook/video-rerender-video-only` |
| `RENDERING_VIDEO` | 重新合成视频 | `AUDIO_READY` | `/webhook/video-rerender-video-only` |

验收标准：

- 页面只在超时后展示补救区域。
- 每个补救动作只允许当前合理状态执行，token 校验仍然有效。
- 06 新增“复用语音、重新封面+合成”入口 `/webhook/video-rerender-cover`，不影响现有 01/06 手动执行和现有重渲染入口。
- README 与 workflow sticky note 同步更新。

## V3：任务事件日志（已完成）

- 新增 `video_task_events` 表。
- 记录阶段开始/完成、人工补救、自动触发、失败原因。
- 审核中心可展示最近事件，方便排查卡住原因。

## V4：自动巡检与自动恢复（已完成）

- 新增定时巡检工作流。
- 自动扫描超时任务并按策略重试。
- 记录重试次数，超过上限后标记失败并推送提醒。

## 当前进度

- V1 已上线。
- V2 已上线：审核中心会按当前阶段展示对应补救按钮，06 已增加封面恢复支路。
- V2 风险修复已完成：06 会向 worker 显式传递 `existing_voice_path / existing_audio_duration / existing_audio_engine`；worker 在缺少 `audio_manifest.json` 时会优先用已有语音重建最小音频 manifest，不再因为 manifest 被清理而重新 TTS。
- V3 已上线：新增 `sql/37_create_video_task_events.sql`，01/06/08 的关键状态变更会写入 `video_task_events`；审核中心卡片会展示最近 5 条事件，便于定位任务卡在哪一步、是否由人工补救触发。
- V4 已上线：新增 `sql/38_add_auto_recovery_fields.sql`、`sql/39_auto_recover_stalled_tasks.sql` 和 `10_自动巡检与恢复_生成中任务`。工作流每 5 分钟扫描超时生成中任务，最多自动恢复 2 次；超过上限后标记 `FAILED`、禁用后续自动恢复并推送 Server酱提醒。`AUDIO_READY` 会保留当前补救意图：如果是仅重新合成视频请求，会继续走 `/webhook/video-rerender-video-only`；否则才走封面恢复。
- V4.1 已上线：10 工作流新增产物探测修复。若 `GENERATING_COVER` 已存在 `cover.png/media_manifest.json` 但数据库未回写，会自动补齐封面字段并触发仅重新合成视频；若 `RENDERING_VIDEO` 已存在 `final.mp4/manifest.json` 但数据库未回写，会自动补齐成片字段并进入 `NEED_REVIEW`。
- V4.2 已上线：06 的已拒绝“重新渲染视频”路径会在语音生成失败时立即写入 `error/review_note` 和 `STAGE_FAILED` 事件；10 会把 `GENERATING_AUDIO + RERENDER_REQUESTED` 识别为重渲染专属卡住任务，已有错误时 1 分钟后恢复到 `MEDIA_READY + RERENDER_REQUESTED` 并重新触发 `/webhook/video-rerender-split`，无错误但长时间无响应时 5 分钟后恢复。
