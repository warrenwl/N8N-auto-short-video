# 当前可用工作流

这里放当前主线推荐使用的 n8n 工作流。根目录下的 02/02b/03/04/05 是历史阶段链路，保留用于回溯，不建议日常使用。

## 使用顺序

1. `00_topic_center_workflow.json`：选题中心，AI 生成或人工新增候选选题，确认入池为 `video_topics(IDEA)`。
2. `01_postgres_script_workflow.json`：手动执行或由选题中心调用 `/webhook/video-script-start`，`IDEA -> SCRIPT_READY`。
3. `06_split_render_workflow.json`：手动执行正常首渲染，或由 01 调用 `/webhook/video-render-start` 单条触发，`SCRIPT_READY -> NEED_REVIEW`；同时提供已拒绝视频重渲染 webhook。
4. `08_review_list_workflow.json`：浏览器审核中心，处理通过、拒绝、退回、重新渲染和发布入口，并展示每条视频最近任务事件。
5. `09_douyin_semiauto_publish_workflow.json`：已通过视频的抖音半自动发布，生成发布包并推送微信提醒。
6. `10_auto_recovery_workflow.json`：生成中任务自动巡检，每 5 分钟扫描超时任务并按阶段自动恢复。

## 小说工作流 V1

当前小说工作流已跑通“项目创建 -> Bible -> 大纲 -> 导演台 -> 候选章节 -> AI 审稿 -> 人工审核 -> 下一章导演台任务”，并已补齐重写、局部修订、审核提醒和自动恢复。

使用顺序：

