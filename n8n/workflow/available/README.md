# 当前可用工作流

这里放当前主线推荐使用的 n8n 工作流。根目录下的 02/02b/03/04/05 是历史阶段链路，保留用于回溯，不建议日常使用。

## 使用顺序

1. `00_topic_center_workflow.json`：选题中心，AI 生成或人工新增候选选题，确认入池为 `video_topics(IDEA)`。
2. `01_postgres_script_workflow.json`：手动执行或由选题中心调用 `/webhook/video-script-start`，`IDEA -> SCRIPT_READY`。
3. `06_split_render_workflow.json`：手动执行正常首渲染，或由 01 调用 `/webhook/video-render-start` 单条触发，`SCRIPT_READY -> NEED_REVIEW`；同时提供已拒绝视频重渲染 webhook。
4. `08_review_list_workflow.json`：浏览器审核中心，处理通过、拒绝、退回、重新渲染和发布入口，并展示每条视频最近任务事件。
5. `09_douyin_semiauto_publish_workflow.json`：已通过视频的抖音半自动发布，生成发布包并推送微信提醒。
6. `10_auto_recovery_workflow.json`：生成中任务自动巡检，每 5 分钟扫描超时任务并按阶段自动恢复。

## 选题入口

`http://localhost:5678/webhook/topic-center`

选题中心支持 AI 生成候选、人工新增候选、确认入池到 `video_topics(IDEA)`、拒绝和标记重复。`AI生成` Tab 读取 `config/topic_idea_config.jsonc`；分类与选题方向是一级/二级联动关系：先选分类，再自动带出该分类下的二级方向，二者都支持自定义。数量默认 1 条，提供 1/2/5/10 下拉，并保留自定义输入；目标受众和内容风格也支持默认下拉与自定义输入。调用 `/webhook/topic-generate` 后会先创建 `topic_generation_jobs(RUNNING)` 并立即返回，页面下方“生成任务”区域展示 5 秒刷新倒计时并轮询 `/webhook/topic-generation-jobs`；刷新页面不会丢进度，GLM 成功后任务变为 `SUCCEEDED` 并写入 `topic_candidates(NEW, source=glm)`。人工录入是独立 Tab，来源固定为 `manual`。`已入池` Tab 中 `IDEA` 状态视频会显示“生成视频”按钮，点击后触发 01，01 写回 `SCRIPT_READY` 后自动触发 06，最终进入视频审核中心。页面顶部有“视频审核中心”入口；视频审核中心顶部也有“选题中心”入口。

M5 候选生成默认 `max_tokens = 8000`，避免 GLM-5.1 reasoning tokens 过多时截断 JSON 正文。超过 5 分钟仍停在 `RUNNING` 的生成任务会由任务列表轮询接口自动标记为 `FAILED`。

## 审核入口

`http://localhost:5678/webhook/video-review-list`

## 重渲染入口

`08` 的“重新渲染视频”按钮会自动触发 `06` 的 `/webhook/video-rerender-split`，一般不需要手动打开；“重新生成封面”会自动触发 `/webhook/video-rerender-cover`，复用已有语音重新生成封面并合成视频。

`待审核`标签里的“通过/拒绝”仍会进入审核结果页，方便确认最终状态；其他标签里的管理按钮会在当前页内执行，成功后刷新当前页，不再展示二级结果页。

`APPROVED` 视频未进入发布链路时显示“退回待审核 / 直接发布到抖音”；进入发布链路后显示“撤回发布 / 再次发送提醒”；确认已手动发布后视频变为 `PUBLISHED`，进入“已发布”Tab 且不再显示操作按钮。

`生成中` Tab 会展示 5 秒刷新倒计时并更新阶段进度。任务超过阈值后会出现“需要补救”区域：脚本阶段可重新触发 01，等待渲染/语音阶段可重新触发 06 首渲染，封面阶段可调用 06 的 `/webhook/video-rerender-cover` 复用语音重新生成封面并继续合成，视频合成阶段可调用 `/webhook/video-rerender-video-only` 复用已有素材重新合成；任何超时生成中任务都可以点击“标记失败”，避免长期卡在中间状态。

06 的恢复请求会把数据库里的 `voice_path/audio_duration/audio_engine` 显式传给 worker；如果本地 output 目录里的旧 `audio_manifest.json` 不存在，worker 会用已有语音重建音频 manifest，避免恢复封面或视频合成时误重新生成语音。

V3 已加入任务事件日志：先执行 `sql/37_create_video_task_events.sql` 创建 `video_task_events` 表。01/06/08/10 的关键状态变更会写入脚本、语音、封面、视频合成、人工审核、人工补救、自动恢复和失败事件；审核中心卡片里的“最近事件”折叠区会显示最近 5 条，方便定位任务卡住原因。

V4 已加入自动巡检：先执行 `sql/38_add_auto_recovery_fields.sql` 增加自动恢复字段，再导入并激活 `10_auto_recovery_workflow.json`。该工作流每 5 分钟扫描超时的生成中任务，最多自动恢复 2 次；超过上限后标记 `FAILED`、禁用后续自动恢复，并通过 Server酱提醒人工处理。V4.1 还会优先探测已落盘产物：封面已生成但数据库没回写时，会补齐封面字段并触发仅重新合成视频；最终视频已生成但数据库没回写时，会补齐成片字段并进入 `NEED_REVIEW`。

修改 n8n Code 节点后先运行 `./scripts/check_n8n_code_node_sandbox.js`。这个脚本会扫描所有 workflow JSON，避免再次把 `path` 等 n8n task runner 禁用模块写进 Code 节点。

## 抖音半自动发布入口

`08` 的“直接发布到抖音”按钮会自动触发 `09` 的 `/webhook/douyin-publish-start`。该链路会生成 `/data/publish/douyin/<job_id>/` 发布包，并通过 Server酱发送微信提醒。

“撤回发布”会调用 `09` 的 `/webhook/douyin-publish-withdraw`，把当前发布任务标记为 `MANUAL_SKIPPED` 并让视频保持 `APPROVED`；“再次发送提醒”会再次调用 `/webhook/douyin-publish-start`，复用同一个发布任务并重新发送 Server酱提醒。

`publish-helper` 对外使用宿主机标准 `80` 端口，微信提醒链接不再带 `:8011`；`8011` 仍保留为本地调试入口，避免影响已有访问习惯。

发布提醒里的下载链接优先使用 Mac 的 Bonjour/mDNS 本地域名，例如 `http://warrndeMacBook-Air.local/publish`，避免换 WiFi 后 IP 变化导致旧链接失效。可用 `scutil --get LocalHostName` 查看本地域名前缀。

微信提醒会优先发送 `http://你的Mac本地域名.local/download/douyin/<job_id>` 下载页，而不是只发裸 `final.mp4`。下载页内包含视频预览、强制附件下载入口、封面下载和文案下载；如果微信内只能播放不能保存，点右上角“在浏览器打开”后再点“下载视频文件”。

发布确认链接 `/webhook/douyin-manual-publish-action` 也由 publish-helper 在标准端口代理到 n8n，避免微信提示非标准端口。
