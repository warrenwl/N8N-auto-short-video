// n8n Code node: Render Novel Review HTML
// Input rows should be NEED_REVIEW novel_chapters joined with project, latest review report,
// and lightweight observability fields.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripChapterTitlePrefix(value, fallback = '') {
  const raw = String(value ?? '').trim();
  const fallbackText = String(fallback ?? '').trim();
  if (!raw) return fallbackText;
  const cleaned = raw
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim();
  return cleaned || fallbackText || raw;
}

function reviewChapterTitle(row) {
  return stripChapterTitlePrefix(row.chapter_title || row.title, row.chapter_no ? `第 ${row.chapter_no} 章` : '审核详情');
}

function parseJsonMaybe(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function formatLocalTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDuration(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return '未记录';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)} 秒`;
  return `${durationMs} 毫秒`;
}

const jobTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  REVISE_CHAPTER_BLOCK: '局部修订',
  NOTIFY_REVIEW: '发送审核提醒',
};

const statusLabel = {
  SUCCESS: '成功',
  SUCCEEDED: '已成功',
  SENT: '已发送',
  PENDING: '待处理',
  RUNNING: '运行中',
  FAILED: '已失败',
  CANCELLED: '已取消',
  ACTIVE: '已激活',
  INACTIVE: '已失效',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  NEED_REVIEW: '待人工审核',
  DRAFT_READY: '候选稿已生成',
  AI_REVIEWED: '智能审稿完成',
  REWRITE_REQUESTED: '已要求重写',
  SUPERSEDED: '已被新版本替代',
  REJECTED: '已拒绝',
  SUGGESTED: '待确认建议',
  APPLIED: '已应用',
  PASS: '可通过',
  MANUAL_REVIEW: '需人工判断',
  REWRITE: '建议重写',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
  SKIPPED_DISABLED: '已跳过提醒',
  SKIPPED_NO_SENDKEY: '未配置提醒',
  SENT_OR_UNKNOWN: '发送结果待确认',
};

const humanActionLabel = {
  APPROVE: '通过',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
  PAUSE_PROJECT: '暂停项目',
  MANUAL_EDIT: '人工改稿',
};

const blockActionLabel = {
  modify: '定向修改',
  expand: '扩写',
  condense: '压缩',
  polish: '润色',
  continue: '续写',
  logic_fix: '逻辑修补',
  custom: '自定义',
};

const rangeLockLabel = {
  selection_only: '只改选区',
  adjacent_one: '允许前后一小句',
  flag_later: '可标记影响后文',
};

const issueTypeLabel = {
  rhythm: '节奏',
  plot: '剧情',
  consistency: '连续性',
  readability: '可读性',
  commercial: '商业性',
  style: '文风',
  '跨章断链': '跨章断链',
};

const transitionModeLabel = {
  direct_continuation: '直接承接',
  natural_scene_cut: '自然转场',
  pov_shift: '视角转换',
  time_skip: '时间跳转',
  summary_bridge: '概述过桥',
};

const errorMessageLabel = {
  'SERVERCHAN_SENDKEY is not configured': '提醒密钥未配置',
  'Phase7 cancelled superseded candidate review': '候选稿已被新版本替代，旧审稿任务已取消',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function localizeError(value) {
  if (!value) return '';
  const text = String(value);
  if (errorMessageLabel[text]) return errorMessageLabel[text];
  if (/[A-Za-z_]/.test(text)) return '原始错误已记录，请查看任务日志';
  return text;
}

function scoreClass(score) {
  const value = Number(score || 0);
  if (value >= 85) return 'good';
  if (value >= 70) return 'warn';
  return 'bad';
}

function hasAiReview(row) {
  return Boolean(row.review_created_at || row.ai_run_id || Number(row.total_score || 0) > 0);
}

function scoreText(row) {
  return hasAiReview(row) ? String(Number(row.total_score || 0) || '-') : '-';
}

function scoreTone(row) {
  return hasAiReview(row) ? scoreClass(row.total_score) : 'muted';
}

function statusClass(status) {
  const value = String(status || '').toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'SENT', 'ACTIVE', 'APPROVED', 'PASS', 'SKIPPED_DISABLED', 'SKIPPED_NO_SENDKEY'].includes(value)) return 'good';
  if (['APPLIED'].includes(value)) return 'good';
  if (['PENDING', 'RUNNING', 'SUGGESTED', 'MANUAL_REVIEW', 'REWRITE', 'REQUEST_REWRITE', 'NEED_REVIEW', 'AI_REVIEWED', 'DRAFT_READY'].includes(value)) return 'warn';
  if (['FAILED', 'REJECTED', 'REJECT', 'SENT_OR_UNKNOWN'].includes(value)) return 'bad';
  return 'muted';
}

function badge(value, fallback = '未知状态') {
  const raw = value || '';
  return `<span class="badge ${statusClass(raw)}">${escapeHtml(label(statusLabel, raw, fallback))}</span>`;
}

function listItems(items) {
  const array = parseJsonMaybe(items, []);
  if (!array.length) return '<li>无</li>';
  return array.map((item) => {
    if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
    const type = label(issueTypeLabel, item.type, item.type || item.severity || '问题');
    return `<li>${escapeHtml(type)}：${escapeHtml(item.description || item.value || JSON.stringify(item))}</li>`;
  }).join('');
}

function itemCount(items) {
  return parseJsonMaybe(items, []).length;
}

function shortItem(items, fallback) {
  const array = parseJsonMaybe(items, []);
  if (!array.length) return fallback;
  const item = array[0];
  if (typeof item === 'string') return item;
  const type = label(issueTypeLabel, item.type, item.type || item.severity || '要点');
  return `${type}：${item.description || item.value || JSON.stringify(item)}`;
}

function transitionReview(row) {
  const review = parseJsonMaybe(row.cross_chapter_transition_review, null);
  if (!review || typeof review !== 'object') return null;
  const mode = label(transitionModeLabel, review.mode, review.mode || '未说明');
  const allowed = review.allowed === true || review.allowed === 'true';
  const shouldBlock = review.should_block === true || review.should_block === 'true';
  const state = shouldBlock ? '应阻断' : allowed ? '可接受' : '需复核';
  const evidence = review.evidence || review.reason || '';
  const risk = review.risk || '';
  const fix = review.fix || '';
  return {mode, state, evidence, risk, fix, shouldBlock, allowed};
}

function humanReviewItems(value) {
  const records = parseJsonMaybe(value, []);
  if (!records.length) return '<li>暂无人工记录</li>';
  return records.slice(0, 5).map((record) => {
    const action = escapeHtml(label(humanActionLabel, record.action, '人工操作'));
    const reviewer = escapeHtml(record.reviewer || '本地用户');
    const createdAt = escapeHtml(formatLocalTime(record.created_at));
    const comment = record.comment ? `<p>${escapeHtml(record.comment)}</p>` : '';
    return `<li><strong>${action}</strong><span>${reviewer} / ${createdAt}</span>${comment}</li>`;
  }).join('');
}

function blockRevisionItems(value) {
  const records = parseJsonMaybe(value, []);
  return Array.isArray(records) ? records : [];
}

function splitChapterParagraphs(value) {
  return chapterParagraphs(value).map((paragraph) => paragraph.text);
}

function chapterParagraphs(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = [];
  const matcher = /[^\n]+/g;
  let match = matcher.exec(text);
  while (match) {
    const raw = match[0];
    const leadingTrim = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) {
      const start = match.index + leadingTrim;
      paragraphs.push({
        text: trimmed,
        start,
        end: start + trimmed.length,
      });
    }
    match = matcher.exec(text);
  }
  return paragraphs;
}

function blockRevisionChecklist(value) {
  const items = parseJsonMaybe(value, []);
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <ul class="block-checklist">
      ${items.map((item) => {
        if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
        const requirement = item.requirement || item.item || item.instruction || item.text || '要求';
        const fulfilled = item.fulfilled === false ? '未确认' : '已落实';
        const evidence = item.evidence || item.note || item.reason || '';
        return `<li><strong>${escapeHtml(fulfilled)}</strong>${escapeHtml(requirement)}${evidence ? `<span>${escapeHtml(evidence)}</span>` : ''}</li>`;
      }).join('')}
    </ul>`;
}

function blockTextDiff(original, replacement) {
  const before = String(original || '');
  const after = String(replacement || '');
  if (!before || !after) return '';
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  const prefix = before.slice(0, start);
  const removed = before.slice(start, endBefore);
  const added = after.slice(start, endAfter);
  const suffix = before.slice(endBefore);
  if (!removed && !added) return '<p class="muted">建议文本与选中原文一致。</p>';
  return `
    <div class="block-diff" aria-label="局部修订对比">
      <strong>修改对比</strong>
      <p>
        ${prefix ? `<span>${escapeHtml(prefix)}</span>` : ''}
        ${removed ? `<del>${escapeHtml(removed)}</del>` : ''}
        ${added ? `<ins>${escapeHtml(added)}</ins>` : ''}
        ${suffix ? `<span>${escapeHtml(suffix)}</span>` : ''}
      </p>
    </div>`;
}

function paragraphReader(row, id) {
  const paragraphs = chapterParagraphs(row.body || '');
  if (!paragraphs.length) return '<div class="reader-body paragraph-reader"><p class="empty-paragraph">正文为空</p></div>';
  return `
	    <div
	      class="reader-body paragraph-reader"
	      data-block-reader
	      data-workbench-id="${escapeHtml(id)}"
	      data-chapter-id="${escapeHtml(row.chapter_id || row.id || '')}"
	      data-review-token="${escapeHtml(row.review_token || '')}"
	    >
	      <textarea data-chapter-body hidden readonly>${escapeHtml(row.body || '')}</textarea>
	      ${paragraphs.map((paragraph, index) => {
        const paragraphNo = index + 1;
        return `
          <section
            id="review-paragraph-${paragraphNo}"
            class="reader-paragraph"
            data-paragraph-no="${paragraphNo}"
            data-body-start="${escapeHtml(paragraph.start)}"
            data-body-end="${escapeHtml(paragraph.end)}"
          >
            <span class="paragraph-label" aria-hidden="true">P${paragraphNo}</span>
            <p data-paragraph-text>${escapeHtml(paragraph.text)}</p>
            <button
              class="paragraph-revise-button"
              type="button"
              data-revise-paragraph
              data-action-type="modify"
              aria-label="对 P${paragraphNo} 发起局部修订"
            >局部修订</button>
          </section>`;
      }).join('')}
	    </div>
	    <div class="selection-toolbar" data-selection-toolbar hidden>
	      <span class="selection-summary" data-selection-summary>已选片段</span>
	      <button type="button" data-selection-assistant>问助手</button>
	      <button type="button" data-selection-action="modify">局部修订</button>
	      <button type="button" data-selection-manual-edit>人工改稿</button>
    </div>`;
}

function blockRevisionCard(revision, row) {
  const status = String(revision.status || '').toUpperCase();
  const isSuggested = status === 'SUGGESTED';
  const isLive = status === 'PENDING' || status === 'RUNNING';
  const canRegenerate = ['SUGGESTED', 'FAILED', 'REJECTED'].includes(status);
  const revisionId = escapeHtml(revision.id || '');
  const reviewToken = escapeHtml(row.review_token || '');
  const action = escapeHtml(label(blockActionLabel, revision.action_type, revision.action_type || '局部修订'));
  const range = escapeHtml(label(rangeLockLabel, revision.range_lock, revision.range_lock || '只改选区'));
  const selectedText = revision.selected_text || '';
  const replacementText = revision.replacement_text || '';
  const summary = revision.change_summary || '';
  const error = localizeError(revision.error_message);
  const riskAssistantButton = `
    <button
      type="button"
      data-block-risk-assistant
      data-selected-text="${escapeHtml(selectedText)}"
      data-instruction="${escapeHtml(revision.instruction || '')}"
      data-paragraph-start="${escapeHtml(revision.paragraph_start || '')}"
      data-paragraph-end="${escapeHtml(revision.paragraph_end || revision.paragraph_start || '')}"
      data-selection-start="${escapeHtml(revision.selection_start_offset ?? '')}"
      data-selection-end="${escapeHtml(revision.selection_end_offset ?? '')}"
      data-anchor-prefix="${escapeHtml(revision.anchor_prefix || '')}"
      data-anchor-suffix="${escapeHtml(revision.anchor_suffix || '')}"
    >问助手检查影响</button>`;
  const affectedWarning = revision.affects_later_text === true || revision.affects_later_text === 'true'
    ? `<div class="block-risk"><span>这条建议可能影响后文连续性，建议本章全部局部修改完成后再重新审稿。</span>${riskAssistantButton}</div>`
    : '';
  const liveNote = isLive
    ? '<div class="block-live" data-block-live><strong>建议生成中</strong><span data-block-refresh-countdown>页面会自动刷新建议状态。</span></div>'
    : '';
  const form = (isSuggested || canRegenerate) ? `
    <form class="block-apply-form" method="POST" action="/webhook/novel-review-block-apply" data-block-revision-apply>
      <input type="hidden" name="revision_id" value="${revisionId}" />
      <input type="hidden" name="review_token" value="${reviewToken}" />
      <input type="hidden" name="reviewer" value="local_user" />
      ${isSuggested ? `
        ${blockTextDiff(selectedText, replacementText)}
        <label>
          <span>建议文本</span>
          <textarea name="replacement_text" rows="5" readonly data-block-replacement data-original-replacement="${escapeHtml(replacementText)}">${escapeHtml(replacementText)}</textarea>
        </label>
        <div class="block-step-label block-confirm-step"><span>4</span><strong>确认应用</strong></div>
        <div class="block-apply-primary">
          <button type="submit" name="action" value="apply" data-apply-original>应用建议</button>
        </div>` : `
        <div class="block-apply-primary">
          <button class="secondary" type="submit" name="action" value="regenerate">重新生成</button>
        </div>`}
      <details class="block-secondary-actions">
        <summary>更多处理</summary>
        <div class="block-apply-row">
          ${isSuggested ? `
            <button class="secondary" type="button" data-enable-block-edit>修改后应用</button>
            <button class="secondary" type="submit" name="action" value="apply_edited" data-apply-edited hidden>确认应用修改</button>
            <button class="secondary" type="button" data-reset-block-edit hidden>还原 AI 建议</button>
            <button class="secondary" type="submit" name="action" value="regenerate">重新生成</button>
            <button class="danger-secondary" type="submit" name="action" value="reject">放弃</button>
            <button class="warn-button" type="submit" name="action" value="request_rewrite">转为整章重写意见</button>
          ` : `
            <button class="danger-secondary" type="submit" name="action" value="reject">放弃</button>
          `}
        </div>
      </details>
    </form>` : '';

  return `
    <article class="block-revision-card ${escapeHtml(statusClass(status))}" data-block-status="${escapeHtml(status)}">
      <div class="block-card-head">
        <strong>${action}</strong>
        ${badge(status, '未知状态')}
      </div>
      <p class="block-meta">${range} / ${escapeHtml(formatLocalTime(revision.created_at))}</p>
      <dl class="block-revision-dl">
        <dt>选中原文</dt><dd>${escapeHtml(selectedText || '-')}</dd>
        <dt>人工要求</dt><dd>${escapeHtml(revision.instruction || '-')}</dd>
        ${summary ? `<dt>修改摘要</dt><dd>${escapeHtml(summary)}</dd>` : ''}
      </dl>
      ${replacementText && !isSuggested ? `<div class="block-replacement"><strong>建议文本</strong><p>${escapeHtml(replacementText)}</p></div>` : ''}
      ${affectedWarning}
      ${liveNote}
      ${blockRevisionChecklist(revision.instruction_checklist)}
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      ${form}
    </article>`;
}

function blockRevisionGroupKey(revision) {
  const status = String(revision.status || '').toUpperCase();
  if (status === 'PENDING' || status === 'RUNNING') return 'running';
  if (status === 'SUGGESTED' || status === 'FAILED') return 'todo';
  return 'history';
}

