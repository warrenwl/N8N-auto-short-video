// n8n Code node: Render Novel Project Create HTML
// This page only renders the form. Creation still happens via POST /webhook/novel-project-create.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSidebar(current) {
  const links = [
    ['工作台', '/webhook/novel-center'],
    ['项目列表', '/webhook/novel-project-list'],
    ['创建项目', '/webhook/novel-project-new'],
    ['审核中心', '/webhook/novel-review-list'],
    ['队列状态', '/webhook/novel-queue-status'],
    ['运行日报', '/webhook/novel-daily-report'],
  ];
  return `
    <aside class="app-sidebar" aria-label="后台导航">
      <div class="brand"><span>创作中台</span><strong>小说后台</strong></div>
      <nav class="side-nav" aria-label="小说工作流导航">${links.map(([text, href]) => (
        text === current
          ? `<span class="active">${escapeHtml(text)}</span>`
          : `<a href="${href}">${escapeHtml(text)}</a>`
      )).join('')}</nav>
      <a class="side-primary" href="/webhook/novel-project-new">新建项目</a>
    </aside>`;
}

function renderOptions(options, selectedValue) {
  return options.map((option) => {
    const value = Array.isArray(option) ? option[0] : option;
    const label = Array.isArray(option) ? option[1] : option;
    const selected = String(value) === String(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

const genreOptions = [
  '都市逆袭',
  '都市脑洞',
  '都市生活',
  '玄幻升级',
  '东方玄幻',
  '仙侠修真',
  '轻小说/异世界',
  '科幻末世',
  '悬疑灵异',
  '历史架空',
  '游戏竞技',
  '现代言情',
  '古代言情',
  '豪门甜宠',
  '种田经营',
  '现实题材',
];

const audienceOptions = [
  '中文网文读者',
  '男频爽文读者',
  '女频情感读者',
  '都市职场读者',
  '玄幻仙侠读者',
  '悬疑烧脑读者',
  '轻松下饭读者',
  '年轻快节奏读者',
  '长线追更读者',
  '短篇试读读者',
];

const styleOptions = [
  '节奏快、冲突强、章末留钩子',
  '爽点密集、打脸反转、情绪直接',
  '沉浸感强、画面细腻、情感递进',
  '轻松幽默、对白灵活、日常爽点',
  '悬疑紧张、伏笔清晰、反转克制',
  '热血燃向、升级明确、目标感强',
  '甜宠轻喜、互动密集、情绪稳定',
  '克制现实、细节扎实、人物可信',
];

const wordCountOptions = [
  ['1200', '短测 1200 字'],
  ['1500', '轻量 1500 字'],
  ['2000', '常规 2000 字'],
  ['2500', '平台常规 2500 字'],
  ['3000', '长章 3000 字'],
  ['4000', '深度长章 4000 字'],
  ['6000', '爆更长章 6000 字'],
  ['8000', '超长章 8000 字'],
];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>创建新小说项目</title>
  <meta name="theme-color" content="#f6f7f9" />
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --danger:#b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .app-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 16px; padding: 22px 16px; border-right: 1px solid var(--line); background: #fff; }
    .brand { display: grid; gap: 3px; padding: 0 4px 12px; border-bottom: 1px solid var(--line); }
    .brand span { color: var(--muted); font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    .brand strong { font-size: 20px; line-height: 1.2; }
    .side-nav { display: grid; gap: 4px; }
    .side-nav a, .side-nav span { min-height: 38px; display: flex; align-items: center; border-radius: 8px; padding: 0 10px; color: #344054; text-decoration: none; font-weight: 750; }
    .side-nav a:hover, .side-nav .active { color: var(--accent); background: var(--accent-soft); }
    .side-primary { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; margin-top: auto; background: var(--accent); color: #fff; text-decoration: none; font-weight: 800; }
    main { width: min(1240px, calc(100vw - 32px)); margin: 24px auto 48px; }
    .app-shell > main { width: auto; max-width: none; margin: 24px 16px 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .muted { color: var(--muted); margin: 6px 0 0; line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    nav a { white-space: nowrap; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .guide { padding: 16px; background: var(--accent-soft); border-color: #b9e3d4; }
    .guide p { margin: 0; color: #225447; line-height: 1.7; }
    form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; }
    label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
    .field-head { min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .field-head span { font-weight: 650; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px 11px; font: inherit; color: var(--ink); background: white; }
    select { min-height: 42px; appearance: auto; }
    textarea { min-height: 120px; resize: vertical; }
    .wide { grid-column: 1 / -1; }
    .actions { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    button[type="submit"] { border: 0; border-radius: 8px; min-height: 42px; padding: 0 18px; font: inherit; font-weight: 700; color: white; background: var(--accent); cursor: pointer; touch-action: manipulation; }
    .ai-assist { min-width: 76px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; touch-action: manipulation; white-space: nowrap; }
    .ai-assist:hover { border-color: var(--accent); background: #e2f3eb; }
    .ai-assist:disabled { opacity: .72; cursor: wait; }
    .ai-assist.is-loading { background: #fff; border-color: var(--accent); }
    .ai-feedback { grid-column: 1 / -1; min-height: 20px; margin: -4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .ai-feedback.is-error { color: var(--danger); }
    .ai-feedback.is-success { color: var(--accent); }
    .secondary { min-height: 42px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 14px; background: #fff; color: var(--ink); text-decoration: none; font-weight: 650; }
    button[type="submit"]:hover { background: #19664e; }
    .secondary:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 720px) {
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      header, form { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      label { margin-bottom: 12px; }
      .field-head { align-items: flex-start; }
      .actions { margin-top: 8px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('创建项目')}
  <main>
    <div class="page-context">
    <header>
      <div>
        <h1>创建新小说项目</h1>
        <p class="muted">这里只负责创建项目；创建后会写入队列，后续设定集、大纲、章节和审稿由工作流推进。</p>
      </div>
    </header>
    </div>

    <section class="guide" aria-label="创建说明">
      <h2>填写建议</h2>
      <p>标题和核心创意最重要。核心创意建议写清主角、目标、主要冲突和爽点，章节数可以先小一点，跑通后再扩大。</p>
    </section>

    <section>
      <form method="POST" action="/webhook/novel-project-create" autocomplete="off">
        <label>
          <span class="field-head"><span>小说标题</span><button class="ai-assist" type="button" data-ai-title>AI标题</button></span>
          <input name="title" required placeholder="例如：逆光回响…" autocomplete="off" />
        </label>
        <label>类型<select name="genre" required>${renderOptions(genreOptions, '都市逆袭')}</select></label>
        <label>目标读者<select name="audience">${renderOptions(audienceOptions, '中文网文读者')}</select></label>
        <label>文风<select name="style">${renderOptions(styleOptions, '节奏快、冲突强、章末留钩子')}</select></label>
        <label>章节数<input name="target_total_chapters" type="number" inputmode="numeric" min="1" max="500" value="20" autocomplete="off" /></label>
        <label>每章字数<select name="target_words_per_chapter">${renderOptions(wordCountOptions, '2000')}</select></label>
        <label class="wide">
          <span class="field-head"><span>核心创意</span><button class="ai-assist" type="button" data-ai-idea>AI创意</button></span>
          <textarea name="premise" required placeholder="例如：主角、目标、主要冲突和爽点…" autocomplete="off"></textarea>
        </label>
        <p class="ai-feedback" data-ai-feedback aria-live="polite"></p>
        <div class="actions">
          <button type="submit">提交创建</button>
          <a class="secondary" href="/webhook/novel-center">返回工作台</a>
          <a class="secondary" href="/webhook/novel-project-list">查看项目列表</a>
        </div>
      </form>
    </section>
  </main>
  </div>
  <script>
    (() => {
      const form = document.querySelector('form[action="/webhook/novel-project-create"]');
      if (!form) return;
      const titleInput = form.querySelector('[name="title"]');
      const premiseInput = form.querySelector('[name="premise"]');
      const genreSelect = form.querySelector('[name="genre"]');
      const audienceSelect = form.querySelector('[name="audience"]');
      const styleSelect = form.querySelector('[name="style"]');
      const titleButton = form.querySelector('[data-ai-title]');
      const ideaButton = form.querySelector('[data-ai-idea]');
      const feedback = form.querySelector('[data-ai-feedback]');
      const assistUrl = '/webhook/novel-project-ai-assist';

      function valueOf(node) {
        return String(node && node.value ? node.value : '').trim();
      }

      function markUserEdited(input) {
        if (!input) return;
        input.addEventListener('input', () => {
          if (input.dataset.settingAi === 'true') return;
          delete input.dataset.aiGenerated;
        });
      }

      markUserEdited(titleInput);
      markUserEdited(premiseInput);

      function setValue(input, value, options = {}) {
        if (!input || !value) return;
        if (options.aiGenerated) input.dataset.settingAi = 'true';
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        if (options.aiGenerated) {
          input.dataset.aiGenerated = 'true';
          delete input.dataset.settingAi;
        } else {
          delete input.dataset.aiGenerated;
        }
        input.focus();
      }

      function setFeedback(message, state) {
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.classList.toggle('is-error', state === 'error');
        feedback.classList.toggle('is-success', state === 'success');
      }

      function setBusy(button, busy) {
        for (const item of [titleButton, ideaButton]) {
          if (!item) continue;
          item.disabled = busy;
        }
        if (!button) return;
        if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
        button.classList.toggle('is-loading', busy);
        button.textContent = busy ? '生成中' : button.dataset.idleText;
      }

      function payloadFor(assistType) {
        const wordCountSelect = form.querySelector('[name="target_words_per_chapter"]');
        const chapterInput = form.querySelector('[name="target_total_chapters"]');
        const titleIsAi = titleInput && titleInput.dataset.aiGenerated === 'true';
        const premiseIsAi = premiseInput && premiseInput.dataset.aiGenerated === 'true';
        const titleValue = valueOf(titleInput);
        const premiseValue = valueOf(premiseInput);
        return {
          assist_type: assistType,
          assist_nonce: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
          title: assistType === 'title' && titleIsAi ? '' : titleValue,
          premise: assistType === 'idea' && premiseIsAi ? '' : premiseValue,
          previous_ai_title: titleIsAi ? titleValue : '',
          previous_ai_premise: premiseIsAi ? premiseValue : '',
          title_is_ai_generated: titleIsAi ? 'true' : 'false',
          premise_is_ai_generated: premiseIsAi ? 'true' : 'false',
          genre: valueOf(genreSelect),
          audience: valueOf(audienceSelect),
          style: valueOf(styleSelect),
          target_total_chapters: valueOf(chapterInput),
          target_words_per_chapter: valueOf(wordCountSelect),
        };
      }

      async function requestAssist(assistType, button) {
        setBusy(button, true);
        setFeedback('正在请求 GLM...', '');
        try {
          const response = await fetch(assistUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payloadFor(assistType)),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            throw new Error(data.message || 'GLM 生成失败');
          }
          if (data.title && (assistType === 'title' || !valueOf(titleInput))) {
            setValue(titleInput, data.title, {aiGenerated: true});
          }
          if (data.premise && (assistType === 'idea' || !valueOf(premiseInput))) {
            setValue(premiseInput, data.premise, {aiGenerated: true});
          }
          setFeedback(data.message || 'GLM 已生成', 'success');
        } catch (error) {
          setFeedback(error && error.message ? error.message : 'GLM 生成失败，请稍后重试。', 'error');
        } finally {
          setBusy(button, false);
        }
      }

      if (ideaButton) {
        ideaButton.addEventListener('click', () => {
          requestAssist('idea', ideaButton);
        });
      }

      if (titleButton) {
        titleButton.addEventListener('click', () => {
          requestAssist('title', titleButton);
        });
      }
    })();
  </script>
</body>
</html>`;

return [{json: {response_html: html}}];
