// n8n Code node: Validate Novel Review Block Revision Request
// Only accepts POST body fields from /webhook/novel-review-block-revise.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('局部修订必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('局部修订必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function integerOrEmpty(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
}

function offsetOrEmpty(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

const chapterId = text(body.chapter_id || body.id);
const reviewToken = text(body.review_token || body.token);
const rawAction = text(body.action_type || body.action || 'modify').toLowerCase();
const selectedText = text(body.selected_text || body.selection || body.original_text);
const instruction = text(body.instruction || body.comment || body.requirement);
const beforeContext = text(body.before_context || body.context_before);
const afterContext = text(body.after_context || body.context_after);
const paragraphStart = integerOrEmpty(body.paragraph_start || body.paragraph_no || body.paragraph);
const paragraphEnd = integerOrEmpty(body.paragraph_end || body.paragraph_no || body.paragraph);
const selectionStartOffset = offsetOrEmpty(body.selection_start_offset || body.start_offset);
const selectionEndOffset = offsetOrEmpty(body.selection_end_offset || body.end_offset);
const anchorPrefix = text(body.anchor_prefix || body.selection_prefix);
const anchorSuffix = text(body.anchor_suffix || body.selection_suffix);
const rawRangeLock = text(body.range_lock || 'selection_only').toLowerCase();
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

const actionMap = {
  modify: 'modify',
  revise: 'modify',
  edit: 'modify',
  direct_modify: 'modify',
  '定向修改': 'modify',
  expand: 'expand',
  extend: 'expand',
  '扩写': 'expand',
  condense: 'condense',
  compress: 'condense',
  shorten: 'condense',
  '压缩': 'condense',
  polish: 'polish',
  refine: 'polish',
  '润色': 'polish',
  continue: 'continue',
  append: 'continue',
  '续写': 'continue',
  logic_fix: 'logic_fix',
  logic: 'logic_fix',
  fix_logic: 'logic_fix',
  '逻辑修补': 'logic_fix',
  custom: 'custom',
};

const rangeLockMap = {
  selection_only: 'selection_only',
  selection: 'selection_only',
  locked: 'selection_only',
  adjacent_one: 'adjacent_one',
  adjacent: 'adjacent_one',
  flag_later: 'flag_later',
  later: 'flag_later',
};

const actionType = actionMap[rawAction];
const rangeLock = rangeLockMap[rawRangeLock] || 'selection_only';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) {
  throw new Error(`无效 chapter_id：${chapterId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝创建局部修订。');
}

if (!actionType) {
  throw new Error(`无效局部修订类型：${rawAction || '(empty)'}`);
}

if (!selectedText) {
  throw new Error('请先选择需要局部修订的原文。');
}

if (!instruction) {
  throw new Error('请填写局部修订要求。');
}

return [{
  json: {
    chapter_id: chapterId,
    review_token: reviewToken,
    action_type: actionType,
    selected_text: selectedText,
    instruction,
    paragraph_start: paragraphStart,
    paragraph_end: paragraphEnd || paragraphStart,
    selection_start_offset: selectionStartOffset,
    selection_end_offset: selectionEndOffset,
    anchor_prefix: anchorPrefix,
    anchor_suffix: anchorSuffix,
    before_context: beforeContext,
    after_context: afterContext,
    range_lock: rangeLock,
    reviewer,
    action: 'REQUEST_BLOCK_REVISION',
  },
}];