function blockRevisionGroupedList(revisions, row) {
  if (!revisions.length) return '<p class="muted">暂无局部修订记录</p>';
  const groups = [
    {key: 'todo', title: '待确认', empty: '暂无待确认建议', open: true},
    {key: 'running', title: '生成中', empty: '暂无生成中任务', open: true},
    {key: 'history', title: '已处理', empty: '暂无历史记录', open: false},
  ].map((group) => ({
    ...group,
    items: revisions.filter((revision) => blockRevisionGroupKey(revision) === group.key),
  })).filter((group) => group.items.length || group.key !== 'history');

  return groups.map((group) => `
    <details class="block-revision-group" data-block-revision-group="${escapeHtml(group.key)}" ${group.open ? 'open' : ''}>
      <summary>
        <strong>${escapeHtml(group.title)}</strong>
        <span>${escapeHtml(group.items.length)}</span>
      </summary>
      <div class="block-revision-group-body">
        ${group.items.length
          ? group.items.map((revision) => blockRevisionCard(revision, row)).join('')
          : `<p class="muted">${escapeHtml(group.empty)}</p>`}
      </div>
    </details>`).join('');
}

function blockRevisionPanel(row, id) {
  const revisions = blockRevisionItems(row.block_revisions);
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const panelId = `block-revision-panel-${id}`;
  const activeRevisionCount = revisions.filter((revision) => ['PENDING', 'RUNNING', 'SUGGESTED', 'FAILED'].includes(String(revision.status || '').toUpperCase())).length;
  const panelStateClass = activeRevisionCount ? ' is-open has-active-revisions' : '';
  return `
    <section
      class="block-revision-panel${panelStateClass}"
      id="${escapeHtml(panelId)}"
      data-block-revision-panel
      data-workbench-id="${escapeHtml(id)}"
      aria-label="局部修订工作台"
    >
      <div class="block-panel-head" data-block-panel-toggle role="button" tabindex="0" aria-expanded="${activeRevisionCount ? 'true' : 'false'}">
        <div>
          <p class="ops-kicker">局部修订工作台</p>
          <strong>选区建议</strong>
        </div>
        <div class="block-panel-head-actions">
          <span data-block-panel-state>${activeRevisionCount ? `待处理 ${activeRevisionCount}` : '未选择'}</span>
          <button class="block-panel-close" type="button" data-close-block-panel aria-label="收起局部修订工作台">收起</button>
        </div>
      </div>
      <div class="block-panel-body">
        <div class="block-flow-steps" aria-label="局部修订流程">
          <span><strong>1</strong> 选区</span>
          <span><strong>2</strong> 要求</span>
          <span><strong>3</strong> 建议</span>
          <span><strong>4</strong> 确认</span>
        </div>
        <form class="block-revision-form" method="POST" action="/webhook/novel-review-block-revise" data-block-revision-form>
          <input type="hidden" name="chapter_id" value="${chapterId}" />
          <input type="hidden" name="review_token" value="${token}" />
          <input type="hidden" name="reviewer" value="local_user" />
          <input type="hidden" name="selected_text" data-block-selected-text />
          <input type="hidden" name="paragraph_start" data-block-paragraph-start />
          <input type="hidden" name="paragraph_end" data-block-paragraph-end />
          <input type="hidden" name="selection_start_offset" data-block-selection-start />
          <input type="hidden" name="selection_end_offset" data-block-selection-end />
          <input type="hidden" name="anchor_prefix" data-block-anchor-prefix />
          <input type="hidden" name="anchor_suffix" data-block-anchor-suffix />
          <input type="hidden" name="before_context" data-block-before-context />
          <input type="hidden" name="after_context" data-block-after-context />
          <div class="block-step-label"><span>1</span><strong>选中原文</strong></div>
          <div class="selected-preview" data-block-selected-preview>未选择片段</div>
          <div class="block-step-label"><span>2</span><strong>修改要求</strong></div>
          <div class="block-form-grid">
            <label>
              <span>处理方式</span>
              <select name="action_type" data-block-action-select>
                ${Object.entries(blockActionLabel).map(([value, labelText]) => `<option value="${escapeHtml(value)}">${escapeHtml(labelText)}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>范围锁</span>
              <select name="range_lock">
                ${Object.entries(rangeLockLabel).map(([value, labelText]) => `<option value="${escapeHtml(value)}">${escapeHtml(labelText)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label>
            <span>人工要求</span>
            <textarea name="instruction" rows="3" placeholder="写清楚你希望这一块怎么改。"></textarea>
          </label>
          <p class="form-hint" data-block-revision-feedback aria-live="polite">提交后只生成局部建议，确认应用时才会生成新候选稿。</p>
          <div class="block-form-actions">
            <button type="submit">生成局部建议</button>
            <button class="secondary" type="button" data-polish-block-instruction>让助手整理要求</button>
          </div>
        </form>
        <div class="block-revision-results">
          <div class="block-step-label"><span>3</span><strong>AI 建议</strong></div>
          <p class="form-hint">在建议卡片中查看 diff；只有点“应用建议”才会生成新的候选稿。</p>
          <div class="block-revision-list" data-block-revision-list>
            ${blockRevisionGroupedList(revisions, row)}
          </div>
        </div>
      </div>
    </section>`;
}

function recommendation(row) {
  if (!hasAiReview(row)) return '待智能审稿';
  const verdict = String(row.verdict || 'MANUAL_REVIEW').toUpperCase();
  const score = Number(row.total_score || 0);
  if (verdict === 'PASS' && score >= 85) return '建议通过';
  if (verdict === 'REJECT' || score < 55) return '建议拒绝';
  if (verdict === 'REWRITE' || verdict === 'REQUEST_REWRITE' || score < 70) return '建议要求重写';
  return '建议人工复核';
}

function recommendationClass(row) {
  const text = recommendation(row);
  if (text.includes('通过')) return 'approve';
  if (text.includes('重写')) return 'rewrite';
  if (text.includes('拒绝')) return 'reject';
  return 'review';
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

function breadcrumb(items) {
  return `<nav class="breadcrumbs" aria-label="面包屑">${items.map((item, index) => {
    const labelText = escapeHtml(item.label);
    const node = item.href
      ? `<a href="${escapeHtml(item.href)}">${labelText}</a>`
      : `<span>${labelText}</span>`;
    return `${index > 0 ? '<span class="crumb-separator">/</span>' : ''}${node}`;
  }).join('')}</nav>`;
}

function projectDetailHref(row, view = 'overview', hash = '') {
  const projectId = row.project_id || row.novel_project_id || '';
  if (!projectId) return '/webhook/novel-project-list';
  const viewParam = view && view !== 'overview' ? `&view=${encodeURIComponent(view)}` : '';
  return `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}${viewParam}${hash || ''}`;
}

function reviewDetailBreadcrumb(row) {
  const items = [
    {label: '工作台', href: '/webhook/novel-center'},
    {label: '审核中心', href: '/webhook/novel-review-list'},
  ];
  const projectId = row.project_id || row.novel_project_id || '';
  const projectTitle = row.project_title || row.novel_title || row.project_name || '';
  if (projectTitle) {
    items.push(projectId
      ? {label: projectTitle, href: projectDetailHref(row)}
      : {label: projectTitle});
  }
  const chapterLabel = row.chapter_no ? `第 ${row.chapter_no} 章审核` : '审核详情';
  items.push({label: chapterLabel});
  return breadcrumb(items);
}

function projectQueueHref(row) {
  const projectId = row.project_id || row.novel_project_id || '';
  return projectId
    ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`
    : '/webhook/novel-queue-status';
}

function chapterDetailHref(row) {
  const chapterNo = row.chapter_no || '';
  const hash = chapterNo ? `#chapter-${encodeURIComponent(chapterNo)}` : '#written-section';
  return projectDetailHref(row, 'chapters', hash);
}

function reviewSummary(row) {
  const score = Number(row.total_score || 0);
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  return `
    <section class="review-summary" aria-label="审核结论摘要">
      <h3>审核结论摘要</h3>
      <div class="decision-banner ${escapeHtml(recClass)}">
        <strong>${escapeHtml(rec)}</strong>
        <span>${escapeHtml(recClass === 'approve' ? 'AI 评分与结论支持通过，但仍建议快速扫读正文。' : recClass === 'rewrite' ? '建议把修改意见写清楚，方便后续重写任务继承。' : recClass === 'reject' ? '拒绝会停止该候选稿成为正式版本，请确认原因明确。' : '当前结果需要人工判断，先阅读正文和运行依据。')}</span>
      </div>
      <dl>
        <dt>总评分</dt><dd><strong>${escapeHtml(score || '-')}</strong></dd>
        <dt>智能建议</dt><dd>${badge(row.verdict || 'MANUAL_REVIEW', '需人工判断')}</dd>
        <dt>当前状态</dt><dd>${badge(row.status || 'NEED_REVIEW', '待人工审核')}</dd>
        <dt>推荐人工动作</dt><dd><strong>${escapeHtml(rec)}</strong></dd>
      </dl>
    </section>`;
}

function reviewEvidence(row) {
  const aiSuccess = row.ai_run_success;
  const aiStatus = aiSuccess === true ? '成功' : aiSuccess === false ? '失败' : '未记录';
  const transition = transitionReview(row);
  return `
    <section class="review-evidence" aria-label="审核依据">
      <h3>审核依据</h3>
      <dl>
        <dt>模型调用</dt><dd>${escapeHtml(row.ai_run_model || '未记录')} / ${escapeHtml(formatDuration(row.ai_run_duration_ms))} / ${escapeHtml(aiStatus)}</dd>
        <dt>任务状态</dt><dd>${escapeHtml(label(jobTypeLabel, row.latest_job_type, '未记录'))} / ${escapeHtml(label(statusLabel, row.latest_job_status, '未记录'))}</dd>
        <dt>连续性事实</dt><dd>候选 ${escapeHtml(row.pending_fact_count ?? 0)} / 已激活 ${escapeHtml(row.active_fact_count ?? 0)} / 已失效 ${escapeHtml(row.inactive_fact_count ?? 0)}</dd>
        <dt>跨章承接</dt><dd>${transition ? `${escapeHtml(transition.mode)} / ${escapeHtml(transition.state)}` : '未记录'}</dd>
      </dl>
    </section>`;
}

function reviewScoreBrief(row) {
  const hasReview = hasAiReview(row);
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  return `
    <div class="review-brief" aria-label="审核快速判断">
      <span class="recommendation-pill ${escapeHtml(recClass)}">${escapeHtml(rec)}</span>
      <span>${hasReview ? `智能评分 ${escapeHtml(scoreText(row))}` : '智能审稿 待触发'}</span>
      <span>问题 ${escapeHtml(hasReview ? itemCount(row.issues) : '-')}</span>
      <span>建议 ${escapeHtml(hasReview ? itemCount(row.suggestions) : '-')}</span>
      <span>候选事实 ${escapeHtml(row.pending_fact_count ?? 0)}</span>
    </div>`;
}

function aiReviewDrawer(row, drawerId, opsId) {
  const hasReview = hasAiReview(row);
  const transition = transitionReview(row);
  return `
    <dialog class="side-drawer" id="${escapeHtml(drawerId)}" aria-label="智能审稿抽屉">
      <div class="drawer-shell">
        <header class="drawer-header">
          <div>
            <p class="ops-kicker">智能审稿</p>
            <h2>辅助判断</h2>
            <p>这里是模型意见和运行依据；最终决策仍以人工阅读正文为准。</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog aria-label="关闭智能审稿">×</button>
        </header>
        <section class="drawer-section ai-score-card">
          <div class="score ${escapeHtml(scoreTone(row))}">${escapeHtml(scoreText(row))}</div>
          ${hasReview ? reviewSummary(row) : '<p class="muted">这一稿是局部修订后的候选版本，暂未重新智能审稿。你可以继续局部修改，完成后从右侧提交重新审稿。</p>'}
        </section>
        <section class="drawer-section">
          <h3>问题</h3>
          <ul>${listItems(row.issues)}</ul>
        </section>
        <section class="drawer-section">
          <h3>建议</h3>
          <ul>${listItems(row.suggestions)}</ul>
        </section>
        ${transition ? `
        <section class="drawer-section">
          <h3>跨章承接分析</h3>
          <dl class="transition-review">
            <dt>转场类型</dt><dd>${escapeHtml(transition.mode)}</dd>
            <dt>判断</dt><dd>${escapeHtml(transition.state)}</dd>
            <dt>依据</dt><dd>${escapeHtml(transition.evidence || '未说明')}</dd>
            <dt>风险</dt><dd>${escapeHtml(transition.risk || '未发现明显风险')}</dd>
            <dt>修法</dt><dd>${escapeHtml(transition.fix || '无需额外修法')}</dd>
          </dl>
        </section>` : ''}
        ${reviewEvidence(row)}
        ${observabilityBlock(row, opsId)}
      </div>
    </dialog>`;
}

function manualReviewEditDrawer(row, drawerId) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const title = escapeHtml(reviewChapterTitle(row));
  const summary = escapeHtml(row.summary || '');
  const body = escapeHtml(row.body || '');
  return `
    <dialog class="side-drawer manual-edit-drawer" id="${escapeHtml(drawerId)}" aria-label="人工改稿抽屉">
      <div class="drawer-shell">
        <header class="drawer-header">
          <div>
            <p class="ops-kicker">人工改稿</p>
            <h2>修改待审正文</h2>
            <p>适合修少量错字、补换行、调整节奏。保存后用 POST 写入，不会进入结果二级页。</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog aria-label="关闭人工改稿">×</button>
        </header>
        <form class="manual-edit-form" method="POST" action="/webhook/novel-review-manual-edit" data-review-manual-edit>
          <input type="hidden" name="chapter_id" value="${chapterId}" />
          <input type="hidden" name="review_token" value="${token}" />
          <input type="hidden" name="reviewer" value="local_user" />
          <label>
            <span>章节标题</span>
            <input name="title" value="${title}" />
          </label>
          <label>
            <span>章节摘要</span>
            <textarea name="summary" rows="3">${summary}</textarea>
          </label>
          <label class="body-field">
            <span>正文</span>
            <textarea name="body" rows="18">${body}</textarea>
          </label>
          <label>
            <span>改稿说明</span>
            <textarea name="comment" rows="3" placeholder="例如：拆分对话段落，补足情绪转折，修正错别字。"></textarea>
          </label>
          <p class="form-hint" data-manual-edit-feedback>保存继续修改会留在当前章节，不会自动审稿；保存并重新审稿会进入智能审稿队列。</p>
          <div class="manual-button-row">
            <button type="submit" name="decision" value="save_only">保存继续修改</button>
            <button class="secondary" type="submit" name="decision" value="resubmit">保存并重新审稿</button>
            <button class="secondary" type="submit" name="decision" value="approve">改稿并直接通过</button>
          </div>
        </form>
      </div>
    </dialog>`;
}

function reviewDecisionDrawer(row, drawerId) {
  const rec = recommendation(row);
  return `
    <dialog class="side-drawer review-decision-drawer" id="${escapeHtml(drawerId)}" data-review-decision-drawer aria-label="人工审核抽屉">
      <div class="drawer-shell">
        <header class="drawer-header">
          <div>
            <p class="ops-kicker">人工审核</p>
            <h2>${escapeHtml(rec)}</h2>
            <p>${hasAiReview(row) ? '阅读正文后提交最终判断；通过、重写和拒绝都需要人工确认。' : '这一稿暂未重新智能审稿；可以继续改稿，也可以重新审稿后再判断。'}</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog aria-label="关闭人工审核">×</button>
        </header>
        <section class="drawer-section decision-drawer-section">
          ${actionForm(row, 'drawer-actions')}
        </section>
      </div>
    </dialog>`;
}

function reviewAssistantPanel(row, id) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const panelId = `review-assistant-${id}`;
  const modes = [
    ['continuity', '连续性'],
    ['selection_advice', '选区建议'],
    ['design_reference', '参考设计'],
  ];
  const quickPrompts = [
    ['continuity', '这段剧情的因果链、人物动机和前后章连续性有没有问题？'],
    ['selection_advice', '请针对当前选区给我局部修改建议，不要重写整章。'],
    ['design_reference', '基于正文、大纲和导演台，给我三个可执行的桥段或伏笔设计。'],
  ];
  return `
    <aside class="review-assistant-panel" id="${escapeHtml(panelId)}" data-review-assistant-panel data-workbench-id="${escapeHtml(id)}" aria-label="剧情助手">
      <div class="assistant-head">
        <p class="ops-kicker">剧情助手</p>
        <strong>边审边问</strong>
        <span>读取正文、Bible、大纲、导演台、事实库和审稿报告；建议只预填动作，不直接改稿。</span>
      </div>
      <form class="assistant-form" method="POST" action="/webhook/novel-review-assistant" data-review-assistant-form>
        <input type="hidden" name="chapter_id" value="${chapterId}" />
        <input type="hidden" name="review_token" value="${token}" />
        <input type="hidden" name="reviewer" value="local_user" />
        <input type="hidden" name="thread_id" data-assistant-thread-id />
        <input type="hidden" name="selected_text" data-assistant-selected-text />
        <input type="hidden" name="paragraph_start" data-assistant-paragraph-start />
        <input type="hidden" name="paragraph_end" data-assistant-paragraph-end />
        <input type="hidden" name="selection_start_offset" data-assistant-selection-start />
        <input type="hidden" name="selection_end_offset" data-assistant-selection-end />
        <input type="hidden" name="anchor_prefix" data-assistant-anchor-prefix />
        <input type="hidden" name="anchor_suffix" data-assistant-anchor-suffix />
        <div class="assistant-mode" role="radiogroup" aria-label="助手模式">
          ${modes.map(([value, labelText], index) => `
            <label>
              <input type="radio" name="mode" value="${escapeHtml(value)}" ${index === 0 ? 'checked' : ''} />
              <span>${escapeHtml(labelText)}</span>
            </label>
          `).join('')}
        </div>
        <div class="assistant-selection" data-assistant-selection-preview>未绑定选区；可直接问整章问题。</div>
        <div class="assistant-quick">
          ${quickPrompts.map(([mode, prompt]) => `<button type="button" data-assistant-quick="${escapeHtml(mode)}" data-question="${escapeHtml(prompt)}">${escapeHtml(label({continuity: '查连续性', selection_advice: '问选区', design_reference: '要设计'}, mode, '提问'))}</button>`).join('')}
        </div>
        <label>
          <span>你的问题</span>
          <textarea name="question" rows="4" placeholder="例如：这里许青为什么突然交出文件？会不会和前文事实冲突？"></textarea>
        </label>
        <p class="form-hint" data-assistant-feedback aria-live="polite">建议会在下方返回；需要改稿时再转为局部修订。</p>
        <button type="submit">询问助手</button>
      </form>
      <div class="assistant-result" data-assistant-result aria-live="polite">
        <p class="muted">选中正文片段后点“问助手”，或直接输入整章问题。</p>
      </div>
    </aside>`;
}

function actionForm(row, className) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const actionUrl = '/webhook/novel-review-action';
  const recClass = recommendationClass(row);
  const recText = recommendation(row);
  const hasReview = hasAiReview(row);
  const decisionHint = hasReview
    ? `当前推荐：${escapeHtml(recText)}。要求重写会自动携带右侧智能审稿的问题与建议。`
    : '当前稿件尚未重新智能审稿；可以继续局部修改，完成后重新审稿，或确认无误后直接通过。';
  return `
    <form class="actions ${className}" method="POST" action="${actionUrl}">
      <input type="hidden" name="chapter_id" value="${chapterId}" />
      <input type="hidden" name="review_token" value="${token}" />
      <input type="hidden" name="reviewer" value="local_user" />
      <div class="action-card-head">
        <strong>提交审核决策</strong>
        <span>${decisionHint}</span>
      </div>
      <label>
        <textarea name="comment" rows="3" aria-label="审核意见" placeholder="${hasReview ? '通过可留空；要求重写即使留空，也会按智能审稿的问题与建议改稿；拒绝建议填写原因。' : '通过可留空；要求重写或拒绝建议填写原因，方便后续追踪。'}"></textarea>
      </label>
      <div class="button-row" data-recommendation="${escapeHtml(recClass)}">
        <button class="${recClass === 'approve' ? 'recommended-button' : ''}" name="action" value="approve" type="submit">通过</button>
        <button class="warn-button ${recClass === 'rewrite' ? 'recommended-button' : ''}" name="action" value="request_rewrite" type="submit">要求重写</button>
        <button class="secondary danger-secondary ${recClass === 'reject' ? 'recommended-button' : ''}" name="action" value="reject" type="submit">拒绝</button>
      </div>
    </form>`;
}

