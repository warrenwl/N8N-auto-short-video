// n8n Code node: Render Novel Project Action Result HTML
// Used by continue writing, approved chapter rewrite, and review reminder resend.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const resultLabel = {
  STORY_TREATMENT_JOB_CREATED: '已创建创作母本任务',
  BIBLE_JOB_CREATED: '已创建生成设定集任务',
  OUTLINE_JOB_CREATED: '已创建生成大纲任务',
  DIRECTOR_JOB_CREATED: '已创建导演台任务',
  DIRECTOR_CARD_UPDATED: '导演台已保存',
  DIRECTOR_CARD_REGENERATE_JOB_CREATED: '已创建导演台重生成任务',
  DIRECTOR_CARD_CHAPTER_JOB_CREATED: '已按导演台创建正文任务',
  DIRECTOR_CARD_NOT_FOUND: '导演台不存在',
  DIRECTOR_CARD_NOT_READY: '导演台仍需调整',
  CHAPTER_JOB_CREATED: '已创建章节生成任务',
  STORY_TREATMENT_REGENERATE_JOB_CREATED: '已创建重跑创作母本任务',
  BIBLE_REGENERATE_JOB_CREATED: '已创建重跑设定集任务',
  OUTLINE_REGENERATE_JOB_CREATED: '已创建重跑大纲任务',
  REGENERATE_JOB_ALREADY_EXISTS: '已有重跑任务',
  PROJECT_COMPLETED: '项目已完结',
  NEED_REVIEW_BLOCKED: '有章节待审核',
  ACTIVE_JOB_BLOCKED: '队列仍在推进',
  FAILED_JOB_BLOCKED: '存在失败任务',
  PROJECT_PAUSED: '项目已暂停',
  PROJECT_NOT_FOUND: '项目未找到',
  REWRITE_JOB_CREATED: '已创建重写任务',
  REWRITE_JOB_ALREADY_EXISTS: '已有重写任务',
  REWRITE_WORKER_START_REQUESTED: '已启动重写任务',
  REWRITE_WORKER_RECOVERED: '已恢复重写任务',
  REWRITE_JOB_STILL_RUNNING: '重写任务仍在运行',
  REWRITE_JOB_NOT_STARTABLE: '重写任务不可启动',
  NOTIFY_JOB_CREATED: '已创建审核提醒任务',
  NOTIFY_JOB_ALREADY_EXISTS: '已有审核提醒任务',
  NO_MATCH_OR_INVALID_STATE: '状态不允许执行',
  BIBLE_UPDATED: '设定集已保存',
  BIBLE_PATCH_APPLIED: '扩写设定补丁已应用',
  BIBLE_PATCH_REJECTED: '扩写设定补丁已拒绝',
  BIBLE_PATCH_REGENERATE_QUEUED: '已创建补丁重生成任务',
  BIBLE_PATCH_REGENERATE_ALREADY_EXISTS: '已有补丁生成任务',
  BIBLE_PATCH_NOT_FOUND: '设定集补丁不存在',
  BIBLE_PATCH_NOT_APPLICABLE: '设定集补丁不可应用',
  INVALID_BIBLE_PATCH_ACTION: '设定集补丁操作无效',
  OUTLINE_UPDATED: '大纲已保存',
  PROJECT_TARGET_UPDATED: '项目目标已保存',
  PROJECT_PAUSED: '项目已暂停',
  PROJECT_RESUMED: '项目已恢复',
  PROJECT_ALREADY_PAUSED: '项目已经暂停',
  PROJECT_NOT_PAUSED: '项目未暂停',
  PROJECT_FAILED_BLOCKED: '项目失败待处理',
  PROJECT_ARCHIVED: '项目已归档',
  PROJECT_ALREADY_ARCHIVED: '项目已经归档',
  PROJECT_NOT_ARCHIVED: '项目未归档',
  PROJECT_RESTORED: '项目已恢复',
  CONFIRM_TITLE_MISMATCH: '确认项目名不匹配',
  RUNNING_JOB_BLOCKED: '仍有任务运行中',
  CHAPTER_MANUAL_EDIT_SAVED: '正文已保存',
  MANUAL_CHAPTER_CANDIDATE_CREATED: '已创建人工编辑候选稿',
  SUPERSEDED_CHAPTER_VERSION: '章节版本已过期',
  MANUAL_REVIEW_CANDIDATE_CREATED: '已保存人工改稿并送审',
  MANUAL_REVIEW_DRAFT_SAVED: '已保存人工改稿',
  MANUAL_REVIEW_APPROVED: '人工改稿已直接通过',
  INVALID_MANUAL_REVIEW_DECISION: '人工改稿决策无效',
  ACTIVE_CHAPTER_JOB_BLOCKED: '同章任务仍在处理',
  INVALID_CHAPTER_BODY: '正文无效',
  INVALID_PROJECT_TARGET: '项目目标无效',
  TARGET_BELOW_PROGRESS: '目标小于当前进度',
  BIBLE_REQUIRED: '需要先生成设定集',
  INVALID_REGENERATE_STEP: '重跑类型无效',
  INVALID_OUTLINE_INPUT: '大纲输入无效',
  OUTLINE_NOT_FOUND: '大纲不存在',
  INVALID_PROJECT_ACTION: '项目操作无效',
  FACT_CREATED: '事实已新增',
  FACT_UPDATED: '事实已保存',
  FACT_ACTIVATED: '事实已激活',
  FACT_DEACTIVATED: '事实已失效',
  FACTS_CLEARED: '失效事实已清理',
  STALE_CHAPTERS_CLEARED: '过期历史章节已清理',
  STALE_CHAPTERS_NONE: '没有过期历史章节',
  RUNNING_STALE_CHAPTER_JOB_BLOCKED: '过期章节仍有关联任务运行',
  ARCHIVED_PROJECTS_CLEARED: '已清理归档项目',
  ARCHIVED_PROJECTS_NONE: '没有已归档项目',
  FACT_NOT_FOUND: '事实不存在',
  INVALID_FACT_ACTION: '事实操作无效',
  INVALID_FACT_INPUT: '事实内容无效',
};

