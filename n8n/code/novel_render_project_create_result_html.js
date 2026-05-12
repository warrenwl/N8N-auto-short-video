// n8n Code node: Render Novel Project Create Result HTML
// Browser form submissions should land on a useful page, not raw API JSON.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const projectStatusLabel = {
  CREATED: '待生成创作母本',
  BIBLE_READY: '设定集已完成',
  OUTLINE_READY: '大纲已完成',
  WRITING: '写作中',
  REVIEWING: '待人工审核',
  PAUSED: '已暂停',
  COMPLETED: '已完结',
  FAILED: '已失败',
};

const jobTypeLabel = {
  GENERATE_STORY_TREATMENT: '生成创作母本',
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  NOTIFY_REVIEW: '发送审核提醒',
};

const jobStatusLabel = {
  PENDING: '待处理',
  RUNNING: '运行中',
  SUCCEEDED: '已完成',
  FAILED: '已失败',
  CANCELLED: '已取消',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function formHidden(name, value) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" />`;
}

function generationForm(projectId, jobType) {
  if (!projectId || jobType !== 'GENERATE_STORY_TREATMENT') return '';
  return `
    <form class="inline-form action-now" method="POST" action="/webhook/novel-generate-treatment-now" data-confirm="这会启动后台模型任务；提交完成后会回到项目控制台刷新状态。确认启动？">
      ${formHidden('project_id', projectId)}
      ${formHidden('step', 'treatment')}
      <button class="button primary" type="submit"><span>启动创作母本生成</span><small>后台执行并刷新状态</small></button>
    </form>`;
}

const row = ($input.all()[0] || {}).json || {};
const projectId = row.id ? String(row.id) : '';
const detailHref = projectId
  ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}`
  : '/webhook/novel-project-list';
const queueHref = projectId
  ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`
  : '/webhook/novel-queue-status';