function rerunReviewForm(row) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  return `
    <form class="launcher-rerun-form actions" method="POST" action="/webhook/novel-review-action" aria-label="重新审稿">
      <input type="hidden" name="chapter_id" value="${chapterId}" />
      <input type="hidden" name="review_token" value="${token}" />
      <input type="hidden" name="reviewer" value="local_user" />
      <button class="rerun-review-button" name="action" value="rerun_review" type="submit">重新审稿</button>
    </form>`;
}

function observabilityBlock(row, opsId) {
  const latestJobStatus = row.latest_job_status || '';
  const notifyStatus = row.notify_status || '';
  const remindStatus = row.remind_status || '';
  const aiSuccess = row.ai_run_success;
  const aiStatus = aiSuccess === true ? 'SUCCESS' : aiSuccess === false ? 'FAILED' : '';
  const detailLink = row.review_detail_url
    ? `<a class="small-link" href="${escapeHtml(row.review_detail_url)}">通知落点</a>`
    : '';
  const aiError = localizeError(row.ai_run_error_message);
  const jobError = localizeError(row.latest_job_error_message);

  return `
    <section class="observability" id="${escapeHtml(opsId)}" aria-label="运行观察">
      <h3>运行观察</h3>
      <div class="ops-grid">
        <div>
          <h4>模型调用</h4>
          <dl>
            <dt>模型</dt><dd>${escapeHtml(row.ai_run_model || '未记录')}</dd>
            <dt>提示词</dt><dd>${escapeHtml(row.ai_run_prompt_version || '未记录')}</dd>
            <dt>耗时</dt><dd>${escapeHtml(formatDuration(row.ai_run_duration_ms))}</dd>
            <dt>结果</dt><dd>${badge(aiStatus, '未记录')}</dd>
            <dt>时间</dt><dd>${escapeHtml(formatLocalTime(row.ai_run_created_at))}</dd>
          </dl>
          ${aiError ? `<p class="error">${escapeHtml(aiError)}</p>` : ''}
        </div>
        <div>
          <h4>任务状态</h4>
          <dl>
            <dt>类型</dt><dd>${escapeHtml(label(jobTypeLabel, row.latest_job_type, '未记录'))}</dd>
            <dt>状态</dt><dd>${badge(latestJobStatus, '未记录')}</dd>
            <dt>尝试</dt><dd>${escapeHtml(row.latest_job_attempt_count ?? 0)}</dd>
            <dt>更新</dt><dd>${escapeHtml(formatLocalTime(row.latest_job_updated_at))}</dd>
          </dl>
          ${jobError ? `<p class="error">${escapeHtml(jobError)}</p>` : ''}
        </div>
        <div>
          <h4>通知状态</h4>
          <dl>
            <dt>任务</dt><dd>${badge(notifyStatus, '未记录')}</dd>
            <dt>提醒</dt><dd>${badge(remindStatus, '未记录')}</dd>
          </dl>
          ${detailLink}
        </div>
        <div>
          <h4>事实库</h4>
          <p class="fact-line">候选事实 ${escapeHtml(row.pending_fact_count ?? 0)} / 已激活 ${escapeHtml(row.active_fact_count ?? 0)} / 已失效 ${escapeHtml(row.inactive_fact_count ?? 0)}</p>
        </div>
        <div class="wide">
          <h4>人工记录</h4>
          <p class="muted">共 ${escapeHtml(row.human_review_count ?? 0)} 条</p>
          <ul class="history">${humanReviewItems(row.human_reviews)}</ul>
        </div>
      </div>
    </section>
  `;
}