const actionLabel = {
  CONTINUE_PROJECT: '继续写作',
  REQUEST_APPROVED_REWRITE: '申请重写此章',
  START_REWRITE_WORKER: '启动待执行重写',
  REGENERATE_STORY_TREATMENT: '重新生成创作母本',
  REGENERATE_BIBLE: '重新生成设定集',
  REGENERATE_OUTLINE: '重新生成大纲',
  UPDATE_DIRECTOR_CARD: '编辑导演台',
  REGENERATE_DIRECTOR_CARD: '重新生成导演台',
  START_CHAPTER_FROM_DIRECTOR: '按导演台生成正文',
  RESEND_REVIEW_NOTIFICATION: '重新发送审核提醒',
  UPDATE_BIBLE: '编辑设定集',
  MANAGE_BIBLE_PATCH: '处理扩写设定补丁',
  UPDATE_OUTLINE: '编辑大纲',
  UPDATE_PROJECT_TARGET: '修改项目目标',
  PAUSE_PROJECT: '暂停项目',
  RESUME_PROJECT: '恢复项目',
  TOGGLE_PROJECT_PAUSE: '暂停或恢复项目',
  MANUAL_EDIT_CHAPTER: '手动编辑正文',
  MANUAL_EDIT_REVIEW_CHAPTER: '审核中人工改稿',
  ARCHIVE_PROJECT: '归档项目',
  RESTORE_PROJECT: '恢复归档项目',
  CREATE_FACT: '新增人工事实',
  UPDATE_FACT: '编辑事实',
  ACTIVATE_FACT: '激活事实',
  DEACTIVATE_FACT: '设为失效事实',
  CLEAR_INACTIVE_FACTS: '清理失效事实',
  CLEAR_STALE_CHAPTERS: '清理过期历史章节',
  CLEAR_ARCHIVED_PROJECTS: '清理已归档项目',
  MANAGE_FACT: '事实库操作',
};

const projectStatusLabel = {
  CREATED: '待生成创作母本',
  BIBLE_READY: '设定集已完成',
  OUTLINE_READY: '大纲已完成',
  WRITING: '写作中',
  REVIEWING: '待人工审核',
  PAUSED: '已暂停',
  ARCHIVED: '已归档',
  COMPLETED: '已完结',
  FAILED: '已失败',
};

const jobTypeLabel = {
  GENERATE_STORY_TREATMENT: '生成创作母本',
  GENERATE_BIBLE: '生成设定集',
  GENERATE_BIBLE_PATCH: '生成扩写设定补丁',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  NOTIFY_REVIEW: '发送审核提醒',
};

