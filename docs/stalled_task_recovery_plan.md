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
| `AUDIO_READY` | 继续生成封面 | `AUDIO_READY` | `/webhook/video-rerender-cover` |
| `GENERATING_COVER` | 重新生成封面 | `AUDIO_READY` | `/webhook/video-rerender-cover` |
| `COVER_READY` | 重新合成视频 | `AUDIO_READY` | `/webhook/video-rerender-video-only` |
| `RENDERING_VIDEO` | 重新合成视频 | `AUDIO_READY` | `/webhook/video-rerender-video-only` |

验收标准：

- 页面只在超时后展示补救区域。
- 每个补救动作只允许当前合理状态执行，token 校验仍然有效。
- 06 新增“复用语音、重新封面+合成”入口 `/webhook/video-rerender-cover`，不影响现有 01/06 手动执行和现有重渲染入口。
- README 与 workflow sticky note 同步更新。

## V3：任务事件日志

- 新增 `video_task_events` 表。
- 记录阶段开始/完成、人工补救、自动触发、失败原因。
- 审核中心可展示最近事件，方便排查卡住原因。

## V4：自动巡检与自动恢复

- 新增定时巡检工作流。
- 自动扫描超时任务并按策略重试。
- 记录重试次数，超过上限后标记失败并推送提醒。

## 当前进度

- V1 已上线。
- V2 已上线：审核中心会按当前阶段展示对应补救按钮，06 已增加封面恢复支路。
