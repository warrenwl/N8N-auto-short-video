# 当前可用工作流

这里放当前主线推荐使用的 n8n 工作流。根目录下的 02/02b/03/04/05 是历史阶段链路，保留用于回溯，不建议日常使用。

## 使用顺序

1. `01_postgres_script_workflow.json`：手动执行，`IDEA -> SCRIPT_READY`。
2. `06_split_render_workflow.json`：手动执行正常首渲染，`SCRIPT_READY -> NEED_REVIEW`；同时提供已拒绝视频重渲染 webhook。
3. `08_review_list_workflow.json`：浏览器审核中心，处理通过、拒绝、退回和重新渲染。

## 审核入口

`http://localhost:5678/webhook/video-review-list`

## 重渲染入口

`08` 的“重新渲染视频”按钮会自动触发 `06` 的 `/webhook/video-rerender-split`，一般不需要手动打开。