1. `11_novel_center_workflow.json`：小说工作台、项目列表、创建页和项目控制台，`GET /webhook/novel-center` 展示当前待办和需要处理的项目；`GET /webhook/novel-project-list` 展示完整项目列表、筛选和项目级跳转；`GET /webhook/novel-project-new` 展示独立创建表单；`GET /webhook/novel-project-detail?project_id=...` 展示设定集、大纲与目录、章节正文与版本、审稿报告、人工审核记录、连续性事实、模型调用日志、运行日志、失败原因、项目操作记录和全文 Markdown 导出；`POST /webhook/novel-project-create` 创建项目并写入 `GENERATE_BIBLE(PENDING)`，浏览器提交后返回中文结果页，解释“待生成设定集”表示任务已排队但内容尚未生成，并提供“立即生成设定集”“查看项目控制台/查看队列”入口；项目控制台还提供立即生成设定集、立即生成大纲、排队下一步、正式章节重写申请、审核提醒重发、编辑设定集、编辑大纲、修改项目目标、暂停或恢复项目等安全 POST 操作。
2. `12_novel_bible_workflow.json`：手动执行可领取任意 `GENERATE_BIBLE`；浏览器可提交 `POST /webhook/novel-generate-bible-now` 领取当前项目的 `GENERATE_BIBLE(PENDING)`。两条链路都会调用 GLM，写入 `novel_ai_runs` 和 `novel_bibles`，并创建 `GENERATE_OUTLINE(PENDING)`。
3. `13_novel_outline_workflow.json`：手动执行可领取任意 `GENERATE_OUTLINE`；浏览器可提交 `POST /webhook/novel-generate-outline-now` 领取当前项目的 `GENERATE_OUTLINE(PENDING)`。两条链路都会调用 GLM，批量写入 `novel_chapter_outlines(READY)`，并创建第 1 章 `PLAN_CHAPTER_DIRECTOR(PENDING)`。
4. `13b_novel_director_workflow.json`：手动执行可领取任意 `PLAN_CHAPTER_DIRECTOR`；浏览器可提交 `POST /webhook/novel-generate-director-now`，也可在项目控制台编辑、重生成或按当前导演台启动正文。导演台只写短 JSON，检查因果、动机、连续性、伏笔和分段计划；通过质量闸门才创建 `GENERATE_CHAPTER(PENDING)`。
5. `14_novel_chapter_workflow.json`：手动执行，领取已有当前 READY 导演台的 `GENERATE_CHAPTER`，调用 GLM，原子写入候选章节 `DRAFT_READY + is_current=false`，写入 `PENDING` continuity facts，并创建 `REVIEW_CHAPTER(PENDING)`。
6. `15_novel_ai_review_workflow.json`：手动执行，领取 `REVIEW_CHAPTER`，调用 GLM 审稿，写入带 `ai_run_id` 的 `novel_review_reports`，章节进入 `NEED_REVIEW + is_current=false`，并创建 `NOTIFY_REVIEW(PENDING)`。
7. `16_novel_review_workflow.json`：浏览器审核中心，`GET /webhook/novel-review-list` 和 `GET /webhook/novel-review-detail` 只展示页面，`POST /webhook/novel-review-action` 才执行通过、要求重写、拒绝或手动重新审稿；详情页还提供 `POST /webhook/novel-review-manual-edit` 人工改稿，以及 `POST /webhook/novel-review-block-revise`、`POST /webhook/novel-review-block-apply` 局部修订确认流。局部修订只对 `NEED_REVIEW` 候选稿生效，AI 建议不会直接覆盖章节；应用后会生成新的待审候选稿，但不会自动进入智能审稿，便于同一章多处连续修改。正文段落支持双击直接改稿，行内“保存继续修改”同样只生成新的待审候选稿，不自动创建 `REVIEW_CHAPTER`。选区会保存偏移和前后锚点，重复原文无法定位时返回“锚点不唯一”；建议卡展示原文/建议 diff，默认只读，点“修改后应用”才进入编辑态。完成局部修改后可在右侧点“重新审稿”创建 `REVIEW_CHAPTER(PENDING)` 并异步启动 15 号审稿 worker；通过后章节变 `APPROVED + is_current=true`，facts 变 `ACTIVE`，并创建下一章 `PLAN_CHAPTER_DIRECTOR(PENDING)`。
8. `17_novel_rewrite_notify_workflow.json`：手动执行，领取 `REWRITE_CHAPTER` 和 `NOTIFY_REVIEW`。重写分支读取原候选稿、人工意见和 AI 审稿意见，调用 GLM 写入新候选版本 `DRAFT_READY + is_current=false`、新 `PENDING` facts，并创建 `REVIEW_CHAPTER(PENDING)`；通知分支只发送审核详情链接 `/webhook/novel-review-detail?chapter_id=...&review_token=...`，不携带通过、拒绝或重写动作链接。
9. `18_novel_auto_recovery_workflow.json`：定时或手动执行，恢复小说任务队列。`PLAN_CHAPTER_DIRECTOR` 和 `GENERATE_CHAPTER` 超时失败只更新 job，因为章节候选尚未创建；`REVIEW_CHAPTER` 达上限后同步章节为 `FAILED`；`REWRITE_CHAPTER` 达上限后只让重写 job 失败，原章节保持 `REWRITE_REQUESTED`；同时取消已不再待审章节的过期 `NOTIFY_REVIEW`，并补齐“章节已批准但下一章任务缺失”的 `PLAN_CHAPTER_DIRECTOR(PENDING)` 或 READY 导演台后的 `GENERATE_CHAPTER(PENDING)`。
10. `19_novel_block_revision_workflow.json`：手动执行或由 16 号审核页异步触发，领取 `REVISE_CHAPTER_BLOCK`。它读取选区、前后文、Bible、事实和导演台，调用 GLM 只生成局部 JSON 建议，并写入 `novel_chapter_block_revisions(SUGGESTED)`；真正应用由 16 号确认 webhook 完成。

小说入口：

`http://localhost:5678/webhook/novel-center`

项目列表入口：

`http://localhost:5678/webhook/novel-project-list`

创建新项目入口：

`http://localhost:5678/webhook/novel-project-new`

项目控制台入口：

`http://localhost:5678/webhook/novel-project-detail?project_id=项目ID`

创建项目后的结果页会自动提供当前项目的“立即生成设定集”“查看项目控制台”和“查看队列”入口。若从项目列表进入，点击项目卡片或表格里的“查看控制台”即可看到该项目的设定集、大纲与目录、已写章节、正文版本、当前正式版本、待审核入口、模型调用、连续性事实和运行日志。项目控制台会在待处理设定集任务上显示“立即生成设定集”，在待处理大纲任务上显示“立即生成大纲”，并把“排队下一步”明确标为不直接调用模型。

排队下一步、指定当前正式章节重写、重新发送审核提醒都从项目控制台提交 POST 表单。排队下一步只补齐缺失队列任务，不直接调用模型；正式章节重写不会覆盖旧正式版本，只创建 `REWRITE_CHAPTER(PENDING)`；审核提醒只发送详情链接。不要把这些动作改成 GET 链接。

编辑设定集、编辑本章大纲、修改项目目标、暂停和恢复项目、手动编辑正文、归档和恢复归档也都从项目控制台提交 POST 表单，并写入 `novel_project_events`。暂停后待处理任务会保留，但 12、13、14、15、17 号队列领取会跳过暂停项目；归档会取消待处理任务并让队列跳过该项目；恢复后可以继续推进。正文编辑只创建候选版本并进入审稿，不会直接覆盖当前正式版本；删除项目当前实现为归档软删除，不做物理删除。

