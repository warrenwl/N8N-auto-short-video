# 当前可用工作流

这里放当前主线推荐使用的 n8n 工作流。根目录下的 02/02b/03/04/05 是历史阶段链路，保留用于回溯，不建议日常使用。

## 使用顺序

1. `01_postgres_script_workflow.json`：手动执行，`IDEA -> SCRIPT_READY`。
2. `06_split_render_workflow.json`：手动执行正常首渲染，`SCRIPT_READY -> NEED_REVIEW`；同时提供已拒绝视频重渲染 webhook。
3. `08_review_list_workflow.json`：浏览器审核中心，处理通过、拒绝、退回、重新渲染和发布入口。
4. `09_douyin_semiauto_publish_workflow.json`：已通过视频的抖音半自动发布，生成发布包并推送微信提醒。

## 审核入口

`http://localhost:5678/webhook/video-review-list`

## 重渲染入口

`08` 的“重新渲染视频”按钮会自动触发 `06` 的 `/webhook/video-rerender-split`，一般不需要手动打开。

`待审核`标签里的“通过/拒绝”仍会进入审核结果页，方便确认最终状态；其他标签里的管理按钮会在当前页内执行，成功后刷新当前页，不再展示二级结果页。

`APPROVED` 视频未进入发布链路时显示“退回待审核 / 直接发布到抖音”；进入发布链路后显示“撤回发布 / 再次发送提醒”；确认已手动发布后视频变为 `PUBLISHED`，进入“已发布”Tab 且不再显示操作按钮。

## 抖音半自动发布入口

`08` 的“直接发布到抖音”按钮会自动触发 `09` 的 `/webhook/douyin-publish-start`。该链路会生成 `/data/publish/douyin/<job_id>/` 发布包，并通过 Server酱发送微信提醒。

“撤回发布”会调用 `09` 的 `/webhook/douyin-publish-withdraw`，把当前发布任务标记为 `MANUAL_SKIPPED` 并让视频保持 `APPROVED`；“再次发送提醒”会再次调用 `/webhook/douyin-publish-start`，复用同一个发布任务并重新发送 Server酱提醒。

`publish-helper` 对外使用宿主机标准 `80` 端口，微信提醒链接不再带 `:8011`；`8011` 仍保留为本地调试入口，避免影响已有访问习惯。

发布提醒里的下载链接优先使用 Mac 的 Bonjour/mDNS 本地域名，例如 `http://warrndeMacBook-Air.local/publish`，避免换 WiFi 后 IP 变化导致旧链接失效。可用 `scutil --get LocalHostName` 查看本地域名前缀。

微信提醒会优先发送 `http://你的Mac本地域名.local/download/douyin/<job_id>` 下载页，而不是只发裸 `final.mp4`。下载页内包含视频预览、强制附件下载入口、封面下载和文案下载；如果微信内只能播放不能保存，点右上角“在浏览器打开”后再点“下载视频文件”。

发布确认链接 `/webhook/douyin-manual-publish-action` 也由 publish-helper 在标准端口代理到 n8n，避免微信提示非标准端口。