const isSuccess = row.success !== false && Boolean(projectId);
const title = isSuccess ? '创建项目成功' : '创建项目未完成';
const summary = isSuccess
  ? '项目已经创建，已创建创作母本生成任务并进入队列。系统会先生成主题内核、悬念栈、真相阶梯和情绪弧线，再继续生成设定集与大纲；你可以点击下方按钮启动后台生成。'
  : '没有拿到项目创建结果。请返回创建页检查标题和核心创意，再重新提交。';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f6f7f9" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --warn-soft:#fff7e8; --danger:#b42318; --danger-soft:#fff0ee; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    main { width: min(920px, calc(100vw - 32px)); margin: 24px auto 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { line-height: 1.7; }
    .muted { color: var(--muted); margin: 6px 0 0; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .result { padding: 18px; border-color: #b9e3d4; background: var(--accent-soft); }
    .result.warn { border-color: #f1ce96; background: var(--warn-soft); }
    .detail { padding: 16px; }
    dl { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 10px 12px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; word-break: break-word; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; padding: 16px; border-top: 1px solid var(--line); }
    .inline-form { margin: 0; display: inline-flex; }
    .button, .inline-form button { min-height: 42px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 14px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 750; touch-action: manipulation; cursor: pointer; }
    .inline-form button { flex-direction: column; justify-content: center; align-items: flex-start; gap: 1px; min-height: 46px; }
    .inline-form button small { display: block; font-size: 11px; line-height: 1.2; font-weight: 650; opacity: .8; }
    .button.primary, .inline-form button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .button:hover, .inline-form button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .button.primary:hover, .inline-form button.primary:hover { background: #19664e; }
    .mode-note { padding: 14px 16px; border-top: 1px solid var(--line); color: var(--muted); line-height: 1.7; }
    button:disabled { opacity: .65; cursor: progress; }
    .action-toast { position: fixed; right: 18px; bottom: 18px; z-index: 90; max-width: min(420px, calc(100vw - 36px)); border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px 14px; background: #fff; color: var(--ink); box-shadow: 0 18px 44px rgba(16, 24, 40, .18); line-height: 1.55; }
    .action-toast strong { display: block; margin-bottom: 2px; }
    .action-toast.is-error { border-color: #f2b8b5; background: var(--danger-soft); color: var(--danger); }
    .action-toast[hidden] { display: none !important; }
    a:focus-visible, button:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 720px); margin-top: 16px; }
      header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      dl { grid-template-columns: 1fr; }
      .actions { display: grid; }
      .inline-form { display: grid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="page-context">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(row.title || '未命名项目')}</p>
      </div>
    </header>
    </div>

    <section class="result ${isSuccess ? '' : 'warn'}" aria-live="polite">
      <h2>结果 + 下一步 + 返回上下文</h2>
      <p>${escapeHtml(summary)}</p>
    </section>

    <section>
      <div class="detail">
        <h2>创建结果</h2>
        <dl>
          <dt>小说标题</dt><dd>${escapeHtml(row.title || '未命名项目')}</dd>
          <dt>类型</dt><dd>${escapeHtml(row.genre || '未设置')}</dd>
          <dt>项目状态</dt><dd>${escapeHtml(label(projectStatusLabel, row.status, '未记录'))}</dd>
          <dt>目标章节</dt><dd>${escapeHtml(row.target_total_chapters || 0)}</dd>
          <dt>每章字数</dt><dd>${escapeHtml(row.target_words_per_chapter || 0)}</dd>
          <dt>队列任务</dt><dd>${escapeHtml(label(jobTypeLabel, row.job_type, '已创建创作母本生成任务'))} / ${escapeHtml(label(jobStatusLabel, row.job_status, '待处理'))}</dd>
          <dt>项目编号</dt><dd translate="no">${escapeHtml(projectId || '未返回')}</dd>
        </dl>
      </div>
      <div class="actions">
        ${generationForm(projectId, row.job_type)}
        <a class="button primary" href="${escapeHtml(detailHref)}">查看项目控制台</a>
        <a class="button" href="${escapeHtml(queueHref)}">查看队列</a>
        <a class="button" href="/webhook/novel-project-list">查看项目列表</a>
        <a class="button" href="/webhook/novel-center">返回工作台</a>
        <a class="button" href="/webhook/novel-project-new">继续创建</a>
      </div>
      <div class="mode-note">“启动创作母本生成”会先领取任务并返回后台执行页；模型结果稍后可在项目控制台或队列状态中查看。其他查看入口只读，不会推进队列。</div>
    </section>
  </main>
  <script>
    (() => {
      document.querySelectorAll('form[data-confirm]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          const message = form.dataset.confirm || '确认执行？';
          if (!window.confirm(message)) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          const button = event.submitter || form.querySelector('button[type="submit"]');
          const originalText = button?.textContent || '提交';
          if (button) {
            button.disabled = true;
            button.textContent = '正在启动后台任务...';
          }
          const toast = document.createElement('div');
          toast.className = 'action-toast';
          toast.setAttribute('role', 'status');
          toast.setAttribute('aria-live', 'polite');
          const strong = document.createElement('strong');
          const span = document.createElement('span');
          toast.append(strong, span);
          document.body.appendChild(toast);
          try {
            const body = new FormData(form);
            const response = await fetch(form.action, {
              method: 'POST',
              body,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            if (!response.ok) throw new Error('启动失败：HTTP ' + response.status);
            strong.textContent = '后台任务已启动';
            span.textContent = '正在进入项目控制台...';
            window.setTimeout(() => {
              window.location.href = '${escapeHtml(detailHref)}';
            }, 450);
          } catch (error) {
            toast.classList.add('is-error');
            strong.textContent = '启动未完成';
            span.textContent = error.message || '请稍后重试。';
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });
    })();
  </script>
</body>
</html>`;

return [{json: {...row, response_html: html, response_status_code: row.response_status_code || (isSuccess ? 201 : 400)}}];