function safeId(row) {
  return String(row.chapter_id || row.id || `chapter-${row.chapter_no || 'unknown'}`).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function reviewDetailUrl(row) {
  return `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(row.chapter_id || row.id || '')}&review_token=${encodeURIComponent(row.review_token || '')}`;
}

function renderListDashboard(items) {
  if (!items.length) return '';
  const first = items[0];
  const counts = items.reduce((acc, row) => {
    acc[recommendationClass(row)] = (acc[recommendationClass(row)] || 0) + 1;
    return acc;
  }, {});
  return `
    <section class="review-workbench" aria-label="审核入口">
      <div>
        <p class="ops-kicker">审核入口</p>
        <h2>先处理最上方的待审稿</h2>
        <p>列表只保留判断所需信息：推荐动作、评分、摘要和首要问题。正文与提交动作都在详情页，避免误操作。</p>
        <div class="review-counts">
          <span>建议通过 ${escapeHtml(counts.approve || 0)}</span>
          <span>建议重写 ${escapeHtml(counts.rewrite || 0)}</span>
          <span>高风险 ${escapeHtml(counts.reject || 0)}</span>
          <span>需判断 ${escapeHtml(counts.review || 0)}</span>
        </div>
      </div>
      <div class="workbench-actions">
        <a class="primary-link" href="${escapeHtml(reviewDetailUrl(first))}">处理下一章</a>
        <a href="/webhook/novel-center">返回工作台</a>
        <a href="/webhook/novel-project-list?filter=review">待审项目</a>
      </div>
    </section>`;
}

function renderDetailReturnBar(row) {
  return `
    <nav class="return-strip" aria-label="审核返回上下文">
      <a href="/webhook/novel-review-list">返回审核列表</a>
      <a href="${escapeHtml(projectDetailHref(row))}">返回项目</a>
      <a href="${escapeHtml(chapterDetailHref(row))}">返回章节</a>
      <a href="${escapeHtml(projectQueueHref(row))}">查看队列</a>
    </nav>`;
}

function renderListCard(row) {
  const score = Number(row.total_score || 0);
  const title = escapeHtml(reviewChapterTitle(row));
  const projectTitle = escapeHtml(row.project_title || row.novel_title || row.project_name || '小说项目');
  const detailUrl = reviewDetailUrl(row);
  const summary = row.summary || '暂无候选稿摘要，请打开审核详情阅读正文。';
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  const issueCount = itemCount(row.issues);
  const suggestionCount = itemCount(row.suggestions);
  const firstIssue = shortItem(row.issues, '暂无首要问题');
  const firstSuggestion = shortItem(row.suggestions, '暂无修改建议');
  return `
    <article class="review-row ${escapeHtml(recClass)} review-list-summary" data-mode="list" data-page-key="${escapeHtml(row.chapter_id || row.id || title)}">
      <div class="review-row-main">
        <div class="row-title-line">
          <span class="recommendation-pill ${escapeHtml(recClass)}">${escapeHtml(rec)}</span>
          <h3>${title}</h3>
        </div>
        <p class="meta">待审摘要 / ${projectTitle} / 第 ${escapeHtml(row.chapter_no || '')} 章 / 版本 ${escapeHtml(row.generation_version || '')}</p>
        <p class="summary-line">${escapeHtml(summary)}</p>
        <div class="quick-evidence" aria-label="快速依据">
          <span>评分 ${escapeHtml(score || '-')}</span>
          <span>问题 ${escapeHtml(issueCount)}</span>
          <span>建议 ${escapeHtml(suggestionCount)}</span>
          <span>候选事实 ${escapeHtml(row.pending_fact_count ?? 0)}</span>
        </div>
        <details class="mini-evidence">
          <summary>查看首要问题和建议</summary>
          <p><strong>问题</strong>${escapeHtml(firstIssue)}</p>
          <p><strong>建议</strong>${escapeHtml(firstSuggestion)}</p>
        </details>
      </div>
      <div class="review-row-actions">
        <a class="primary-link" href="${detailUrl}">打开并决策</a>
        <a href="${escapeHtml(projectDetailHref(row))}">回项目</a>
        <a href="${escapeHtml(chapterDetailHref(row))}">章节上下文</a>
      </div>
    </article>`;
}

function reviewGroupInfo(row) {
  const rec = recommendationClass(row);
  const notifyStatus = String(row.notify_status || row.remind_status || '');
  if (notifyStatus.includes('SKIPPED') || notifyStatus.includes('FAILED')) {
    return {key: 'notify', title: '通知异常', detail: '提醒没有正常送达，先打开详情确认上下文。'};
  }
  if (rec === 'approve') return {key: 'approve', title: '建议通过', detail: '评分和结论较稳定，优先快速扫读后通过。'};
  if (rec === 'rewrite') return {key: 'rewrite', title: '建议重写', detail: '需要把修改意见写清楚，方便重写任务继承。'};
  if (rec === 'reject') return {key: 'risk', title: '高风险', detail: '拒绝会阻止候选稿成为正式版本，请确认原因明确。'};
  return {key: 'manual', title: '需人工判断', detail: '当前结果不够明确，先阅读正文和运行依据。'};
}

function renderListGroups(items) {
  const order = ['approve', 'rewrite', 'risk', 'notify', 'manual'];
  const groups = items.reduce((acc, row) => {
    const info = reviewGroupInfo(row);
    if (!acc[info.key]) acc[info.key] = {...info, rows: []};
    acc[info.key].rows.push(row);
    return acc;
  }, {});
  return order
    .filter((key) => groups[key])
    .map((key, index) => `
      <details class="review-lane" data-review-lane="${escapeHtml(key)}" ${index === 0 ? 'open' : ''}>
        <summary class="lane-head">
          <div>
            <p class="ops-kicker">审核分组</p>
            <h2>${escapeHtml(groups[key].title)}</h2>
            <p class="muted">${escapeHtml(groups[key].detail)}</p>
          </div>
          <strong>${escapeHtml(groups[key].rows.length)}</strong>
        </summary>
        ${groups[key].rows.map(renderListCard).join('')}
      </details>`)
    .join('');
}

function renderDetailCard(row) {
  const body = String(row.body || '');
  const title = escapeHtml(reviewChapterTitle(row));
  const projectTitle = escapeHtml(row.project_title || row.novel_title || row.project_name || '小说项目');
  const id = safeId(row);
  const commentAnchor = `review-comment-${id}`;
  const opsAnchor = `review-ops-${id}`;
  const drawerId = `ai-review-drawer-${id}`;
  const decisionDrawerId = `review-decision-drawer-${id}`;
  const manualDrawerId = `manual-edit-drawer-${id}`;
  const rec = recommendation(row);
  return `
    <article class="card" data-mode="detail">
      <header class="card-header">
        <div>
          <p class="meta">${projectTitle} / 第 ${escapeHtml(row.chapter_no || '')} 章 / 版本 ${escapeHtml(row.generation_version || '')}</p>
          <h2>${title}</h2>
        </div>
        <div class="score ${escapeHtml(scoreTone(row))}">${escapeHtml(scoreText(row))}</div>
      </header>
      <span id="${escapeHtml(commentAnchor)}" class="anchor-target"></span>
      <div class="review-decision-launcher" aria-label="人工审核入口">
        <div>
          <p class="ops-kicker">人工审核</p>
          <strong>${escapeHtml(rec)}</strong>
          <span>${hasAiReview(row) ? '决策表单已收进抽屉，右侧留给剧情助手。' : '可以先继续微调，完成后从抽屉重新审稿或直接通过。'}</span>
        </div>
        <div class="launcher-actions">
          <button type="button" data-open-dialog="${escapeHtml(decisionDrawerId)}">打开人工审核</button>
          <button class="secondary" type="button" data-open-dialog="${escapeHtml(manualDrawerId)}">人工改稿</button>
          <button class="secondary" type="button" data-open-dialog="${escapeHtml(drawerId)}">智能审稿</button>
          ${rerunReviewForm(row)}
        </div>
      </div>
      <section class="review-detail-workspace" id="reader-section-${escapeHtml(id)}">
        <div class="review-reader-panel">
          <div class="reader-head">
            <div>
              <p class="ops-kicker">审核内容</p>
              <h3>先读正文，再提交人工判断</h3>
              <p class="muted">${hasAiReview(row) ? `推荐动作：${escapeHtml(rec)}。人工审核和智能审稿都在抽屉里，阅读区保持干净。` : '这是局部修订后的可继续编辑稿；先批量微调，最后再从人工审核抽屉重新审稿或直接通过。'}</p>
            </div>
            ${reviewScoreBrief(row)}
          </div>
          ${paragraphReader(row, id)}
        </div>
        ${reviewAssistantPanel(row, id)}
      </section>
      <nav class="mobile-workbench-switcher" aria-label="移动端审稿工具">
        <button type="button" data-mobile-open-assistant="review-assistant-${escapeHtml(id)}">助手</button>
        <button type="button" data-mobile-open-revision="block-revision-panel-${escapeHtml(id)}">修订</button>
      </nav>
      ${reviewDecisionDrawer(row, decisionDrawerId)}
      ${aiReviewDrawer(row, drawerId, opsAnchor)}
      ${manualReviewEditDrawer(row, manualDrawerId)}
    </article>
    ${blockRevisionPanel(row, id)}`;
}

const rows = $input.all()
  .map((item) => item.json || {})
  .filter((row) => !row.is_empty);

const pageMode = String(rows[0]?.page_mode || 'DETAIL').toUpperCase();
const isListPage = pageMode === 'LIST';
const firstRow = rows[0] || {};
const reviewBreadcrumbHtml = isListPage
  ? breadcrumb([
    {label: '工作台', href: '/webhook/novel-center'},
    {label: '审核中心'},
  ])
  : reviewDetailBreadcrumb(firstRow);
const cards = rows.length
  ? (isListPage ? renderListGroups(rows) : rows.map(renderDetailCard).join(''))
  : '<section class="empty">暂无待审核章节</section>';
const reviewFlowHtml = rows.length
  ? (isListPage ? renderListDashboard(rows) : '')
  : '';
const headerActionsHtml = !isListPage && rows.length ? renderDetailReturnBar(firstRow) : '';
const reviewPagerHtml = isListPage && rows.length
  ? `<nav class="pager" data-pagination="reviews" aria-label="审核分页">
      <span class="pager-status" data-page-status>分页载入中</span>
      <div class="pager-controls">
        <button type="button" data-page-prev>上一页</button>
        <button type="button" data-page-next>下一页</button>
        <label>每页
          <select data-page-size>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
    </nav>`
  : '';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说审核中心</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#667085; --line:#d9dee7; --bg:#f6f7f9; --panel:#fff; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --bad:#b42318; --bad-soft:#fff0ee; }
    * { box-sizing: border-box; }
    html { scroll-behavior: auto; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
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
    .page-header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context .page-header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    .ops-kicker { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .page-header p { margin: 6px 0 0; color: var(--muted); }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav a { white-space: nowrap; }
    .breadcrumbs { gap: 8px; margin: 0 0 12px; color: var(--muted); font-size: 13px; }
    .breadcrumbs a { color: var(--muted); }
    .breadcrumbs a:hover { color: var(--accent); }
    .crumb-separator { color: #98a2b3; }
    .review-workbench { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border: 1px solid #b9e3d4; border-radius: 8px; padding: 16px; margin-bottom: 18px; background: var(--accent-soft); }
    .review-workbench h2 { margin: 0 0 8px; }
    .review-workbench p { margin: 0; color: #225447; line-height: 1.65; }
    .review-counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .review-counts span, .quick-evidence span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; background: #fff; color: #225447; font-size: 13px; font-weight: 700; }
    .workbench-actions { min-width: 320px; display: grid; grid-template-columns: 1fr; gap: 8px; }
    .workbench-actions a, .review-row-actions a, .primary-link, .return-strip a { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; }
    .primary-link, .workbench-actions .primary-link, .review-row-actions .primary-link { background: var(--accent); color: #fff; border-color: var(--accent); }
    .return-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .page-header .return-strip { margin: 0; padding: 0; border: 0; background: transparent; justify-content: flex-end; }
    .page-header .return-strip a { min-height: 34px; background: #fff; }
    .pager { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 16px; margin-bottom: 18px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .pager-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pager button, .pager select { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 0 10px; font: inherit; font-weight: 650; }
    .pager button:not(:disabled) { color: var(--accent); cursor: pointer; }
    .pager button:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
    .pager button:disabled { color: var(--muted); cursor: not-allowed; }
    .pager-status { color: var(--muted); font-size: 13px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin-bottom: 18px; content-visibility: auto; contain-intrinsic-size: 520px; }
    .review-lane { margin-bottom: 18px; }
    .lane-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; background: #fff; }
    .review-lane:not([open]) .lane-head { margin-bottom: 0; }
    .lane-head h2 { margin-top: 0; }
    .lane-head strong { min-width: 42px; min-height: 42px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-variant-numeric: tabular-nums; }
    .review-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 14px; align-items: start; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; background: #fff; }
    .review-row.approve { border-color: #b9e3d4; }
    .review-row.rewrite { border-color: #f1ce96; }
    .review-row.reject { border-color: #f2b8b5; }
    .row-title-line { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .row-title-line h3 { margin: 0; font-size: 18px; }
    .recommendation-pill { display: inline-flex; align-items: center; min-height: 26px; border-radius: 999px; padding: 0 10px; font-size: 13px; font-weight: 800; border: 1px solid var(--line); background: #f6f7f9; }
    .recommendation-pill.approve { color: var(--accent); background: var(--accent-soft); border-color: #b9e3d4; }
    .recommendation-pill.rewrite { color: var(--warn); background: #fff7e8; border-color: #f1ce96; }
    .recommendation-pill.reject { color: var(--bad); background: var(--bad-soft); border-color: #f2b8b5; }
    .summary-line { margin: 8px 0 10px; line-height: 1.65; }
    .quick-evidence { display: flex; flex-wrap: wrap; gap: 8px; }
    .mini-evidence { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; color: var(--muted); }
    .mini-evidence summary { color: var(--accent); cursor: pointer; font-weight: 700; }
    .mini-evidence p { margin: 8px 0 0; line-height: 1.55; }
    .mini-evidence strong { margin-right: 8px; color: var(--ink); }
    .review-row-actions { display: grid; gap: 8px; }
    .card-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 1px solid var(--line); padding-bottom: 14px; }
    h2 { margin: 4px 0 0; font-size: 22px; }
    .detail-link, .small-link { display: inline-block; margin-top: 8px; color: var(--accent); text-decoration: none; font-weight: 650; }
    .context-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .context-actions .detail-link { min-height: 32px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; margin-top: 0; }
    h3, h4 { margin: 0 0 10px; }
    .meta, .muted { margin: 0; color: var(--muted); font-size: 13px; }
    .score { min-width: 64px; border-radius: 8px; padding: 10px 12px; text-align: center; font-size: 24px; font-weight: 700; border: 1px solid var(--line); font-variant-numeric: tabular-nums; }
    .score.good { color: var(--accent); }
    .score.warn { color: var(--warn); }
    .score.bad { color: var(--bad); }
    .score.muted { color: var(--muted); background: #f6f7f9; }
    .review-summary { margin-top: 16px; padding: 14px; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); }
    .decision-banner { display: grid; gap: 4px; margin-bottom: 12px; padding: 12px; border-radius: 8px; border: 1px solid var(--line); background: #fff; }
    .decision-banner strong { font-size: 18px; }
    .decision-banner span { color: var(--muted); line-height: 1.55; }
    .decision-banner.approve { border-color: #b9e3d4; background: #f5fbf8; }
    .decision-banner.rewrite { border-color: #f1ce96; background: #fffaf0; }
    .decision-banner.reject { border-color: #f2b8b5; background: var(--bad-soft); }
    .review-summary dl { grid-template-columns: 96px 1fr; margin-bottom: 0; }
    .review-evidence { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .review-evidence dl { grid-template-columns: 96px 1fr; margin-bottom: 0; }
    .decision-rail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); gap: 14px; align-items: start; margin-top: 16px; padding: 14px; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); }
    .decision-rail .review-summary { margin-top: 0; background: #fff; }
    .decision-rail .actions { position: sticky; top: 16px; margin-top: 0; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .detail-link:hover, .small-link:hover { border-color: var(--accent); background: var(--accent-soft); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; padding-top: 16px; }
    .review-decision-launcher { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-top: 14px; border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px 14px; background: var(--accent-soft); }
    .review-decision-launcher strong { display: block; margin-bottom: 3px; font-size: 18px; color: #225447; }
    .review-decision-launcher span { display: block; color: #225447; line-height: 1.5; font-size: 13px; }
    .launcher-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .launcher-actions button { min-height: 36px; padding: 0 12px; white-space: nowrap; }
    .launcher-actions .launcher-rerun-form { margin: 0; display: flex; gap: 0; }
    .launcher-actions .launcher-rerun-form button { min-height: 36px; padding: 0 12px; white-space: nowrap; }
    .review-detail-workspace { --review-panel-height: min(760px, calc(100vh - 150px)); display: grid; grid-template-columns: minmax(520px, 1fr) minmax(320px, 380px); gap: 18px; align-items: stretch; padding-top: 16px; }
    .mobile-workbench-switcher { display: none; }
    .review-reader-panel { min-width: 0; min-height: 520px; height: var(--review-panel-height); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; }
    .reader-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 16px 18px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .reader-head h3 { margin-bottom: 6px; font-size: 20px; }
    .review-brief { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 420px; }
    .review-brief span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; background: #fff; color: #344054; font-size: 13px; font-weight: 750; white-space: nowrap; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; padding: 18px 20px; background: #fff; border-radius: 0; line-height: 1.82; min-height: 0; height: 100%; overflow: auto; font-size: 16px; }
    .reader-body { margin: 0; padding: 12px 0 18px; background: #fff; min-height: 0; height: 100%; overflow: auto; font-size: 16px; line-height: 1.82; }
    .paragraph-reader { position: relative; scroll-behavior: auto; }
    .reader-paragraph { position: relative; display: block; scroll-margin-top: 96px; padding: 10px 18px 10px 56px; border-bottom: 1px solid #f0f2f5; }
    .reader-paragraph:hover, .reader-paragraph:focus-within { background: #fbfcfd; }
    .reader-paragraph.is-selection-anchor { background: #f3faf7; box-shadow: inset 3px 0 0 #8fd4bd; }
    .reader-paragraph.is-inline-editing { background: #fffdf7; box-shadow: inset 3px 0 0 var(--warn); }
    .paragraph-label { position: absolute; left: 18px; top: 13px; min-height: 0; width: 30px; display: inline-flex; align-items: center; justify-content: flex-start; border: 0; border-radius: 0; background: transparent; color: #98a2b3; opacity: .42; font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; user-select: none; pointer-events: none; }
    .reader-paragraph:hover .paragraph-label, .reader-paragraph:focus-within .paragraph-label, .reader-paragraph.is-selection-anchor .paragraph-label { opacity: .88; color: var(--accent); }
    .reader-paragraph p { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .paragraph-revise-button { position: absolute; right: 14px; top: 8px; min-height: 28px; padding: 0 9px; border: 1px solid #b9e3d4; border-radius: 999px; background: #fff; color: var(--accent); font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transform: translateY(-2px); box-shadow: 0 8px 22px rgba(16, 24, 40, .12); transition: opacity .14s ease, transform .14s ease; }
    .reader-paragraph:hover .paragraph-revise-button, .reader-paragraph:focus-within .paragraph-revise-button, .paragraph-revise-button:focus-visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .inline-paragraph-editor { display: grid; gap: 8px; }
    .inline-paragraph-editor textarea { width: 100%; min-height: 96px; resize: vertical; border: 1px solid #f1ce96; border-radius: 8px; padding: 10px 12px; font: inherit; line-height: 1.86; color: var(--ink); background: #fff; }
    .inline-edit-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .inline-edit-row button { min-height: 34px; padding: 0 12px; }
    .inline-edit-feedback { color: var(--muted); font-size: 12px; line-height: 1.5; }
    .inline-edit-feedback.is-error { color: var(--bad); }
    .empty-paragraph { margin: 0; padding: 18px; color: var(--muted); }
    .selection-toolbar { position: fixed; z-index: 120; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: min(560px, calc(100vw - 24px)); padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 0 16px 38px rgba(16, 24, 40, .22); }
    .selection-toolbar[hidden] { display: none !important; }
    .selection-summary { min-height: 32px; display: inline-flex; align-items: center; border-right: 1px solid var(--line); padding: 0 10px 0 2px; color: var(--muted); font-size: 12px; font-weight: 850; white-space: nowrap; }
    .selection-toolbar button { min-height: 32px; padding: 0 10px; background: var(--accent); font-size: 13px; }
    aside { border-left: 1px solid var(--line); padding-left: 18px; }
    .review-assistant-panel { position: sticky; top: 86px; align-self: start; max-height: var(--review-panel-height); display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 12px; overflow: auto; border: 1px solid #ccd6e0; border-radius: 8px; background: #fff; padding: 14px; }
    .assistant-head { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .assistant-head strong { font-size: 20px; }
    .assistant-head span { color: var(--muted); line-height: 1.55; font-size: 13px; }
    .assistant-form { display: grid; gap: 10px; }
    .assistant-mode { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: #f8faf9; }
    .assistant-mode label { min-width: 0; display: block; }
    .assistant-mode input { position: absolute; opacity: 0; pointer-events: none; }
    .assistant-mode span { min-height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 7px; padding: 0 8px; color: #344054; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .assistant-mode input:checked + span { background: var(--accent); color: #fff; }
    .assistant-selection { min-height: 42px; max-height: 118px; overflow: auto; border: 1px dashed var(--line); border-radius: 8px; padding: 9px 10px; color: var(--muted); background: #fbfcfd; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
    .assistant-selection.has-selection { border-color: #b9e3d4; background: var(--accent-soft); color: #225447; }
    .assistant-quick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .assistant-quick button { min-height: 34px; padding: 0 8px; border: 1px solid var(--line); background: #fff; color: var(--accent); font-size: 12px; white-space: nowrap; }
    .assistant-form label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; font-weight: 750; }
    .assistant-form textarea { width: 100%; min-height: 100px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 10px; color: var(--ink); font: inherit; line-height: 1.65; }
    .assistant-form > button { min-height: 40px; }
    .assistant-result { min-height: 0; display: grid; align-content: start; gap: 10px; overflow: auto; border-top: 1px solid var(--line); padding-top: 12px; }
    .assistant-answer { display: grid; gap: 8px; border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px; background: #f7fcf9; }
    .assistant-answer strong { color: #225447; }
    .assistant-answer p { margin: 0; line-height: 1.65; white-space: pre-wrap; }
    .assistant-section { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; }
    .assistant-section h4 { margin-bottom: 8px; font-size: 14px; }
    .assistant-section ul { margin-bottom: 0; padding-left: 18px; }
    .assistant-section li { margin-bottom: 5px; line-height: 1.55; }
    .assistant-action-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .assistant-action-row button { min-height: 34px; border: 1px solid #b9e3d4; background: #fff; color: var(--accent); padding: 0 10px; font-size: 13px; }
    .assistant-action-row button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .block-revision-panel { position: fixed; left: 50%; bottom: 14px; z-index: 92; width: min(1120px, calc(100vw - 32px)); max-height: min(78vh, 720px); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid #a8d8c7; border-radius: 8px; background: #fff; box-shadow: 0 22px 70px rgba(16, 24, 40, .24); transform: translate(-50%, calc(100% - 58px)); transition: transform .18s ease, box-shadow .18s ease; overflow: hidden; }
    .block-revision-panel.is-open { transform: translate(-50%, 0); }
    .block-panel-head { min-height: 58px; display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); background: #f5fbf8; cursor: pointer; }
    .block-panel-head strong { display: block; margin-top: 2px; font-size: 16px; line-height: 1.25; }
    .block-panel-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .block-panel-head-actions span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; background: #fff; color: var(--accent); font-size: 12px; font-weight: 850; white-space: nowrap; }
    .block-panel-close { min-height: 30px; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: #fff; color: var(--accent); font-size: 12px; }
    .block-revision-panel:not(.is-open) .block-panel-body { display: none; }
    .block-panel-body { min-height: 0; display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: 14px; padding: 14px; overflow: auto; }
    .block-flow-steps { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .block-flow-steps span { min-height: 34px; display: flex; align-items: center; gap: 6px; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: #f7fcf9; color: #225447; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .block-flow-steps strong { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; }
    .block-revision-form { display: grid; gap: 10px; align-self: start; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .block-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .block-revision-form label, .block-apply-form label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; font-weight: 750; }
    .block-revision-form select, .block-revision-form textarea, .block-apply-form textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; color: var(--ink); background: #fff; font: inherit; }
    .block-revision-form button { min-height: 40px; }
    .block-form-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .block-form-actions button.secondary { min-width: 128px; padding: 0 12px; background: #fff; color: var(--accent); border: 1px solid #b9e3d4; }
    .block-step-label { display: flex; align-items: center; gap: 8px; color: #344054; font-size: 13px; font-weight: 850; }
    .block-step-label span { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--accent); color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; }
    .block-revision-results { min-width: 0; display: grid; align-self: start; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #f8faf9; }
    .selected-preview { max-height: 156px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #f8faf9; color: #344054; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
    .selected-preview.has-selection { border-color: #b9e3d4; background: var(--accent-soft); color: #225447; }
    .block-revision-list { min-width: 0; display: grid; gap: 10px; }
    .block-revision-group { border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; }
    .block-revision-group summary { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; cursor: pointer; list-style: none; }
    .block-revision-group summary::-webkit-details-marker { display: none; }
    .block-revision-group summary span { min-width: 28px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums; }
    .block-revision-group-body { display: grid; gap: 10px; padding: 0 10px 10px; }
    .block-revision-card { min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
    .block-revision-card.warn { border-color: #f1ce96; background: #fffaf0; }
    .block-revision-card.good { border-color: #b9e3d4; background: #f7fcf9; }
    .block-revision-card.bad { border-color: #f2b8b5; background: var(--bad-soft); }
    .block-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .block-meta { margin: 6px 0 8px; color: var(--muted); font-size: 12px; }
    .block-revision-dl { grid-template-columns: 86px 1fr; margin-bottom: 8px; font-size: 13px; }
    .block-revision-dl dd { line-height: 1.55; }
    .block-replacement { margin: 8px 0; padding: 9px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .block-replacement strong { display: block; margin-bottom: 4px; font-size: 13px; }
    .block-replacement p { margin: 0; line-height: 1.65; white-space: pre-wrap; }
    .block-diff { margin: 8px 0; padding: 12px; border: 1px solid #b9e3d4; border-radius: 8px; background: #f7fcf9; }
    .block-diff strong { display: block; margin-bottom: 6px; font-size: 13px; color: #225447; }
    .block-diff p { margin: 0; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
    .block-diff del { padding: 1px 3px; border-radius: 4px; background: #fff0ee; color: var(--bad); text-decoration: line-through; }
    .block-diff ins { padding: 1px 3px; border-radius: 4px; background: #dcfae6; color: #067647; text-decoration: none; }
    .block-risk { display: grid; gap: 8px; margin: 8px 0; padding: 8px; border-radius: 8px; background: #fff7e8; color: var(--warn); line-height: 1.55; font-size: 13px; }
    .block-risk button { width: max-content; min-height: 30px; border: 1px solid #f1ce96; background: #fff; color: var(--warn); padding: 0 10px; font-size: 12px; }
    .block-live { display: grid; gap: 3px; margin: 8px 0; padding: 9px; border: 1px dashed #f1ce96; border-radius: 8px; background: #fffaf0; color: var(--warn); font-size: 13px; line-height: 1.5; }
    .block-live span { color: #8a5204; }
    .block-checklist { margin: 8px 0; padding-left: 18px; font-size: 13px; }
    .block-checklist li { margin-bottom: 4px; line-height: 1.5; }
    .block-checklist strong { margin-right: 6px; color: var(--accent); }
    .block-checklist span { display: block; color: var(--muted); }
    .block-apply-form { display: grid; gap: 8px; margin-top: 8px; }
    .block-apply-primary { display: grid; }
    .block-apply-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .block-apply-row button { min-height: 36px; padding: 9px 12px; }
    .block-secondary-actions { border-top: 1px dashed var(--line); padding-top: 8px; }
    .block-secondary-actions summary { width: max-content; color: var(--accent); cursor: pointer; font-size: 13px; font-weight: 800; }
    .block-secondary-actions .block-apply-row { margin-top: 8px; }
    .block-apply-form textarea[readonly] { background: #f8faf9; color: #344054; cursor: default; }
    .block-apply-form.is-editing textarea { background: #fff; box-shadow: 0 0 0 3px rgba(31, 122, 92, .1); }
    dl { display: grid; grid-template-columns: 70px 1fr; gap: 6px 10px; margin: 0 0 16px; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; }
    ul { margin: 0 0 16px; padding-left: 18px; }
    .summary-card { margin-top: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .summary-card p { margin: 0 0 8px; line-height: 1.7; }
    .compact-review { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
    .compact-review > div { border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .observability { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); scroll-margin-top: 16px; }
    .ops-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .ops-grid > div { border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
    .ops-grid .wide { grid-column: 1 / -1; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: #fff7e8; }
    .badge.bad { color: var(--bad); background: var(--bad-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .fact-line { margin: 0; color: var(--muted); line-height: 1.7; }
    .history { padding-left: 18px; margin-bottom: 0; }
    .history span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    .history p, .error { margin: 4px 0 0; color: var(--bad); font-size: 13px; line-height: 1.5; }
    .anchor-target { display: block; height: 1px; scroll-margin-top: 16px; }
    .actions { display: grid; gap: 10px; margin-top: 16px; align-items: start; }
    .action-card-head { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .action-card-head strong { font-size: 17px; }
    .action-card-head span { color: var(--muted); line-height: 1.5; font-size: 13px; }
    .actions label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
    .actions em { font-style: normal; line-height: 1.45; }
    .actions textarea { min-height: 48px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: inherit; color: var(--ink); }
    .button-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    button { border: 0; border-radius: 8px; padding: 12px 18px; font: inherit; font-weight: 650; background: var(--accent); color: white; cursor: pointer; touch-action: manipulation; }
    button:hover { filter: brightness(.95); }
    button:disabled { opacity: .68; cursor: progress; }
    button.warn-button { background: var(--warn); }
    button.secondary { background: #4b5563; }
    button.danger-secondary { background: #6b7280; }
    button.rerun-review-button { border: 1px solid #f2b8b5; background: var(--bad-soft); color: var(--bad); }
    button.recommended-button { box-shadow: 0 0 0 3px rgba(31, 122, 92, .18); transform: translateY(-1px); }
    .action-toast { position: fixed; right: 18px; bottom: 18px; z-index: 90; max-width: min(420px, calc(100vw - 36px)); border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px 14px; background: #fff; color: var(--ink); box-shadow: 0 18px 44px rgba(16, 24, 40, .18); line-height: 1.55; }
    .action-toast strong { display: block; margin-bottom: 2px; }
    .action-toast.is-error { border-color: #f2b8b5; background: var(--bad-soft); color: var(--bad); }
    .action-toast[hidden] { display: none !important; }
    .side-drawer {
      width: min(520px, calc(100vw - 24px));
      max-width: none;
      height: 100vh;
      max-height: none;
      margin: 0 0 0 auto;
      padding: 0;
      border: 0;
      background: #fff;
      color: var(--ink);
      box-shadow: -24px 0 60px rgba(16, 24, 40, .22);
    }
    .side-drawer::backdrop { background: rgba(15, 23, 42, .28); }
    .drawer-shell { min-height: 100%; display: grid; grid-template-rows: auto min-content min-content min-content min-content 1fr; overflow: auto; }
    .drawer-header { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(10px); }
    .drawer-header h2 { margin-top: 0; }
    .drawer-header p { margin: 4px 0 0; color: var(--muted); line-height: 1.55; }
    .icon-button { width: 36px; height: 36px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0; background: #fff; color: var(--ink); font-size: 22px; line-height: 1; }
    .drawer-section { padding: 16px 18px; border-bottom: 1px solid var(--line); }
    .drawer-section .review-summary { margin-top: 0; background: #fff; }
    .drawer-section ul { margin-bottom: 0; }
    .ai-score-card { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 14px; align-items: start; background: var(--accent-soft); }
    .ai-score-card .score { background: #fff; }
    .side-drawer .review-evidence, .side-drawer .observability { margin: 0; padding: 16px 18px; border-width: 0 0 1px; border-radius: 0; }
    .side-drawer .ops-grid { grid-template-columns: 1fr; }
    .side-drawer .ops-grid > div { background: #fff; }
    .review-decision-drawer { width: min(560px, calc(100vw - 24px)); }
    .review-decision-drawer .drawer-shell { grid-template-rows: auto minmax(0, 1fr); }
    .decision-drawer-section { background: var(--accent-soft); }
    .drawer-actions { margin-top: 0; border: 1px solid #b9e3d4; border-radius: 8px; background: #fff; padding: 12px; }
    .manual-edit-drawer { width: min(720px, calc(100vw - 24px)); }
    .manual-edit-drawer .drawer-shell { grid-template-rows: auto minmax(0, 1fr); }
    .manual-edit-form { min-height: 0; display: grid; grid-template-rows: auto auto minmax(260px, 1fr) auto auto auto; gap: 12px; padding: 16px 18px 18px; overflow: auto; }
    .manual-edit-form label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
    .manual-edit-form input, .manual-edit-form textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; color: var(--ink); background: #fff; font: inherit; }
    .manual-edit-form .body-field { min-height: 0; }
    .manual-edit-form .body-field textarea { min-height: 260px; height: 100%; line-height: 1.82; resize: vertical; }
    .form-hint { margin: 0; color: var(--muted); line-height: 1.55; font-size: 13px; }
    .form-hint.is-error { color: var(--bad); }
    .form-hint.is-success { color: var(--accent); }
    .manual-button-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .empty { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 28px; color: var(--muted); }
    a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 960px) { .ops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) {
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      .page-header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .review-workbench, .review-row { display: block; }
      .workbench-actions, .review-row-actions { min-width: 0; margin-top: 12px; }
      .pager { display: grid; grid-template-columns: 1fr; }
      .return-strip { flex-wrap: nowrap; overflow-x: auto; }
      .grid, .ops-grid, .compact-review, .decision-rail, .review-detail-workspace { grid-template-columns: 1fr; }
      .review-decision-launcher { display: grid; grid-template-columns: 1fr; align-items: stretch; }
      .launcher-actions { justify-content: stretch; display: grid; grid-template-columns: 1fr; }
      .launcher-actions .launcher-rerun-form { display: grid; }
      .mobile-workbench-switcher { position: fixed; left: 12px; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom)); z-index: 91; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 255, 255, .96); box-shadow: 0 14px 38px rgba(16, 24, 40, .2); backdrop-filter: blur(10px); }
      .mobile-workbench-switcher button { min-height: 40px; padding: 0 12px; }
      .reader-head { display: grid; grid-template-columns: 1fr; }
      .review-brief { justify-content: flex-start; max-width: none; }
      .review-reader-panel { height: auto; min-height: 0; }
      pre, .reader-body { height: auto; max-height: 68vh; }
      .reader-paragraph { padding: 12px 14px 46px 42px; }
      .paragraph-label { left: 12px; top: 14px; opacity: .5; }
      .paragraph-revise-button { left: 42px; right: auto; top: auto; bottom: 10px; width: max-content; opacity: 1; pointer-events: auto; transform: none; box-shadow: none; }
      aside { border-left: 0; padding-left: 0; }
      .review-assistant-panel { position: static; height: auto; min-height: 0; max-height: none; }
      .assistant-mode, .assistant-quick { grid-template-columns: 1fr; }
      .decision-rail .actions { position: static; }
      .block-revision-panel { width: calc(100vw - 16px); bottom: 8px; max-height: min(84vh, 680px); transform: translate(-50%, calc(100% - 58px)); }
      .block-panel-head { align-items: flex-start; }
      .block-panel-head-actions { align-items: flex-end; flex-direction: column; gap: 6px; }
      .block-panel-body { grid-template-columns: 1fr; padding: 10px; }
      .block-flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .block-revision-form, .block-revision-results { padding: 10px; }
      .block-form-actions { grid-template-columns: 1fr; }
      .button-row { display: grid; grid-template-columns: 1fr; }
      .block-form-grid, .block-apply-row { grid-template-columns: 1fr; }
      .block-apply-row button { flex: 1 1 100%; }
      button { min-height: 44px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('审核中心')}
  <main>
    <div class="page-context">
    ${reviewBreadcrumbHtml}
    <div class="page-header">
      <div>
        <h1>小说审核中心</h1>
        <p>${isListPage ? '列表页展示摘要卡片，完整正文和操作在详情页完成。' : '审核动作需要确认后通过表单提交。'}</p>
      </div>
      ${headerActionsHtml}
    </div>
    </div>
    ${reviewFlowHtml}
    ${reviewPagerHtml}
    ${cards}
  </main>
  </div>
  <script>
    (() => {
      const pager = document.querySelector('[data-pagination="reviews"]');
      if (pager) {
        const rows = Array.from(document.querySelectorAll('.review-row'));
        const lanes = Array.from(document.querySelectorAll('.review-lane'));
        const prev = pager.querySelector('[data-page-prev]');
        const next = pager.querySelector('[data-page-next]');
        const status = pager.querySelector('[data-page-status]');
        const sizeSelect = pager.querySelector('[data-page-size]');
        const allowedSizes = new Set(['10', '20', '50']);
        let currentPage = 1;
        let pageSize = 10;
        const readPageState = () => {
          const params = new URLSearchParams(window.location.search);
          const requestedSize = params.get('page_size') || '10';
          pageSize = allowedSizes.has(requestedSize) ? Number(requestedSize) : 10;
          currentPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
          if (sizeSelect) sizeSelect.value = String(pageSize);
        };
        const writePageState = () => {
          const params = new URLSearchParams(window.location.search);
          if (currentPage > 1) params.set('page', String(currentPage));
          else params.delete('page');
          if (pageSize !== 10) params.set('page_size', String(pageSize));
          else params.delete('page_size');
          const query = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + (window.location.hash || ''));
        };
        const applyPage = (options = {}) => {
          const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
          currentPage = Math.min(Math.max(1, currentPage), totalPages);
          const start = (currentPage - 1) * pageSize;
          const visibleRows = new Set(rows.slice(start, start + pageSize));
          rows.forEach((row) => { row.hidden = !visibleRows.has(row); });
          lanes.forEach((lane) => {
            lane.hidden = !Array.from(lane.querySelectorAll('.review-row')).some((row) => !row.hidden);
          });
          if (status) status.textContent = '共 ' + rows.length + ' 条待审 / 第 ' + currentPage + ' 页，共 ' + totalPages + ' 页';
          if (prev) prev.disabled = currentPage <= 1;
          if (next) next.disabled = currentPage >= totalPages;
          if (options.write !== false) writePageState();
        };
        if (prev) prev.addEventListener('click', () => {
          currentPage -= 1;
          applyPage();
        });
        if (next) next.addEventListener('click', () => {
          currentPage += 1;
          applyPage();
        });
        if (sizeSelect) sizeSelect.addEventListener('change', () => {
          pageSize = Number(sizeSelect.value) || 10;
          currentPage = 1;
          applyPage();
        });
        readPageState();
        applyPage({write: false});
        window.addEventListener('popstate', () => {
          readPageState();
          applyPage({write: false});
        });
      }

      document.querySelectorAll('[data-open-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = document.getElementById(button.dataset.openDialog || '');
          if (!dialog) return;
          const currentDialog = button.closest('dialog.side-drawer');
          if (currentDialog && currentDialog !== dialog && typeof currentDialog.close === 'function') currentDialog.close();
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
        });
      });

      document.querySelectorAll('.side-drawer').forEach((dialog) => {
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog) dialog.close();
        });
        dialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
          button.addEventListener('click', () => dialog.close());
        });
      });

      const messages = {
        approve: '确认通过这一章？通过后会成为当前正式版本，并可能创建下一章任务。',
        request_rewrite: '确认要求重写这一稿？系统会自动携带智能审稿的问题与建议，人工意见会作为额外优先级。',
        rerun_review: '确认重新进行智能审稿？当前稿件会先离开待审列表，审稿完成后再回到审核中心。',
        reject: '确认拒绝这一稿？拒绝后不会成为正式版本，建议填写拒绝原因。',
      };
      const manualEditMessages = {
        save_only: '确认保存当前改稿并继续修改？系统会生成新的待审候选稿，但不会自动触发智能审稿。',
        resubmit: '确认保存人工改稿并重新送审？原待审稿会退出审核列表，新改稿会进入智能审稿队列。',
        approve: '确认保存人工改稿并直接通过？通过后会成为当前正式版本，并可能创建下一章任务。',
      };
      const toast = document.createElement('div');
      toast.className = 'action-toast';
      toast.hidden = true;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);

      const showToast = (title, detail = '', isError = false) => {
        toast.classList.toggle('is-error', Boolean(isError));
        toast.replaceChildren();
        const strong = document.createElement('strong');
        strong.textContent = title;
        toast.appendChild(strong);
        if (detail) {
          const span = document.createElement('span');
          span.textContent = detail;
          toast.appendChild(span);
        }
        toast.hidden = false;
      };

      const resultMessageFromHtml = (html, fallback) => {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const title = doc.querySelector('.result strong')?.textContent?.trim()
            || doc.querySelector('h1')?.textContent?.trim()
            || '';
          const detail = doc.querySelector('.result p')?.textContent?.trim()
            || doc.querySelector('p')?.textContent?.trim()
            || '';
          return [title, detail].filter(Boolean).join('：') || fallback;
        } catch (error) {
          return fallback;
        }
      };

      const resultPrimaryHrefFromHtml = (html, fallback) => {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const href = doc.querySelector('a.primary')?.getAttribute('href') || '';
          return href || fallback;
        } catch (error) {
          return fallback;
        }
      };

      const reviewSaveScrollKey = 'novel-review-save-scroll';
      try {
        if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
      } catch (error) {}

      const normalizeLocalHref = (href) => {
        const anchor = document.createElement('a');
        anchor.href = href || window.location.href;
        return anchor.pathname + anchor.search;
      };

      const paragraphElementId = (paragraphNo) => paragraphNo ? 'review-paragraph-' + String(paragraphNo) : '';

      const paragraphElementForNo = (paragraphNo) => {
        const id = paragraphElementId(paragraphNo);
        return id ? document.getElementById(id) : null;
      };

      const rememberReviewSaveScroll = (targetHref, options = {}) => {
        try {
          const paragraphNo = options.paragraphNo || '';
          const target = options.element || paragraphElementForNo(paragraphNo);
          const rect = target?.getBoundingClientRect?.();
          const viewportTop = rect
            ? Math.max(12, Math.min(rect.top, Math.max(12, window.innerHeight - 96)))
            : null;
          window.sessionStorage.setItem(reviewSaveScrollKey, JSON.stringify({
            href: normalizeLocalHref(targetHref),
            x: window.scrollX || 0,
            y: window.scrollY || 0,
            paragraphNo,
            viewportTop,
            at: Date.now(),
          }));
        } catch (error) {}
      };

      const restoreReviewSaveScroll = () => {
        try {
          const raw = window.sessionStorage.getItem(reviewSaveScrollKey);
          if (!raw) return false;
          window.sessionStorage.removeItem(reviewSaveScrollKey);
          const state = JSON.parse(raw);
          if (!state || Date.now() - Number(state.at || 0) > 30000) return false;
          if (state.href && state.href !== normalizeLocalHref(window.location.href)) return false;
          const x = Number(state.x) || 0;
          const y = Number(state.y) || 0;
          const scrollToSavedTarget = () => {
            const target = paragraphElementForNo(state.paragraphNo);
            if (target) {
              const targetTop = target.getBoundingClientRect().top + window.scrollY;
              const viewportTop = Number.isFinite(Number(state.viewportTop))
                ? Number(state.viewportTop)
                : Math.min(180, Math.max(80, window.innerHeight * 0.28));
              window.scrollTo(x, Math.max(0, targetTop - viewportTop));
              target.classList.add('is-selection-anchor');
              window.setTimeout(() => target.classList.remove('is-selection-anchor'), 900);
              return;
            }
            window.scrollTo(x, y);
          };
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              scrollToSavedTarget();
              window.setTimeout(scrollToSavedTarget, 80);
              window.setTimeout(scrollToSavedTarget, 260);
            });
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const scrollToParagraphHash = () => {
        const hash = window.location.hash || '';
        if (!hash.startsWith('#review-paragraph-')) return;
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!target) return;
        window.setTimeout(() => {
          target.scrollIntoView({block: 'center'});
          target.classList.add('is-selection-anchor');
          window.setTimeout(() => target.classList.remove('is-selection-anchor'), 1400);
        }, 120);
      };

      const formPostUrl = (form) => form.getAttribute('action') || form.action || window.location.href;

      const blockActionNames = {
        modify: '定向修改',
        expand: '扩写',
        condense: '压缩',
        polish: '润色',
        continue: '续写',
        logic_fix: '逻辑修补',
        custom: '自定义',
      };
      const blockApplyMessages = {
        apply: '确认应用这条局部建议？系统会保存成新的待审候选稿，你可以继续局部修改，不会自动重新审稿。',
        apply_edited: '确认应用你修改后的局部文本？系统会保存成新的待审候选稿，你可以继续局部修改，不会自动重新审稿。',
        regenerate: '确认重新生成这条局部建议？当前建议会被新任务替代。',
        reject: '确认放弃这条局部修订建议？',
        request_rewrite: '确认把这条局部意见转为整章重写？原候选稿会退出审核列表。',
      };

      let activeBlockSelection = null;

      const setBlockPanelOpen = (panel, open) => {
        if (!panel) return;
        panel.classList.toggle('is-open', Boolean(open));
        const toggle = panel.querySelector('[data-block-panel-toggle]');
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      const openBlockPanel = (panel) => {
        setBlockPanelOpen(panel, true);
        const body = panel?.querySelector('.block-panel-body');
        if (body) window.setTimeout(() => { body.scrollTop = 0; }, 0);
      };

      const closeBlockPanel = (panel) => {
        setBlockPanelOpen(panel, false);
      };

      document.querySelectorAll('[data-block-revision-panel]').forEach((panel) => {
        const toggle = panel.querySelector('[data-block-panel-toggle]');
        if (toggle) {
          const togglePanel = () => setBlockPanelOpen(panel, !panel.classList.contains('is-open'));
          toggle.addEventListener('click', (event) => {
            if (event.target.closest('button, a, input, textarea, select')) return;
            togglePanel();
          });
          toggle.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            togglePanel();
          });
        }
        panel.querySelectorAll('[data-close-block-panel]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            closeBlockPanel(panel);
          });
        });
      });

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('[data-block-revision-panel].is-open').forEach((panel) => closeBlockPanel(panel));
      });
      const restoredReviewSaveScroll = restoreReviewSaveScroll();
      if (!restoredReviewSaveScroll) scrollToParagraphHash();

      const paragraphText = (paragraph) => (
        paragraph?.querySelector('[data-paragraph-text]')?.textContent || ''
      ).trim();

      const paragraphBodyStart = (paragraph) => Number.parseInt(paragraph?.dataset?.bodyStart || '0', 10) || 0;

      const chapterBodyForReader = (reader) => reader?.querySelector('[data-chapter-body]')?.value || '';

      const paragraphBodyEnd = (paragraph) => Number.parseInt(paragraph?.dataset?.bodyEnd || '0', 10) || paragraphBodyStart(paragraph);

      const replaceParagraphInBody = (reader, paragraph, replacementText) => {
        const body = chapterBodyForReader(reader);
        const start = Math.max(0, Math.min(paragraphBodyStart(paragraph), body.length));
        const end = Math.max(start, Math.min(paragraphBodyEnd(paragraph), body.length));
        return body.slice(0, start) + replacementText + body.slice(end);
      };

      const paragraphNoFromBodyOffset = (body, rawOffset) => {
        const raw = String(body || '');
        const text = raw.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
        const offset = raw.slice(0, Math.max(0, Number(rawOffset) || 0)).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').length;
        const matcher = /[^\\n]+/g;
        let paragraphNo = 0;
        let lastParagraphNo = '';
        let match = matcher.exec(text);
        while (match) {
          const rawLine = match[0];
          const leadingTrim = rawLine.length - rawLine.trimStart().length;
          const trimmed = rawLine.trim();
          if (trimmed) {
            paragraphNo += 1;
            lastParagraphNo = String(paragraphNo);
            const start = match.index + leadingTrim;
            const end = start + trimmed.length;
            if (offset <= end) return String(paragraphNo);
          }
          match = matcher.exec(text);
        }
        return lastParagraphNo;
      };

      const paragraphNoFromTextareaCaret = (textarea) => {
        if (!textarea) return '';
        return paragraphNoFromBodyOffset(textarea.value || '', textarea.selectionStart || 0);
      };

      const closeInlineParagraphEditor = (paragraph) => {
        const editor = paragraph?.querySelector('[data-inline-edit-form]');
        const textNode = paragraph?.querySelector('[data-paragraph-text]');
        if (editor) editor.remove();
        if (textNode) textNode.hidden = false;
        paragraph?.classList.remove('is-inline-editing');
      };

      const closeAllInlineParagraphEditors = () => {
        document.querySelectorAll('.reader-paragraph.is-inline-editing').forEach((paragraph) => closeInlineParagraphEditor(paragraph));
      };

      const startInlineParagraphEdit = (paragraph) => {
        const reader = paragraph?.closest('[data-block-reader]');
        const textNode = paragraph?.querySelector('[data-paragraph-text]');
        if (!reader || !paragraph || !textNode || paragraph.querySelector('[data-inline-edit-form]')) return;
        hideSelectionToolbar();
        closeAllInlineParagraphEditors();
        const originalText = textNode.textContent || '';
        paragraph.classList.add('is-inline-editing');
        textNode.hidden = true;

        const editor = document.createElement('div');
        editor.className = 'inline-paragraph-editor';
        editor.dataset.inlineEditForm = 'true';

        const textarea = document.createElement('textarea');
        textarea.name = 'inline_body';
        textarea.value = originalText;
        textarea.setAttribute('aria-label', '直接修改当前段落');

        const row = document.createElement('div');
        row.className = 'inline-edit-row';
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = '保存继续修改';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'secondary';
        cancelButton.textContent = '取消';
        const feedback = document.createElement('span');
        feedback.className = 'inline-edit-feedback';
        feedback.textContent = '双击段落直接改；保存后不会自动审稿。';
        row.append(saveButton, cancelButton, feedback);
        editor.append(textarea, row);
        textNode.after(editor);

        cancelButton.addEventListener('click', () => closeInlineParagraphEditor(paragraph));
        saveButton.addEventListener('click', async () => {
          const replacement = textarea.value.trim();
          if (!replacement) {
            feedback.textContent = '段落不能为空。';
            feedback.classList.add('is-error');
            return;
          }
          if (replacement === originalText.trim()) {
            closeInlineParagraphEditor(paragraph);
            return;
          }
          const paragraphNo = paragraph.dataset.paragraphNo || '';
          const requestBody = new FormData();
          requestBody.append('chapter_id', reader.dataset.chapterId || '');
          requestBody.append('review_token', reader.dataset.reviewToken || '');
          requestBody.append('reviewer', 'local_user');
          requestBody.append('decision', 'save_only');
          requestBody.append('body', replaceParagraphInBody(reader, paragraph, replacement));
          requestBody.append('comment', '双击段落直接修改：P' + (paragraphNo || ''));
          saveButton.disabled = true;
          cancelButton.disabled = true;
          saveButton.textContent = '保存中...';
          feedback.textContent = '正在保存为新的待审候选稿...';
          feedback.classList.remove('is-error');
          try {
            const response = await fetch('/webhook/novel-review-manual-edit', {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '段落保存失败：HTTP ' + response.status));
            }
            const targetHref = resultPrimaryHrefFromHtml(html, window.location.pathname + window.location.search);
            rememberReviewSaveScroll(targetHref, {paragraphNo, element: paragraph});
            showToast('段落已保存', '正在留在当前位置继续修改...');
            window.setTimeout(() => {
              window.location.href = targetHref;
            }, 500);
          } catch (error) {
            feedback.textContent = error.message || '保存失败，请稍后重试。';
            feedback.classList.add('is-error');
            showToast('段落保存未完成', error.message || '保存失败，请稍后重试。', true);
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.textContent = '保存继续修改';
          }
        });

        window.setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }, 0);
      };

      const trimmedRange = (value, start, end) => {
        const safeStart = Math.max(0, Math.min(start, value.length));
        const safeEnd = Math.max(safeStart, Math.min(end, value.length));
        const raw = value.slice(safeStart, safeEnd);
        const leading = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();
        return {
          text: trimmed,
          start: safeStart + leading,
          end: safeStart + leading + trimmed.length,
        };
      };

      const textOffsetWithin = (container, node, offset) => {
        if (!container || !node) return 0;
        if (node === container) return Math.max(0, offset || 0);
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let cursor = 0;
        let current = walker.nextNode();
        while (current) {
          if (current === node) return cursor + Math.max(0, offset || 0);
          cursor += current.nodeValue.length;
          current = walker.nextNode();
        }
        return cursor;
      };

      const rangeSliceForParagraph = (paragraph, range) => {
        const textElement = paragraph?.querySelector('[data-paragraph-text]');
        if (!textElement || !range) return {text: '', start: 0, end: 0};
        const textValue = textElement.textContent || '';
        const startInside = textElement.contains(range.startContainer);
        const endInside = textElement.contains(range.endContainer);
        const start = startInside ? textOffsetWithin(textElement, range.startContainer, range.startOffset) : 0;
        const end = endInside ? textOffsetWithin(textElement, range.endContainer, range.endOffset) : textValue.length;
        return trimmedRange(textValue, start, end);
      };

      const anchorAroundSelection = (reader, bodyStart, bodyEnd) => {
        const value = chapterBodyForReader(reader);
        const safeStart = Math.max(0, Math.min(bodyStart, value.length));
        const safeEnd = Math.max(safeStart, Math.min(bodyEnd, value.length));
        const prefix = value.slice(Math.max(0, safeStart - 120), safeStart);
        const suffix = value.slice(safeEnd, Math.min(value.length, safeEnd + 120));
        return {prefix, suffix};
      };

      const paragraphContext = (paragraph) => {
        const reader = paragraph?.closest('[data-block-reader]');
        const paragraphs = reader ? Array.from(reader.querySelectorAll('.reader-paragraph')) : [];
        const index = paragraphs.indexOf(paragraph);
        return {
          beforeContext: index > 0 ? paragraphText(paragraphs[index - 1]) : '',
          afterContext: index >= 0 && index < paragraphs.length - 1 ? paragraphText(paragraphs[index + 1]) : '',
        };
      };

      const blockPanelForReader = (reader) => {
        const workbenchId = reader?.dataset?.workbenchId || '';
        return Array.from(document.querySelectorAll('[data-block-revision-panel]'))
          .find((panel) => panel.dataset.workbenchId === workbenchId);
      };

      const readerForWorkbench = (workbenchId) => (
        Array.from(document.querySelectorAll('[data-block-reader]'))
          .find((reader) => reader.dataset.workbenchId === workbenchId)
      );

      const fillBlockRevisionForm = (reader, payload, options = {}) => {
        const panel = blockPanelForReader(reader);
        if (!panel) return;
        const form = panel.querySelector('[data-block-revision-form]');
        if (!form) return;
        const actionSelect = form.querySelector('[data-block-action-select]');
        const preview = form.querySelector('[data-block-selected-preview]');
        const feedback = form.querySelector('[data-block-revision-feedback]');
        const state = panel.querySelector('[data-block-panel-state]');
        const selectedText = String(payload.selectedText || '').trim();
        if (actionSelect) actionSelect.value = payload.actionType || 'modify';
        form.querySelector('[data-block-selected-text]').value = selectedText;
        form.querySelector('[data-block-paragraph-start]').value = payload.paragraphStart || '';
        form.querySelector('[data-block-paragraph-end]').value = payload.paragraphEnd || payload.paragraphStart || '';
        form.querySelector('[data-block-selection-start]').value = payload.selectionStartOffset ?? '';
        form.querySelector('[data-block-selection-end]').value = payload.selectionEndOffset ?? '';
        form.querySelector('[data-block-anchor-prefix]').value = payload.anchorPrefix || '';
        form.querySelector('[data-block-anchor-suffix]').value = payload.anchorSuffix || '';
        form.querySelector('[data-block-before-context]').value = payload.beforeContext || '';
        form.querySelector('[data-block-after-context]').value = payload.afterContext || '';
        if (preview) {
          const actionName = blockActionNames[payload.actionType || 'modify'] || '局部修订';
          const scope = payload.paragraphStart ? 'P' + payload.paragraphStart + (payload.paragraphEnd && payload.paragraphEnd !== payload.paragraphStart ? '-P' + payload.paragraphEnd : '') : '选区';
          preview.textContent = selectedText ? actionName + ' / ' + scope + '\\n' + selectedText : '未选择片段';
          preview.classList.toggle('has-selection', Boolean(selectedText));
        }
        if (feedback && !options.silent) {
          feedback.textContent = '已锁定选区，填写要求后即可生成局部建议。';
          feedback.classList.remove('is-error');
          feedback.classList.add('is-success');
        }
        if (state) {
          const actionName = blockActionNames[payload.actionType || 'modify'] || '局部修订';
          state.textContent = actionName;
        }
        if (options.open !== false) openBlockPanel(panel);
        const instruction = form.querySelector('textarea[name="instruction"]');
        if (instruction && options.focus !== false) window.setTimeout(() => instruction.focus(), 120);
      };

      const assistantPanelForReader = (reader) => {
        const workbenchId = reader?.dataset?.workbenchId || '';
        return Array.from(document.querySelectorAll('[data-review-assistant-panel]'))
          .find((panel) => panel.dataset.workbenchId === workbenchId);
      };

      const setAssistantMode = (form, mode) => {
        const radio = form?.querySelector('input[name="mode"][value="' + mode + '"]');
        if (radio) radio.checked = true;
      };

      const fillAssistantFromSelection = (reader, payload, mode = 'selection_advice', options = {}) => {
        const panel = assistantPanelForReader(reader);
        const form = panel?.querySelector('[data-review-assistant-form]');
        if (!panel || !form) return;
        const selectedText = String(payload.selectedText || '').trim();
        form.querySelector('[data-assistant-selected-text]').value = selectedText;
        form.querySelector('[data-assistant-paragraph-start]').value = payload.paragraphStart || '';
        form.querySelector('[data-assistant-paragraph-end]').value = payload.paragraphEnd || payload.paragraphStart || '';
        form.querySelector('[data-assistant-selection-start]').value = payload.selectionStartOffset ?? '';
        form.querySelector('[data-assistant-selection-end]').value = payload.selectionEndOffset ?? '';
        form.querySelector('[data-assistant-anchor-prefix]').value = payload.anchorPrefix || '';
        form.querySelector('[data-assistant-anchor-suffix]').value = payload.anchorSuffix || '';
        setAssistantMode(form, mode);
        const preview = form.querySelector('[data-assistant-selection-preview]');
        if (preview) {
          const scope = payload.paragraphStart ? 'P' + payload.paragraphStart + (payload.paragraphEnd && payload.paragraphEnd !== payload.paragraphStart ? '-P' + payload.paragraphEnd : '') : '选区';
          preview.textContent = selectedText ? scope + '\\n' + selectedText : '未绑定选区；可直接问整章问题。';
          preview.classList.toggle('has-selection', Boolean(selectedText));
        }
        const question = form.querySelector('textarea[name="question"]');
        if (question && options.updateQuestion !== false && !question.value.trim()) {
          question.value = mode === 'selection_advice'
            ? '请针对当前选区给我局部修改建议，不要重写整章。'
            : '请检查当前选区与前后文是否存在连续性或动机问题。';
        }
        if (options.scroll !== false) panel.scrollIntoView({block: 'nearest'});
        if (question && options.focus !== false) window.setTimeout(() => question.focus(), 80);
      };

      const syncSelectionContext = (reader, payload) => {
        if (!reader || !payload) return;
        fillBlockRevisionForm(reader, payload, {open: false, focus: false, silent: true});
        fillAssistantFromSelection(reader, payload, 'selection_advice', {
          focus: false,
          scroll: false,
          updateQuestion: false,
        });
      };

      const textFromAssistantAction = (action) => (
        String(action?.instruction || action?.label || action?.detail || '').trim()
      );

      const renderAssistantResult = (container, payload, form) => {
        if (!container) return;
        container.replaceChildren();
        const answer = document.createElement('div');
        answer.className = 'assistant-answer';
        const answerTitle = document.createElement('strong');
        answerTitle.textContent = payload.ok === false ? '助手未完成' : '助手回答';
        const answerText = document.createElement('p');
        answerText.textContent = payload.answer || '没有返回可用回答。';
        answer.append(answerTitle, answerText);
        container.appendChild(answer);

        const appendList = (title, items, formatter) => {
          if (!Array.isArray(items) || !items.length) return;
          const section = document.createElement('section');
          section.className = 'assistant-section';
          const h4 = document.createElement('h4');
          h4.textContent = title;
          const ul = document.createElement('ul');
          items.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = formatter(item);
            ul.appendChild(li);
          });
          section.append(h4, ul);
          container.appendChild(section);
        };

        appendList('发现', payload.findings, (item) => [item.severity, item.type, item.description, item.evidence].filter(Boolean).join(' / '));
        appendList('建议', payload.suggestions, (item) => [item.title, item.detail].filter(Boolean).join('：'));
        appendList('依据', payload.source_refs, (item) => [item.source_type, item.label, item.quote].filter(Boolean).join(' / '));

        const bridgeLabels = {
          create_block_revision: '转为局部修订',
          record_human_note: '记录为人工意见',
          create_fact_draft: '复制事实草稿',
        };
        const actions = Array.isArray(payload.suggested_actions)
          ? payload.suggested_actions
            .filter((item) => bridgeLabels[item.action_type])
            .slice(0, 3)
          : [];
        if (actions.length) {
          const row = document.createElement('div');
          row.className = 'assistant-action-row';
          actions.forEach((action) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = bridgeLabels[action.action_type] || action.label || '使用建议';
            if (action.action_type === 'create_block_revision') button.className = 'primary';
            button.addEventListener('click', async () => {
              const selectedText = form.querySelector('[data-assistant-selected-text]')?.value || '';
              const instruction = textFromAssistantAction(action) || payload.answer || '';
              if (action.action_type === 'create_block_revision') {
                const reader = document.querySelector('[data-block-reader]');
                if (!reader || !selectedText.trim()) {
                  showToast('无法转为局部修订', '请先在正文中选择一个片段，再询问助手。', true);
                  return;
                }
                fillBlockRevisionForm(reader, {
                  selectedText,
                  paragraphStart: form.querySelector('[data-assistant-paragraph-start]')?.value || '',
                  paragraphEnd: form.querySelector('[data-assistant-paragraph-end]')?.value || '',
                  selectionStartOffset: form.querySelector('[data-assistant-selection-start]')?.value || '',
                  selectionEndOffset: form.querySelector('[data-assistant-selection-end]')?.value || '',
                  anchorPrefix: form.querySelector('[data-assistant-anchor-prefix]')?.value || '',
                  anchorSuffix: form.querySelector('[data-assistant-anchor-suffix]')?.value || '',
                  beforeContext: '',
                  afterContext: '',
                  actionType: 'modify',
                });
                const blockForm = blockPanelForReader(reader)?.querySelector('[data-block-revision-form]');
                const textarea = blockForm?.querySelector('textarea[name="instruction"]');
                if (textarea) textarea.value = instruction;
                showToast('已预填局部修订', '确认提交后才会生成局部修订建议。');
                return;
              }
              if (action.action_type === 'record_human_note') {
                document.querySelectorAll('form.actions textarea[name="comment"]').forEach((textarea) => {
                  textarea.value = instruction || payload.answer || '';
                });
                const drawer = document.querySelector('[data-review-decision-drawer]');
                if (drawer && !drawer.open) {
                  if (typeof drawer.showModal === 'function') drawer.showModal();
                  else drawer.setAttribute('open', '');
                }
                showToast('已填入人工意见', '提交审核决策前仍可继续编辑。');
                return;
              }
              if (action.action_type === 'create_fact_draft') {
                const value = instruction || JSON.stringify(action.payload || {});
                try {
                  await navigator.clipboard.writeText(value);
                  showToast('事实建议已复制', '到项目事实库表单中粘贴确认后再保存。');
                } catch (error) {
                  showToast('事实建议', value, false);
                }
              }
            });
            row.appendChild(button);
          });
          container.appendChild(row);
        }
      };

      const hideSelectionToolbar = () => {
        document.querySelectorAll('[data-selection-toolbar]').forEach((toolbar) => {
          toolbar.hidden = true;
        });
        document.querySelectorAll('.reader-paragraph.is-selection-anchor').forEach((paragraph) => {
          paragraph.classList.remove('is-selection-anchor');
        });
      };

      const captureSelectionForReader = (reader) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
        const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode?.parentElement;
        if (!reader.contains(anchor) || !reader.contains(focus)) return null;
        const range = selection.getRangeAt(0);
        const paragraphs = Array.from(reader.querySelectorAll('.reader-paragraph'));
        const touched = paragraphs.filter((paragraph) => {
          const textNode = paragraph.querySelector('[data-paragraph-text]');
          return textNode && range.intersectsNode(textNode);
        });
        if (!touched.length) return null;
        const first = touched[0];
        const last = touched[touched.length - 1];
        const firstSlice = rangeSliceForParagraph(first, range);
        const lastSlice = first === last ? firstSlice : rangeSliceForParagraph(last, range);
        const selectionStartOffset = paragraphBodyStart(first) + firstSlice.start;
        const selectionEndOffset = paragraphBodyStart(last) + lastSlice.end;
        const bodyText = chapterBodyForReader(reader);
        const selectedText = (bodyText
          ? bodyText.slice(selectionStartOffset, selectionEndOffset)
          : touched.map((paragraph) => paragraphText(paragraph)).join('\\n')
        ).trim();
        if (!selectedText) return null;
        const firstNo = Number(first.dataset.paragraphNo || 0);
        const lastNo = Number(last.dataset.paragraphNo || firstNo);
        const before = paragraphText(paragraphs[Math.max(0, paragraphs.indexOf(first) - 1)]);
        const after = paragraphText(paragraphs[Math.min(paragraphs.length - 1, paragraphs.indexOf(last) + 1)]);
        const selectionAnchor = anchorAroundSelection(reader, selectionStartOffset, selectionEndOffset);
        const rangeRect = range.getBoundingClientRect();
        const firstClientRect = Array.from(range.getClientRects())[0];
        const rect = rangeRect.width || rangeRect.height ? rangeRect : firstClientRect;
        if (!rect) return null;
        return {
          reader,
          selectedText,
          paragraphStart: firstNo || '',
          paragraphEnd: lastNo || firstNo || '',
          selectionStartOffset,
          selectionEndOffset,
          anchorPrefix: selectionAnchor.prefix,
          anchorSuffix: selectionAnchor.suffix,
          beforeContext: paragraphs.indexOf(first) > 0 ? before : '',
          afterContext: paragraphs.indexOf(last) < paragraphs.length - 1 ? after : '',
          rect,
        };
      };

      const showSelectionToolbar = (selectionPayload) => {
        if (!selectionPayload) {
          hideSelectionToolbar();
          return;
        }
        activeBlockSelection = selectionPayload;
        syncSelectionContext(selectionPayload.reader, selectionPayload);
        const toolbar = selectionPayload.reader.parentElement?.querySelector('[data-selection-toolbar]');
        if (!toolbar) return;
        const summary = toolbar.querySelector('[data-selection-summary]');
        const paragraphs = Array.from(selectionPayload.reader.querySelectorAll('.reader-paragraph'));
        paragraphs.forEach((paragraph) => {
          const paragraphNo = Number(paragraph.dataset.paragraphNo || 0);
          paragraph.classList.toggle(
            'is-selection-anchor',
            paragraphNo >= Number(selectionPayload.paragraphStart || 0)
              && paragraphNo <= Number(selectionPayload.paragraphEnd || selectionPayload.paragraphStart || 0)
          );
        });
        if (summary) {
          const scope = 'P' + selectionPayload.paragraphStart
            + (selectionPayload.paragraphEnd && selectionPayload.paragraphEnd !== selectionPayload.paragraphStart ? '-P' + selectionPayload.paragraphEnd : '');
          summary.textContent = '已选 ' + scope;
        }
        toolbar.hidden = false;
        const maxLeft = Math.max(12, window.innerWidth - toolbar.offsetWidth - 12);
        const left = Math.min(Math.max(12, selectionPayload.rect.left), maxLeft);
        const preferredTop = selectionPayload.rect.top - toolbar.offsetHeight - 10;
        const fallbackTop = selectionPayload.rect.bottom + 10;
        const maxTop = Math.max(12, window.innerHeight - toolbar.offsetHeight - 12);
        const top = Math.min(Math.max(12, preferredTop > 12 ? preferredTop : fallbackTop), maxTop);
        toolbar.style.left = left + 'px';
        toolbar.style.top = top + 'px';
      };

      const readers = Array.from(document.querySelectorAll('[data-block-reader]'));
      const updateSelectionFromDocument = () => {
        window.setTimeout(() => {
          const payload = readers.map((reader) => captureSelectionForReader(reader)).find(Boolean);
          showSelectionToolbar(payload || null);
        }, 0);
      };

      readers.forEach((reader) => {
        const updateSelection = () => {
          window.setTimeout(() => showSelectionToolbar(captureSelectionForReader(reader)), 0);
        };
        reader.addEventListener('mouseup', updateSelection);
        reader.addEventListener('keyup', updateSelection);
        reader.addEventListener('touchend', () => hideSelectionToolbar());
      });
      document.addEventListener('mouseup', updateSelectionFromDocument);
      document.addEventListener('keyup', updateSelectionFromDocument);
      document.addEventListener('selectionchange', () => {
        window.clearTimeout(window.__novelBlockSelectionTimer);
        window.__novelBlockSelectionTimer = window.setTimeout(updateSelectionFromDocument, 80);
      });

      document.querySelectorAll('[data-selection-action]').forEach((button) => {
        button.addEventListener('click', () => {
          if (!activeBlockSelection) return;
          hideSelectionToolbar();
          fillBlockRevisionForm(activeBlockSelection.reader, {
            ...activeBlockSelection,
            actionType: button.dataset.selectionAction || 'modify',
          });
        });
      });

      document.querySelectorAll('[data-selection-assistant]').forEach((button) => {
        button.addEventListener('click', () => {
          if (!activeBlockSelection) return;
          hideSelectionToolbar();
          fillAssistantFromSelection(activeBlockSelection.reader, activeBlockSelection, 'selection_advice');
        });
      });

      document.querySelectorAll('[data-selection-manual-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          hideSelectionToolbar();
          const drawer = document.querySelector('.manual-edit-drawer');
          if (!drawer) return;
          if (typeof drawer.showModal === 'function') drawer.showModal();
          else drawer.setAttribute('open', '');
        });
      });

      document.querySelectorAll('[data-mobile-open-assistant]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = document.getElementById(button.dataset.mobileOpenAssistant || '');
          if (target) target.scrollIntoView({block: 'start'});
        });
      });

      document.querySelectorAll('[data-mobile-open-revision]').forEach((button) => {
        button.addEventListener('click', () => {
          const panel = document.getElementById(button.dataset.mobileOpenRevision || '');
          if (!panel) return;
          openBlockPanel(panel);
          panel.scrollIntoView({block: 'nearest'});
        });
      });

      document.querySelectorAll('[data-assistant-quick]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('[data-review-assistant-form]');
          if (!form) return;
          setAssistantMode(form, button.dataset.assistantQuick || 'continuity');
          const question = form.querySelector('textarea[name="question"]');
          if (question) {
            question.value = button.dataset.question || '';
            question.focus();
          }
        });
      });

      document.querySelectorAll('[data-polish-block-instruction]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('[data-block-revision-form]');
          const panel = button.closest('[data-block-revision-panel]');
          const reader = readerForWorkbench(panel?.dataset?.workbenchId || '') || document.querySelector('[data-block-reader]');
          if (!form || !reader) return;
          const selectedText = String(form.querySelector('[data-block-selected-text]')?.value || '').trim();
          const instruction = String(form.querySelector('textarea[name="instruction"]')?.value || '').trim();
          if (!selectedText) {
            showToast('还没有选区', '请先在正文里选中一段，再让助手整理要求。', true);
            return;
          }
          fillAssistantFromSelection(reader, {
            selectedText,
            paragraphStart: form.querySelector('[data-block-paragraph-start]')?.value || '',
            paragraphEnd: form.querySelector('[data-block-paragraph-end]')?.value || '',
            selectionStartOffset: form.querySelector('[data-block-selection-start]')?.value || '',
            selectionEndOffset: form.querySelector('[data-block-selection-end]')?.value || '',
            anchorPrefix: form.querySelector('[data-block-anchor-prefix]')?.value || '',
            anchorSuffix: form.querySelector('[data-block-anchor-suffix]')?.value || '',
          }, 'selection_advice');
          const assistantForm = assistantPanelForReader(reader)?.querySelector('[data-review-assistant-form]');
          const question = assistantForm?.querySelector('textarea[name="question"]');
          if (question) {
            question.value = '请把下面这条局部修订要求整理成更清楚、可执行的改稿指令，只输出指令要点，不直接改正文。\\n\\n原要求：' + (instruction || '我还没写清楚，请根据选区帮我提出一个清晰改法。');
            question.focus();
          }
          showToast('已切到剧情助手', '确认问题后再询问助手，整理结果可转回局部修订。');
        });
      });

      document.querySelectorAll('[data-block-risk-assistant]').forEach((button) => {
        button.addEventListener('click', () => {
          const reader = document.querySelector('[data-block-reader]');
          if (!reader) return;
          const selectedText = button.dataset.selectedText || '';
          fillAssistantFromSelection(reader, {
            selectedText,
            paragraphStart: button.dataset.paragraphStart || '',
            paragraphEnd: button.dataset.paragraphEnd || button.dataset.paragraphStart || '',
            selectionStartOffset: button.dataset.selectionStart || '',
            selectionEndOffset: button.dataset.selectionEnd || '',
            anchorPrefix: button.dataset.anchorPrefix || '',
            anchorSuffix: button.dataset.anchorSuffix || '',
          }, 'continuity');
          const assistantForm = assistantPanelForReader(reader)?.querySelector('[data-review-assistant-form]');
          const question = assistantForm?.querySelector('textarea[name="question"]');
          if (question) {
            question.value = '请检查这条局部修订如果应用，是否会影响后文连续性、伏笔、人物动机或事实库。请列出风险和需要补救的动作。\\n\\n局部修订要求：' + (button.dataset.instruction || '未记录');
            question.focus();
          }
          showToast('已切到剧情助手', '可以让助手先做影响检查，再决定是否应用建议。');
        });
      });

      document.querySelectorAll('[data-review-assistant-form]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const question = String(form.querySelector('textarea[name="question"]')?.value || '').trim();
          const feedback = form.querySelector('[data-assistant-feedback]');
          const result = form.closest('[data-review-assistant-panel]')?.querySelector('[data-assistant-result]');
          const button = event.submitter || form.querySelector('button[type="submit"]');
          if (!question) {
            if (feedback) {
              feedback.textContent = '请先填写要问助手的问题。';
              feedback.classList.add('is-error');
            }
            return;
          }
          const originalText = button?.textContent || '询问助手';
          if (feedback) {
            feedback.textContent = '正在询问助手...';
            feedback.classList.remove('is-error', 'is-success');
          }
          if (button) {
            button.disabled = true;
            button.textContent = '询问中...';
          }
          try {
            const requestBody = new FormData(form);
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const payload = await response.json().catch(() => null);
            if (!payload) throw new Error('审稿助手返回了不可解析的响应。');
            if (payload.thread_id) {
              const threadInput = form.querySelector('[data-assistant-thread-id]');
              if (threadInput) threadInput.value = payload.thread_id;
            }
            renderAssistantResult(result, payload, form);
            if (!response.ok || payload.ok === false) {
              throw new Error(payload.answer || '审稿助手调用失败。');
            }
            if (feedback) {
              feedback.textContent = '助手已返回；建议动作只会预填，不会直接改稿。';
              feedback.classList.add('is-success');
            }
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || '审稿助手暂时不可用。';
              feedback.classList.add('is-error');
            }
            showToast('审稿助手未完成', error.message || '请稍后重试。', true);
          } finally {
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });

      document.querySelectorAll('.reader-paragraph').forEach((paragraph) => {
        paragraph.addEventListener('dblclick', (event) => {
          if (event.target.closest('button, a, textarea, input, select, [data-inline-edit-form]')) return;
          startInlineParagraphEdit(paragraph);
        });
      });

      document.querySelectorAll('[data-revise-paragraph]').forEach((button) => {
        button.addEventListener('click', () => {
          const paragraph = button.closest('.reader-paragraph');
          const reader = button.closest('[data-block-reader]');
          if (!paragraph || !reader) return;
          const context = paragraphContext(paragraph);
          const paragraphNo = Number(paragraph.dataset.paragraphNo || 0);
          const selectionStartOffset = paragraphBodyStart(paragraph);
          const selectionEndOffset = paragraphBodyEnd(paragraph);
          const selectionAnchor = anchorAroundSelection(reader, selectionStartOffset, selectionEndOffset);
          hideSelectionToolbar();
          fillBlockRevisionForm(reader, {
            selectedText: paragraphText(paragraph),
            paragraphStart: paragraphNo,
            paragraphEnd: paragraphNo,
            selectionStartOffset,
            selectionEndOffset,
            anchorPrefix: selectionAnchor.prefix,
            anchorSuffix: selectionAnchor.suffix,
            beforeContext: context.beforeContext,
            afterContext: context.afterContext,
            actionType: button.dataset.actionType || 'modify',
          });
        });
      });

      document.addEventListener('mousedown', (event) => {
        if (!event.target.closest('[data-selection-toolbar]') && !event.target.closest('[data-block-reader]')) {
          hideSelectionToolbar();
        }
      });

      document.querySelectorAll('form.actions button[name="action"]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          if (form) form.dataset.pendingAction = button.value || '';
        });
      });

      document.querySelectorAll('form.actions').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = event.submitter || form.querySelector('button[name="action"][value="' + (form.dataset.pendingAction || '') + '"]') || form.querySelector('button[type="submit"]');
          const action = button?.value || form.dataset.pendingAction || '';
          const comment = String(form.querySelector('textarea')?.value || '').trim();
          let message = messages[action] || '确认提交审核操作？';
          if (!comment && action === 'request_rewrite') {
            message += '\\n\\n未填写人工补充意见，将按智能审稿的问题与建议重写。继续吗？';
          }
          if (!comment && action === 'reject') {
            message += '\\n\\n你还没有填写审核意见，后续追踪会比较困难。仍要继续吗？';
          }
          if (!window.confirm(message)) {
            return;
          }
          const originalText = button?.textContent || '提交';
          if (button) {
            button.disabled = true;
            button.textContent = '提交中...';
          }
          try {
            const body = new FormData(form);
            if (button?.name && !body.has(button.name)) body.append(button.name, button.value || '');
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '审核操作失败：HTTP ' + response.status));
            }
            const targetHref = resultPrimaryHrefFromHtml(html, '/webhook/novel-review-list');
            showToast('审核决策已提交', action === 'rerun_review' ? '正在打开审稿队列...' : '正在返回审核列表...');
            window.setTimeout(() => {
              window.location.href = targetHref;
            }, 450);
          } catch (error) {
            showToast('审核操作未完成', error.message || '提交失败，请稍后重试。', true);
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });

      document.querySelectorAll('form[data-block-revision-form]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const selectedText = String(form.querySelector('[data-block-selected-text]')?.value || '').trim();
          const instruction = String(form.querySelector('textarea[name="instruction"]')?.value || '').trim();
          const feedback = form.querySelector('[data-block-revision-feedback]');
          const button = event.submitter || form.querySelector('button[type="submit"]');
          if (!selectedText) {
            if (feedback) {
              feedback.textContent = '请先在正文中选择一个片段。';
              feedback.classList.add('is-error');
              feedback.classList.remove('is-success');
            }
            return;
          }
          if (!instruction) {
            if (feedback) {
              feedback.textContent = '请填写局部修订要求。';
              feedback.classList.add('is-error');
              feedback.classList.remove('is-success');
            }
            return;
          }
          const originalText = button?.textContent || '提交';
          if (feedback) {
            feedback.textContent = '正在创建局部修订任务...';
            feedback.classList.remove('is-error', 'is-success');
          }
          if (button) {
            button.disabled = true;
            button.textContent = '生成中...';
          }
          try {
            const requestBody = new FormData(form);
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '局部修订创建失败：HTTP ' + response.status));
            }
            if (feedback) {
              feedback.textContent = '局部修订任务已创建，正在刷新建议列表...';
              feedback.classList.add('is-success');
            }
            showToast('局部修订已提交', '正在刷新审核详情...');
            window.setTimeout(() => {
              window.location.href = window.location.pathname + window.location.search;
            }, 650);
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || '局部修订提交失败，请稍后重试。';
              feedback.classList.add('is-error');
            }
            showToast('局部修订未完成', error.message || '提交失败，请稍后重试。', true);
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });

      document.querySelectorAll('[data-enable-block-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('[data-block-revision-apply]');
          const textarea = form?.querySelector('[data-block-replacement]');
          const editedApply = form?.querySelector('[data-apply-edited]');
          const reset = form?.querySelector('[data-reset-block-edit]');
          const applyOriginal = form?.querySelector('[data-apply-original]');
          if (!form || !textarea) return;
          form.classList.add('is-editing');
          textarea.readOnly = false;
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          button.hidden = true;
          if (applyOriginal) applyOriginal.hidden = true;
          if (editedApply) editedApply.hidden = false;
          if (reset) reset.hidden = false;
        });
      });

      document.querySelectorAll('[data-reset-block-edit]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('[data-block-revision-apply]');
          const textarea = form?.querySelector('[data-block-replacement]');
          const edit = form?.querySelector('[data-enable-block-edit]');
          const editedApply = form?.querySelector('[data-apply-edited]');
          const applyOriginal = form?.querySelector('[data-apply-original]');
          if (!form || !textarea) return;
          textarea.value = textarea.dataset.originalReplacement || '';
          textarea.readOnly = true;
          form.classList.remove('is-editing');
          if (edit) edit.hidden = false;
          if (editedApply) editedApply.hidden = true;
          if (applyOriginal) applyOriginal.hidden = false;
          button.hidden = true;
        });
      });

      document.querySelectorAll('form[data-block-revision-apply] button[name="action"]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          if (form) form.dataset.pendingAction = button.value || '';
        });
      });

      document.querySelectorAll('form[data-block-revision-apply]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = event.submitter || form.querySelector('button[name="action"][value="' + (form.dataset.pendingAction || '') + '"]') || form.querySelector('button[type="submit"]');
          const action = button?.value || form.dataset.pendingAction || 'apply';
          const replacement = String(form.querySelector('textarea[name="replacement_text"]')?.value || '').trim();
          if (action === 'apply_edited' && !replacement) {
            showToast('局部修订未完成', '修改后应用时，建议文本不能为空。', true);
            return;
          }
          if (!window.confirm(blockApplyMessages[action] || '确认处理这条局部修订？')) {
            return;
          }
          const originalText = button?.textContent || '提交';
          const buttons = Array.from(form.querySelectorAll('button'));
          buttons.forEach((item) => { item.disabled = true; });
          if (button) button.textContent = '处理中...';
          try {
            const requestBody = new FormData(form);
            if (action === 'apply') requestBody.delete('replacement_text');
            if (button?.name && !requestBody.has(button.name)) requestBody.append(button.name, button.value || '');
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '局部修订处理失败：HTTP ' + response.status));
            }
            const currentHref = window.location.pathname + window.location.search;
            const detailHref = resultPrimaryHrefFromHtml(html, currentHref);
            const targetHref = action === 'request_rewrite' ? '/webhook/novel-review-list' : detailHref;
            const keepsEditing = action === 'apply' || action === 'apply_edited';
            if (keepsEditing) rememberReviewSaveScroll(targetHref);
            showToast('局部修订已处理', keepsEditing ? '正在打开新的候选稿继续修改...' : (action === 'request_rewrite' ? '正在返回审核列表...' : '正在刷新审核详情...'));
            window.setTimeout(() => {
              window.location.href = targetHref;
            }, 650);
          } catch (error) {
            showToast('局部修订未完成', error.message || '处理失败，请稍后重试。', true);
            buttons.forEach((item) => { item.disabled = false; });
            if (button) button.textContent = originalText;
          }
        });
      });

      const liveBlockCards = Array.from(document.querySelectorAll('[data-block-status="PENDING"], [data-block-status="RUNNING"]'));
      if (liveBlockCards.length) {
        let secondsLeft = 4;
        const updateLiveCountdown = () => {
          liveBlockCards.forEach((card) => {
            const node = card.querySelector('[data-block-refresh-countdown]');
            if (node) node.textContent = '建议仍在生成中，' + secondsLeft + ' 秒后自动刷新。';
          });
        };
        updateLiveCountdown();
        const timer = window.setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft <= 0) {
            window.clearInterval(timer);
            window.location.href = window.location.pathname + window.location.search;
            return;
          }
          updateLiveCountdown();
        }, 1000);
      }

      document.querySelectorAll('form[data-review-manual-edit] button[name="decision"]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          if (form) form.dataset.pendingDecision = button.value || '';
        });
      });

      document.querySelectorAll('form[data-review-manual-edit]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const fallbackDecision = form.dataset.pendingDecision || 'save_only';
          const button = event.submitter
            || form.querySelector('button[name="decision"][value="' + fallbackDecision + '"]')
            || form.querySelector('button[name="decision"][value="save_only"]')
            || form.querySelector('button[type="submit"]');
          const decision = button?.value || fallbackDecision;
          const body = String(form.querySelector('textarea[name="body"]')?.value || '').trim();
          const feedback = form.querySelector('[data-manual-edit-feedback]');
          if (!body) {
            if (feedback) {
              feedback.textContent = '正文不能为空。';
              feedback.classList.add('is-error');
              feedback.classList.remove('is-success');
            }
            return;
          }
          if (decision !== 'save_only' && !window.confirm(manualEditMessages[decision] || '确认保存人工改稿？')) {
            return;
          }
          const originalText = button?.textContent || '提交';
          if (feedback) {
            feedback.textContent = '正在保存人工改稿...';
            feedback.classList.remove('is-error', 'is-success');
          }
          if (button) {
            button.disabled = true;
            button.textContent = '保存中...';
          }
          try {
            const requestBody = new FormData(form);
            if (button?.name && !requestBody.has(button.name)) requestBody.append(button.name, button.value || '');
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '人工改稿保存失败：HTTP ' + response.status));
            }
            const bodyTextarea = form.querySelector('textarea[name="body"]');
            const savedParagraphNo = paragraphNoFromTextareaCaret(bodyTextarea);
            const targetHref = decision === 'save_only'
              ? resultPrimaryHrefFromHtml(html, window.location.pathname + window.location.search)
              : '/webhook/novel-review-list';
            if (decision === 'save_only') rememberReviewSaveScroll(targetHref, {paragraphNo: savedParagraphNo});
            if (feedback) {
              feedback.textContent = decision === 'save_only'
                ? '已保存为新的待审候选稿，正在继续修改...'
              : (decision === 'approve' ? '已保存并通过，正在返回审核列表...' : '已保存并重新审稿，正在返回审核列表...');
              feedback.classList.add('is-success');
            }
            showToast('人工改稿已保存', decision === 'save_only' ? '正在留在当前章节继续修改...' : '正在返回审核列表...');
            window.setTimeout(() => {
              window.location.href = targetHref;
            }, 450);
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || '保存失败，请稍后重试。';
              feedback.classList.add('is-error');
            }
            showToast('人工改稿未完成', error.message || '保存失败，请稍后重试。', true);
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

return [{json: {html}}];