审核动作后续必须继续使用 POST + token；不要把通过、拒绝或要求重写做成 GET 链接。候选稿、待审稿和重写稿都不能抢占 `is_current`；只有人工通过后的 `APPROVED/PUBLISHED` 版本才是当前正式可续写版本。

Server酱只做提醒，不承载审核动作；提醒链接只能进入详情页，真正操作必须回到审核页表单并走 `POST /webhook/novel-review-action`。如果本地执行 n8n CLI，需要先停止运行中的 n8n 容器，执行完成后再启动，避免 SQLite 执行锁冲突。

真实 GLM smoke test 不要再设置 `GLM_API_BASE_URL=http://host.docker.internal:18080/...`，这样才会走 `.env` 中的外部 GLM。联调时如不希望发送真实微信提醒，可在执行 17 号时加 `NOVEL_DISABLE_SERVERCHAN=true`；工作流仍会记录审核详情链接并把提醒任务标记为已处理，但 `remind_status` 会写为 `SKIPPED_DISABLED`。

日常队列处理可使用 `scripts/run_novel_queue_once.sh`：它会按 12/13/13B/14/15/17/19/18 顺序跑一轮，默认带 `NOVEL_DISABLE_SERVERCHAN=true`，只有显式 `--real-notify` 才发送真实 Server酱提醒。详细调度、crontab 和真实重写 smoke 步骤见 `docs/novel_workflow/运行手册.md`。

## 选题入口

`http://localhost:5678/webhook/topic-center`

选题中心支持 AI 生成候选、人工新增候选、确认入池到 `video_topics(IDEA)`、拒绝和标记重复。`AI生成` 标签页读取 `config/topic_idea_config.jsonc`；分类与选题方向是一级/二级联动关系：先选分类，再自动带出该分类下的二级方向，二者都支持自定义。数量默认 1 条，提供 1/2/5/10 下拉，并保留自定义输入；目标受众和内容风格也支持默认下拉与自定义输入。调用 `/webhook/topic-generate` 后会先创建 `topic_generation_jobs(RUNNING)` 并立即返回，页面右侧“生成任务”区域展示 5 秒刷新倒计时并轮询 `/webhook/topic-generation-jobs`；刷新页面不会丢进度，GLM 成功后任务变为 `SUCCEEDED` 并写入 `topic_candidates(NEW, source=glm)`。人工录入是独立标签页，来源固定为 `manual`。`已入池` 标签页中 `IDEA` 状态视频会显示“生成视频”按钮，点击后触发 01，01 写回 `SCRIPT_READY` 后自动触发 06，最终进入视频审核中心。页面顶部有“视频审核中心”入口；视频审核中心顶部也有“选题中心”入口。

M5 候选生成默认 `max_tokens = 8000`，避免 GLM-5.1 reasoning tokens 过多时截断 JSON 正文。超过 5 分钟仍停在 `RUNNING` 的生成任务会由任务列表轮询接口自动标记为 `FAILED`。

## 审核入口

`http://localhost:5678/webhook/video-review-list`

## 重渲染入口

`08` 的“重新渲染视频”按钮会自动触发 `06` 的 `/webhook/video-rerender-split`，一般不需要手动打开；“重新生成封面”会自动触发 `/webhook/video-rerender-cover`，复用已有语音重新生成封面并合成视频。

`待审核`标签里的“通过/拒绝”仍会进入审核结果页，方便确认最终状态；其他标签里的管理按钮会在当前页内执行，成功后刷新当前页，不再展示二级结果页。

`APPROVED` 视频未进入发布链路时显示“退回待审核 / 直接发布到抖音”；进入发布链路后显示“撤回发布 / 再次发送提醒”；确认已手动发布后视频变为 `PUBLISHED`，进入“已发布”标签页且不再显示操作按钮。

`生成中` 标签页会展示 5 秒刷新倒计时并更新阶段进度。任务超过阈值后会出现“需要补救”区域：脚本阶段可重新触发 01，等待渲染/语音阶段可重新触发 06 首渲染，封面阶段可调用 06 的 `/webhook/video-rerender-cover` 复用语音重新生成封面并继续合成，视频合成阶段可调用 `/webhook/video-rerender-video-only` 复用已有素材重新合成；任何超时生成中任务都可以点击“标记失败”，避免长期卡在中间状态。

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