const chapterStatusLabel = {
  NEED_REVIEW: '待人工审核',
  APPROVED: '已批准',
  PUBLISHED: '已发布',
  REWRITE_REQUESTED: '已要求重写',
  SUPERSEDED: '已被新版本替代',
  REJECTED: '已拒绝',
  FAILED: '已失败',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

const row = $json || {};
const success = row.success === true || row.success === 'true';
const projectId = row.project_id || '';
const chapterId = row.chapter_id || '';
const reviewToken = row.review_token || row.token || '';
const resultCode = row.result_code || 'UNKNOWN';
const action = row.action || '';
const headline = success ? '操作已提交' : '操作未执行';
const detailHref = projectId ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-project-list';
const reviewHref = chapterId && reviewToken
  ? `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(chapterId)}&review_token=${encodeURIComponent(reviewToken)}`
  : '/webhook/novel-review-list';
const queueHref = projectId ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-queue-status';
const primaryHref = success && resultCode === 'MANUAL_REVIEW_DRAFT_SAVED' ? reviewHref : detailHref;
const primaryLabel = success && resultCode === 'MANUAL_REVIEW_DRAFT_SAVED'
  ? '继续修改正文'
  : (projectId ? '返回项目控制台' : '返回项目列表');

const rows = [
  ['操作', label(actionLabel, action, '项目操作')],
  ['结果', label(resultLabel, resultCode, '未记录')],
  ['说明', row.message || '操作结果已记录。'],
  ['项目状态', label(projectStatusLabel, row.project_status, row.project_status || '未记录')],
  ['目标章节', row.target_total_chapters || '-'],
  ['每章字数', row.target_words_per_chapter || '-'],
  ['章节序号', row.chapter_no || '-'],
  ['章节状态', label(chapterStatusLabel, row.chapter_status, row.chapter_status || '未记录')],
  ['任务类型', label(jobTypeLabel, row.job_type, row.job_type || '未创建任务')],
  ['任务编号', row.job_id || '-'],
  ['设定集编号', row.bible_id || '-'],
  ['设定补丁编号', row.bible_patch_id || '-'],
  ['大纲编号', row.outline_id || '-'],
  ['章节编号', chapterId || '-'],
  ['取消任务数', row.cancelled_job_count || '-'],
  ['清理章节数', row.deleted_chapter_count || '-'],
  ['清理项目数', row.deleted_project_count === 0 ? '0' : (row.deleted_project_count || '-')],
  ['清理项目', row.deleted_project_titles || '-'],
  ['失效事实数', row.inactivated_fact_count || '-'],
].map(([key, value]) => `
  <dt>${escapeHtml(key)}</dt>
  <dd translate="${key.endsWith('编号') ? 'no' : 'yes'}">${escapeHtml(value || '-')}</dd>
`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f6f7f9" />
  <title>${escapeHtml(headline)}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --danger:#b42318; --danger-soft:#fff0ee; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    main { width: min(880px, calc(100vw - 32px)); margin: 24px auto 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    .muted { color: var(--muted); margin: 6px 0 0; line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .result { padding: 18px; border-color: ${success ? '#b9e3d4' : '#f2b8b5'}; background: ${success ? 'var(--accent-soft)' : 'var(--danger-soft)'}; }
    .detail { padding: 16px; }
    dl { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px 12px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; word-break: break-word; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 16px; border-top: 1px solid var(--line); }
    .button { min-height: 42px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 14px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; touch-action: manipulation; }
    .button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .button.primary:hover { background: #19664e; }
    a:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 720px); margin-top: 16px; }
      header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      dl { grid-template-columns: 1fr; }
      .actions { display: grid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="page-context">
    <header>
      <div>
        <h1>${escapeHtml(headline)}</h1>
        <p class="muted">${escapeHtml(label(actionLabel, action, '项目操作'))}</p>
      </div>
    </header>
    </div>
    <section class="result" aria-live="polite">
      <h2>结果 + 下一步 + 返回上下文</h2>
      <strong>${escapeHtml(label(resultLabel, resultCode, '未记录'))}</strong>
      <p>${escapeHtml(row.message || '操作结果已记录。')}</p>
    </section>
    <section>
      <div class="detail">
        <dl>${rows}</dl>
      </div>
      <div class="actions">
        <a class="button primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
        <a class="button" href="${escapeHtml(queueHref)}">查看队列</a>
        <a class="button" href="/webhook/novel-review-list">审核中心</a>
        <a class="button" href="/webhook/novel-project-list">项目列表</a>
      </div>
    </section>
  </main>
</body>
</html>`;

return [{json: {...row, response_html: html, response_status_code: success ? 200 : 409}}];
