#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function runCodeNode(relativePath, rows = [], json = {}) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $json: json,
    $input: {
      all: () => rows.map((row) => ({json: row})),
    },
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    URLSearchParams,
    encodeURIComponent,
  };
  vm.createContext(sandbox);
  return script.runInContext(sandbox);
}

function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertNoGetWriteLinks(html, label) {
  assert(
    !/href=["'][^"']*(novel-project-create|novel-project-continue|novel-project-regenerate|novel-generate-treatment-now|novel-generate-bible-now|novel-generate-outline-now|novel-generate-chapter-now|novel-chapter-rewrite-request|novel-rewrite-start|novel-review-remind|novel-bible-update|novel-outline-update|novel-project-targets-update|novel-project-status-toggle|novel-chapter-manual-edit|novel-project-archive-toggle|novel-archived-projects-cleanup|novel-project-fact-action|novel-stale-chapters-cleanup|novel-review-action|novel-review-manual-edit)/i.test(html),
    `${label} must not expose write actions as GET links`
  );
}

function assertStickyContext(html, label) {
  assert(html.includes('class="page-context"'), `${label} should wrap title/breadcrumb in fixed page context`);
  assert(html.includes('.page-context { position: sticky;'), `${label} should keep page context sticky while scrolling`);
}

function assertFullWidthShell(html, label) {
  assert(html.includes('.app-shell > main { width: auto; max-width: none; margin: 24px 16px'), `${label} should fill the right admin workspace on wide or zoomed browsers`);
  assert(!/\.app-shell > main \{ width: min\((?:1120|1240)px/.test(html), `${label} should not cap desktop shell content width`);
}

const projectRows = [
  {
    id: '22000000-0000-0000-0000-000000000001',
    title: '待审项目',
    genre: '都市逆袭',
    audience: '中文读者',
    status: 'REVIEWING',
    current_chapter_no: 3,
    target_total_chapters: 10,
    approved_chapter_count: 2,
    need_review_count: 1,
    need_review_chapter_id: '22000000-0000-0000-0000-000000000011',
    need_review_token: 'phase22-review-token',
    need_review_chapter_no: 3,
    need_review_chapter_title: '雨夜重逢',
    waiting_job_count: 0,
    running_job_count: 0,
    failed_job_count: 0,
    latest_job_type: 'REVIEW_CHAPTER',
    latest_job_status: 'SUCCEEDED',
    latest_ai_run_type: 'REVIEW_CHAPTER',
    latest_ai_success: true,
    latest_ai_duration_ms: 1600,
    updated_at: '2026-05-04T01:00:00.000Z',
  },
  {
    id: '22000000-0000-0000-0000-000000000002',
    title: '失败项目',
    genre: '悬疑',
    audience: '中文读者',
    status: 'WRITING',
    current_chapter_no: 1,
    target_total_chapters: 8,
    approved_chapter_count: 1,
    waiting_job_count: 0,
    running_job_count: 0,
    failed_job_count: 1,
    latest_job_type: 'REWRITE_CHAPTER',
    latest_job_status: 'FAILED',
    latest_job_error_message: 'SERVERCHAN_SENDKEY is not configured',
    updated_at: '2026-05-04T01:10:00.000Z',
  },
  {
    id: '22000000-0000-0000-0000-000000000003',
    title: '可推进项目',
    genre: '奇幻',
    audience: '中文读者',
    status: 'OUTLINE_READY',
    current_chapter_no: 0,
    target_total_chapters: 6,
    approved_chapter_count: 0,
    waiting_job_count: 0,
    running_job_count: 0,
    failed_job_count: 0,
    updated_at: '2026-05-04T01:20:00.000Z',
  },
  {
    id: '22000000-0000-0000-0000-000000000005',
    title: '重写中项目',
    genre: '古言',
    audience: '中文读者',
    status: 'REVIEWING',
    current_chapter_no: 4,
    target_total_chapters: 20,
    approved_chapter_count: 3,
    need_review_count: 0,
    waiting_job_count: 0,
    running_job_count: 1,
    failed_job_count: 0,
    latest_job_type: 'REWRITE_CHAPTER',
    latest_job_status: 'RUNNING',
    updated_at: '2026-05-04T01:25:00.000Z',
  },
  {
    id: '22000000-0000-0000-0000-000000000004',
    title: '暂停项目',
    genre: '现实',
    audience: '中文读者',
    status: 'PAUSED',
    current_chapter_no: 1,
    target_total_chapters: 6,
    approved_chapter_count: 1,
    waiting_job_count: 0,
    running_job_count: 0,
    failed_job_count: 0,
  },
];

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', projectRows)[0].json.response_html;
const centerText = visibleText(centerHtml);
for (const expected of ['小说运营工作台', '今日行动指挥', '任务流：需要处理的项目', '系统健康', '可继续写作']) {
  assert(centerText.includes(expected), `workbench should include task-driven marker: ${expected}`);
}
for (const expected of ['app-sidebar', 'system-health-modal', 'data-open-dialog="system-health-modal"', '展开运行细节']) {
  assert(centerHtml.includes(expected), `workbench should expose redesigned interaction: ${expected}`);
}
assertStickyContext(centerHtml, 'workbench');
assertFullWidthShell(centerHtml, 'workbench');
assertNoGetWriteLinks(centerHtml, 'workbench');

const projectListHtml = runCodeNode('n8n/code/novel_render_project_list_html.js', projectRows)[0].json.response_html;
const projectListText = visibleText(projectListHtml);
for (const expected of ['小说项目管理', '下一步', '处理审核', '排查失败', '已暂停', '看日志', '打开项目', '一键清理已归档项目']) {
  assert(projectListText.includes(expected), `project list should include management marker: ${expected}`);
}
assert(projectListText.includes('重写中'), 'project list status badge should prefer an active rewrite job over the base review status');
assert(!projectListText.includes('重写中项目 古言 / 中文读者 进度 3 / 20 / 待处理 0 / 运行中 1 / 失败任务 0 待人工审核'), 'running rewrite projects should not show the base pending-review badge');
assert(projectListHtml.includes('data-project-filter="paused"'), 'project list should expose paused filter');
assert(projectListHtml.includes('method="POST" action="/webhook/novel-archived-projects-cleanup"'), 'project list archived cleanup should use POST');
for (const expected of ['app-sidebar', 'th-help', '“打开项目”就是查看控制台，可继续查看设定、大纲、正文、事实、日志和导出。', '查看概览与运行细节']) {
  assert(projectListHtml.includes(expected), `project list should reduce default layout with: ${expected}`);
}
assertStickyContext(projectListHtml, 'project list');
assertFullWidthShell(projectListHtml, 'project list');
for (const expected of ['data-pagination="projects"', 'data-page-size', 'data-page-prev', 'data-page-next']) {
  assert(projectListHtml.includes(expected), `project list should include basic pagination control: ${expected}`);
}
assertNoGetWriteLinks(projectListHtml, 'project list');

const detailRow = {
  is_empty: false,
  id: '22000000-0000-0000-0000-000000000001',
  title: '待审项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '主角逆袭。',
  status: 'REVIEWING',
  current_chapter_no: 1,
  target_total_chapters: 3,
  target_words_per_chapter: 1800,
  story_treatment: JSON.stringify({
    theme_core: '主角用阴阳引渡补上一句迟到的真相。',
    reader_promise: '每个案件都有民俗谜面、现实误导和情感兑现。',
    protagonist_inner_wound: '误判求救者造成旧案遗憾。',
    ending_payoff: '终局让红凶从诅咒变成守护证词。',
    mystery_stack: [{question: '红线为何缠住活人', misdirection: '厉鬼复仇', payoff: '活人替亡者藏证'}],
    reveal_ladder: [{stage: '开局', reveal: '红线只缠欠证之人'}],
    emotional_arc: [{chapter_range: '1-3', emotion: '惊疑到共情'}],
    symbolic_motifs: [{motif: '红线', meaning: '血债与引渡'}],
  }),
  bible: JSON.stringify({
    story_core: '主角回城翻盘。',
    main_character: {name: '陆明', aliases: ['阿明'], public_name: '陆师傅', identity: '旧城修表师', identity_note: '真实身份暂时隐藏', goal: '翻身'},
    supporting_characters: [{name: '许青', role: '盟友', relationship_with_mc: '互相信任'}],
    villain_setting: [{name: '赵衡', motivation: '控制旧城', conflict_with_mc: '争夺旧城控制权', threat_level: '高'}],
    selling_points: ['逆袭', '爽点'],
  }),
  outlines: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000022',
    chapter_no: 1,
    title: '第一章：旧城灯火',
    summary: '主角回城。',
    chapter_goal: '建立旧城债务谜面。',
    status: 'READY',
    scene_beats: [{
      beat_no: 1,
      beat_goal: '旧城雨夜入场',
      scene_image: '陆明撑伞走进旧街，钟楼灯光忽明忽暗',
      new_information: '旧城账本仍在暗格',
      emotional_shift: '戒备转为主动',
      reader_question: '旧城账本为什么还在？',
      do_not_reveal: true,
    }],
    reader_questions: ['旧城账本为什么还在？'],
  }]),
  chapters: JSON.stringify([
    {
      id: '22000000-0000-0000-0000-000000000021',
      chapter_no: 1,
      title: '第1章 旧城灯火',
      body: '第一章正文不应出现在默认总览。',
      summary: '主角回城。',
      word_count: 1200,
      status: 'NEED_REVIEW',
      generation_version: 1,
      is_current: false,
      review_token: 'phase22-detail-token',
      latest_review_report: {id: 'r22', total_score: 72, verdict: 'MANUAL_REVIEW'},
    },
  ]),
  facts: JSON.stringify([
    {id: '22000000-0000-0000-0000-000000000071', fact_type: 'character', fact_key: '主角身份', fact_value: '陆明隐藏真实身份。', status: 'ACTIVE', source: 'human', confidence: 1, chapter_no: 1, created_at: '2026-05-04T01:40:00.000Z'},
    {id: '22000000-0000-0000-0000-000000000072', fact_type: 'item', fact_key: '旧城账本', fact_value: '旧城账本仍藏在柜台暗格。', status: 'PENDING', source: 'ai', confidence: 0.7, chapter_no: 1, created_at: '2026-05-04T01:39:00.000Z'},
    {id: '22000000-0000-0000-0000-000000000073', fact_type: 'rule', fact_key: '过期规则', fact_value: '这条规则已经不再适用。', status: 'INACTIVE', source: 'human', confidence: 1, chapter_no: null, created_at: '2026-05-04T01:38:00.000Z'},
  ]),
  jobs: JSON.stringify([
    {id: '22000000-0000-0000-0000-000000000041', job_type: 'REWRITE_CHAPTER', status: 'PENDING', chapter_no: 2, attempt_count: 1, max_attempts: 3, error_message: '上次网络错误', updated_at: '2026-05-04T01:35:00.000Z'},
    {job_type: 'REVIEW_CHAPTER', status: 'FAILED', chapter_no: 1, attempt_count: 1, error_message: '测试失败', updated_at: '2026-05-04T01:30:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
};

const detailOverviewHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [detailRow])[0].json.response_html;
const detailOverviewText = visibleText(detailOverviewHtml);
assertStickyContext(detailOverviewHtml, 'project detail');
assertFullWidthShell(detailOverviewHtml, 'project detail');
for (const expected of ['下一步动作区', '项目资产入口', '关键风险与资产完成度', '项目二级视图']) {
  assert(detailOverviewText.includes(expected), `project overview should include command marker: ${expected}`);
}
assert(detailOverviewText.includes('创作母本'), 'project overview should expose the story treatment asset entry');
assert(detailOverviewHtml.includes('view=treatment'), 'project overview should link to the story treatment view');
for (const expected of ['project-actions-drawer', '项目操作抽屉', 'project-command-center', 'asset-status-grid', 'data-open-dialog="project-actions-drawer"', 'project-action-danger-zone']) {
  assert(detailOverviewHtml.includes(expected), `project overview should expose drawer/collapsed interaction: ${expected}`);
}
for (const removed of ['project-action-summary', 'project-action-queue', '操作前确认', '推荐推进']) {
  assert(!detailOverviewHtml.includes(removed), `project operation drawer should not expose removed queue/confirmation section: ${removed}`);
}
for (const expected of ['项目目标与推进状态', '项目目标与扩写计划', '归档管理']) {
  assert(detailOverviewText.includes(expected), `project operation drawer should expose organized sections: ${expected}`);
}
for (const expected of ['action="/webhook/novel-rewrite-start"', '启动第 2 章重写', '恢复/重试模型调用', 'name="job_id"']) {
  assert(detailOverviewHtml.includes(expected), `project overview should expose pending rewrite recovery: ${expected}`);
}
assert(detailOverviewText.includes('第 2 章重写待执行'), 'project overview status badge should prioritize live pending rewrite state over base REVIEWING status');
assert(detailOverviewText.includes('基础状态：待人工审核'), 'project overview should explain the base project status when live queue status overrides it');
const detailRunningRewriteHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  jobs: JSON.stringify([
    {id: '22000000-0000-0000-0000-000000000042', job_type: 'REWRITE_CHAPTER', status: 'RUNNING', chapter_no: 2, attempt_count: 1, max_attempts: 3, started_at: '2026-05-04T01:20:00.000Z', updated_at: '2026-05-04T01:20:00.000Z'},
  ]),
}])[0].json.response_html;
for (const expected of ['第 2 章重写中', '检查并恢复第 2 章重写', '超时则重排并重试', '只有运行超过 6 分钟']) {
  assert(detailRunningRewriteHtml.includes(expected), `project overview should expose stale-running rewrite recovery: ${expected}`);
}
for (const expected of [
  'select name="target_words_per_chapter"',
  'textarea name="expansion_request"',
  'select name="expansion_scope"',
  '新增剧情要求',
  '保留约束',
  '只追加新章节',
  '重排未写章节',
  '高风险重排全部大纲',
  '深度长章 4000 字',
  '字数越高，导演台分段数和生成耗时通常也会增加',
  'project-target-grid',
]) {
  assert(detailOverviewHtml.includes(expected), `project operation drawer should keep target word controls consistent with create page: ${expected}`);
}
for (const expected of ['.project-command-center { display: grid; gap: 10px;', '.project-identity-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto;', '.next-action-strip { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, auto);', '.asset-status-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr));']) {
  assert(detailOverviewHtml.includes(expected), `project overview should use compact command center layout: ${expected}`);
}
assert(!detailOverviewHtml.includes('class="project-info"'), 'project overview should no longer render the old tall left project card');
assert(!detailOverviewText.includes('第一章正文不应出现在默认总览'), 'project overview should not render long body text');
assertNoGetWriteLinks(detailOverviewHtml, 'project overview');

const detailTreatmentHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'treatment'}])[0].json.response_html;
const detailTreatmentText = visibleText(detailTreatmentHtml);
for (const expected of ['id="treatment-section"', '母本核心', '叙事阶梯', '主题内核', '真相阶梯', '红线为何缠住活人']) {
  assert(detailTreatmentHtml.includes(expected) || detailTreatmentText.includes(expected), `project treatment view should expose story treatment marker: ${expected}`);
}
for (const expected of ['重新生成母本', '清理下游并立即启动', 'action="/webhook/novel-generate-treatment-now"', 'name="regenerate_existing" value="true"', '新的母本要求']) {
  assert(detailTreatmentHtml.includes(expected), `project treatment view should expose treatment regeneration control: ${expected}`);
}
assertNoGetWriteLinks(detailTreatmentHtml, 'project treatment view');

const detailMissingTreatmentHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'treatment',
  story_treatment: JSON.stringify({}),
  jobs: JSON.stringify([]),
}])[0].json.response_html;
for (const expected of ['暂无创作母本', '立即生成创作母本', '自动补任务并启动', 'action="/webhook/novel-generate-treatment-now"', 'name="step" value="treatment"']) {
  assert(detailMissingTreatmentHtml.includes(expected), `missing treatment view should expose immediate generation control: ${expected}`);
}
assertNoGetWriteLinks(detailMissingTreatmentHtml, 'missing treatment view');

const detailFactsHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'facts'}])[0].json.response_html;
for (const expected of [
  '按事实类型筛选',
  'data-fact-type-filter="all"',
  'data-fact-type-filter="character"',
  'data-fact-type-filter="item"',
  'data-fact-type-filter="rule"',
  'name="chapter_no" type="number" min="1" step="1"',
  'data-fact-card data-fact-scope="current" data-fact-type="character"',
  'data-fact-card data-fact-scope="current" data-fact-type="item"',
  'data-fact-card data-fact-scope="history" data-fact-type="rule"',
  '当前类型暂无事实',
  '失效事实历史',
  'class="inline-form fact-clear-form"',
  'aria-label="清理失效事实"',
  '清理失效事实</span><small>1 条可清理',
  'const navigateOrReload = (nextUrl) =>',
  'const sameDocument = currentUrl.origin === nextUrl.origin',
  "window.history.replaceState({}, '', targetHref);",
  'window.location.reload();',
  'button.is-submitting:disabled { cursor: progress; }',
  'button.classList.add(\'is-submitting\');',
  'button.classList.remove(\'is-submitting\');',
  "if (action === 'CLEAR_INACTIVE') nextUrl.searchParams.delete('fact_type');",
  '主角身份',
  '旧城账本',
  '过期规则',
]) {
  assert(detailFactsHtml.includes(expected), `project facts view should expose type filtering: ${expected}`);
}
assert(!detailFactsHtml.includes('<details class="fact-danger-zone"'), 'inactive fact cleanup should be a direct button, not a details panel');
assert(!detailFactsHtml.includes('输入项目名确认清理'), 'inactive fact cleanup should not render the old expanded confirmation field');

const detailBibleHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'bible'}])[0].json.response_html;
const detailBibleText = visibleText(detailBibleHtml);
for (const expected of ['<dt>姓名</dt>', '<dt>别名</dt>', '<dt>公开称呼</dt>', '<dt>身份</dt>', '<dt>身份说明</dt>', '<dt>目标</dt>', '<dt>定位</dt>', '<dt>与主角关系</dt>', '<dt>动机</dt>', '<dt>与主角冲突</dt>', '<dt>威胁等级</dt>']) {
  assert(detailBibleHtml.includes(expected), `project bible view should localize structured setting key: ${expected}`);
}
assert(!detailBibleHtml.includes('<dt>name</dt>'), 'project bible view should hide English object keys from display cards');
assert(!detailBibleHtml.includes('<dt>Identity Note</dt>'), 'project bible view should hide title-cased English object keys from display cards');
assert(!detailBibleHtml.includes('<dt>Relationship With Mc</dt>'), 'project bible view should hide relationship_with_mc English label from display cards');
assert(!detailBibleHtml.includes('<dt>Threat Level</dt>'), 'project bible view should hide threat_level English label from display cards');
assert(detailBibleHtml.includes('class="bible-card-actions"'), 'project bible cards should expose per-setting edit buttons outside detail drawers');
assert(detailBibleHtml.includes('data-open-dialog="bible-card-story-core">打开详情</button>'), 'project bible cards should put the detail button in the same card action row');
assert(detailBibleHtml.includes('data-open-dialog="bible-edit-story-core"'), 'project bible card edit buttons should open the matching setting edit drawer');
assert(detailBibleHtml.includes('.bible-work-card { min-height: 198px; display: flex; flex-direction: column;'), 'project bible cards should keep action rows aligned across uneven summaries');
assert(detailBibleHtml.includes('.bible-card-actions button { width: 100%; height: 34px; min-height: 34px;'), 'project bible card action buttons should have a stable equal height');
assert(detailBibleHtml.includes('class="side-dialog bible-field-edit-dialog"'), 'project bible edit should render per-setting side drawers');
assert(detailBibleHtml.includes('class="bible-single-edit-form"'), 'project bible edit drawer should render one form for the selected setting item');
assert(detailBibleHtml.includes('保存故事核心'), 'project bible edit drawer should save a single setting item');
assert(detailBibleHtml.includes('<input type="hidden" name="world_setting"'), 'single Bible edit forms should preserve other Bible fields through hidden values');
assert(!detailBibleHtml.includes('id="bible-edit-drawer"'), 'project bible edit should no longer render the old all-fields drawer');
assert(!detailBibleHtml.includes('class="bible-edit-form" method="POST"'), 'project bible edit drawer should no longer submit one large all-fields form');
assert(!detailBibleText.includes('identity_note'), 'visible Bible edit text should display localized keys');
assert(!detailBibleText.includes('relationship_with_mc'), 'visible Bible edit text should display localized relationship keys');
assert(!detailBibleHtml.includes('<li>{&quot;'), 'project bible view should not show raw JSON for character arrays');
assert(!detailBibleHtml.includes('主角设定 JSON'), 'project bible edit labels should avoid raw JSON wording');

const detailDirectorHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'director',
  chapters: JSON.stringify([]),
  director_cards: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000061',
    chapter_no: 1,
    version: 1,
    is_current: true,
    status: 'READY',
    source: 'AI',
    card_payload: {
      chapter_intent: '建立主角回城后的第一场选择。',
      causal_chain: {
        from_previous: '旧城债务压来。',
        trigger: '债主当众逼迫。',
        character_motives: ['陆明：保护旧店。'],
        obstacles: ['资金不足。'],
        irreversible_result: '陆明公开接下挑战。',
        to_next: '引出旧城账本。',
      },
      continuity_constraints: {
        must_remember: ['陆明仍隐藏真实身份。'],
        must_not_break: ['许青不能提前知道账本位置。'],
        future_outline_guardrails: ['第 3 章前不得揭露幕后老板。'],
      },
      foreshadowing_ops: [{
        thread_key: '旧城账本',
        action: 'seed',
        instruction: '只让读者看到柜台暗格。',
        do_not_reveal: true,
        next_touch_chapter: 2,
        do_not_reveal_before: 3,
        payoff_target_chapter: 5,
      }],
      abruptness_risks: [{risk: '债主突然退让', reason: '压迫感不足', fix: '先让围观者议论陆明旧债'}],
      fact_source_audit: [{
        claim: '旧城债务来自大纲',
        source_type: 'Bible',
        source_evidence: 'Bible villain_setting赵衡 conflict_with_mc: 争夺旧城控制权。',
        verdict: 'supported',
      }],
      cross_chapter_transition: {
        mode: 'natural_scene_cut',
        allowed: true,
        reason: '上一章结尾到本章开场只省略路程。',
        opening_bridge: '第一段接上债主围堵后的旧街雨声。',
        risk: '需要交代陆明为何回到旧店。',
        needs_explicit_bridge: true,
      },
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1, goal: '开场压迫', conflict: '债主上门', information_release: '旧债金额', emotion_turn: '压抑转反击', ending_hook: '暗格露出'}],
    },
  }]),
}])[0].json.response_html;
const detailDirectorText = visibleText(detailDirectorHtml);
for (const expected of ['伏笔操作', '旧城账本', '动作', '埋设', '避免提前揭露', '揭露前禁写', '第 1 段', '突兀风险', '原因：压迫感不足', '修正：先让围观者议论陆明旧债', '阻力障碍', '资金不足', '开章承接', '自然转场', '第一段接上债主围堵后的旧街雨声', '事实来源审计', '旧城债务来自大纲', '来源类型 设定集', '设定集 反派设定赵衡 与主角冲突', '依据充分', '质量闸门', '闸门状态', '通过']) {
  assert(detailDirectorText.includes(expected), `director view should localize planning card display: ${expected}`);
}
assert(!detailDirectorHtml.includes('<li>{&quot;'), 'director view should not render foreshadowing objects as raw JSON list items');
assert(!detailDirectorHtml.includes('<strong>Segment '), 'director view should not show English segment labels');
assert(!detailDirectorHtml.includes('编辑导演台 JSON'), 'director view should not label the normal edit affordance as raw JSON');
assert(!detailDirectorHtml.includes('导演台 JSON'), 'director view should avoid raw JSON wording in visible edit labels');
assert(detailDirectorHtml.includes('class="director-card director-chapter-panel"'), 'director chapter cards should render as collapsible panels');
const detailOutlineHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'outline'}])[0].json.response_html;
assert(detailOutlineHtml.includes('class="catalog-item catalog-panel"'), 'outline chapter cards should render as collapsible panels');
assert(detailOutlineHtml.includes('class="catalog-panel-summary"'), 'outline chapter panels should expose summaries');
assert(detailOutlineHtml.includes('.catalog-grid, .chapter-grid { display: grid; grid-template-columns: minmax(0, 1fr);'), 'outline and chapter grids should render as one-column row panels like director view');
assert(detailOutlineHtml.includes('class="outline-workbench"'), 'outline view should render as a workbench layout');
assert(detailOutlineHtml.includes('class="outline-dashboard"'), 'outline view should show status cards above the chapter list');
assert(detailOutlineHtml.includes('data-catalog-action="expand-all"'), 'outline view should expose expand/collapse controls for chapter panels');
assert(detailOutlineHtml.includes('class="side-dialog outline-edit-dialog"'), 'outline chapter editing should live in a right-side drawer');
assert(detailOutlineHtml.includes('data-open-dialog="outline-edit-'), 'outline chapter edit buttons should open right-side drawers');
assert(detailOutlineHtml.includes('class="outline-scene-workspace"'), 'outline view should render scene beats as a visible workspace');
assert(detailOutlineHtml.includes('旧城雨夜入场'), 'outline view should show scene beat goals');
assert(detailOutlineHtml.includes('旧城账本为什么还在？'), 'outline view should show reader questions');
assert(detailOutlineHtml.includes('name="scene_beats_json"'), 'outline edit drawer should submit editable scene beats');
assert(detailOutlineHtml.includes('name="reader_questions_json"'), 'outline edit drawer should submit editable reader questions');
assert(!detailOutlineHtml.includes('<summary>编辑本章大纲</summary>'), 'outline chapter edit forms should not render as inline details');
assert(detailOutlineHtml.includes('class="readonly-field"><span>卷号</span>'), 'outline edit drawer should show volume as a read-only field');
assert(detailOutlineHtml.includes('<input type="hidden" name="volume_no"'), 'outline edit drawer should still submit the current volume number');
assert(!detailOutlineHtml.includes('name="volume_no" type="number"'), 'outline edit drawer should not allow editing volume number');
assert(detailDirectorHtml.includes('class="director-chapter-summary"'), 'director chapter cards should expose a collapsible summary header');
assert((detailDirectorHtml.match(/class="director-panel director-drawer-card"/g) || []).length >= 9, 'director inner planning sections should render as drawer trigger cards');
assert(detailDirectorHtml.includes('data-open-dialog="director-panel-1-chain"'), 'director inner planning cards should open right-side drawers');
assert(detailDirectorHtml.includes('data-open-dialog="director-panel-1-transition"'), 'director transition planning should open a right-side drawer');
assert(detailDirectorHtml.includes('data-open-dialog="director-panel-1-source-audit"'), 'director fact-source audit should open a right-side drawer');
assert(detailDirectorHtml.includes('data-open-dialog="director-panel-1-quality-gate"'), 'director quality gate should open a right-side drawer');
assert(detailDirectorHtml.includes('class="side-dialog director-panel-dialog"'), 'director inner planning content should live in right-side drawer dialogs');
assert(detailDirectorHtml.includes('class="director-panel-body"'), 'director drawer panels should wrap their body content');
assert(!detailDirectorHtml.includes('<details class="director-panel"'), 'director inner planning sections should not render as inline collapsible details');
for (const expected of ['director-edit-dialog', 'data-open-dialog="director-edit-', '高级编辑（原始结构）', '保存后会创建新的当前版本，页面会自动刷新', '标记阻断已解决', '分段计划需', '保存为当前版本']) {
  assert(detailDirectorHtml.includes(expected), `director view should edit the raw structure in a right-side drawer: ${expected}`);
}
assert(!detailDirectorHtml.includes('<details class="director-edit">'), 'director view should not expose the advanced editor as an inline details block');
assert(detailDirectorHtml.includes('排队正文生成'), 'director view should describe director-card chapter creation as queueing, not direct generation');
assert(detailDirectorHtml.includes('不直接调用模型'), 'director view should explain that queueing from director does not start the model call');
assert(!detailDirectorHtml.includes('按此导演台生成正文'), 'director view should avoid wording that sounds identical to starting chapter generation');

const detailDirectorBlockedHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'director',
  chapters: JSON.stringify([]),
  outlines: JSON.stringify([{chapter_no: 5, title: '宫宴下马威', summary: '太后刁难，顾南辞护短。', status: 'READY'}]),
  director_cards: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000066',
    chapter_no: 5,
    version: 2,
    is_current: true,
    status: 'NEEDS_REVIEW',
    source: 'AI',
    card_payload: {
      quality_gate: {
        pass: false,
        blocking_issues: ['事实来源不足：宫宴名为“赏花宴”', '导演台 segment_plan 数量必须等于正文分段数：期望 4，实际 3'],
      },
      segment_plan: [{segment_no: 1}, {segment_no: 2}, {segment_no: 3}],
    },
  }]),
}])[0].json.response_html;
assert(detailDirectorBlockedHtml.includes('重跑解决阻断'), 'blocked director cards should expose a focused blocker-repair regeneration button');
assert(detailDirectorBlockedHtml.includes('带阻断清单'), 'blocker repair button should make its behavior clear');
assert(detailDirectorBlockedHtml.includes('解决导演台阻断'), 'blocker repair form should send the current blocker summary as the regeneration comment');
assert(detailDirectorBlockedHtml.includes('data-submitting-label="生成中..."'), 'blocker repair button should immediately show a generation state after submit');
assert(!detailDirectorBlockedHtml.includes('<li>{&quot;'), 'blocked director issues should not show embedded JSON strings as raw list items');

const detailDirectorBlockedRunningHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'director',
  chapters: JSON.stringify([]),
  outlines: JSON.stringify([{chapter_no: 5, title: '宫宴下马威', summary: '太后刁难，顾南辞护短。', status: 'READY'}]),
  jobs: JSON.stringify([{id: '22000000-0000-0000-0000-000000000074', job_type: 'PLAN_CHAPTER_DIRECTOR', status: 'PENDING', chapter_no: 5}]),
  director_cards: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000066',
    chapter_no: 5,
    version: 2,
    is_current: true,
    status: 'NEEDS_REVIEW',
    source: 'AI',
    card_payload: {
      quality_gate: {
        pass: false,
        blocking_issues: ['事实来源不足：宫宴名为“赏花宴”'],
      },
      segment_plan: [{segment_no: 1}],
    },
  }]),
}])[0].json.response_html;
assert(detailDirectorBlockedRunningHtml.includes('导演台排队中'), 'blocked director repair should become read-only while a director job is pending');
assert(!detailDirectorBlockedRunningHtml.includes('重跑解决阻断'), 'blocked director repair should not be clickable while a director job is pending');

const detailDirectorWithChapterJobHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'director',
  chapters: JSON.stringify([]),
  jobs: JSON.stringify([{id: '22000000-0000-0000-0000-000000000071', job_type: 'GENERATE_CHAPTER', status: 'PENDING', chapter_no: 1}]),
  director_cards: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000061',
    chapter_no: 1,
    version: 1,
    is_current: true,
    status: 'READY',
    source: 'AI',
    card_payload: {
      chapter_intent: '建立主角回城后的第一场选择。',
      causal_chain: {character_motives: []},
      continuity_constraints: {},
      foreshadowing_ops: [],
      abruptness_risks: [],
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1, goal: '开场压迫'}],
    },
  }]),
}])[0].json.response_html;
assert(detailDirectorWithChapterJobHtml.includes('正文已排队，启动生成'), 'director view should switch to a start action when a chapter job already exists');
assert(detailDirectorWithChapterJobHtml.includes('action="/webhook/novel-generate-chapter-now"'), 'existing queued chapter job should be started through the chapter generation webhook');
assert(!detailDirectorWithChapterJobHtml.includes('<span>排队正文生成</span>'), 'director view should not offer duplicate chapter job creation when one is already queued');

const detailDirectorWithReviewChapterHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'director',
  director_cards: JSON.stringify([{
    id: '22000000-0000-0000-0000-000000000061',
    chapter_no: 1,
    version: 1,
    is_current: true,
    status: 'READY',
    source: 'AI',
    card_payload: {
      chapter_intent: '建立主角回城后的第一场选择。',
      causal_chain: {character_motives: []},
      continuity_constraints: {},
      foreshadowing_ops: [],
      abruptness_risks: [],
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1, goal: '开场压迫'}],
    },
  }]),
}])[0].json.response_html;
assert(detailDirectorWithReviewChapterHtml.includes('正文已生成，去审核'), 'director view should point to review when the chapter candidate already exists');
assert(!detailDirectorWithReviewChapterHtml.includes('<span>排队正文生成</span>'), 'director view should not offer chapter queueing after a candidate exists');

const detailChaptersHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'chapters'}])[0].json.response_html;
assert(visibleText(detailChaptersHtml).includes('正文工具条'), 'chapter view should keep body toolbar in drill-down');
assert(detailChaptersHtml.includes('class="chapter-card chapter-panel'), 'chapter cards should render as collapsible panels');
for (const expected of ['章节正文抽屉', '审稿报告抽屉', '人工审核记录抽屉', '章节模型调用抽屉']) {
  assert(detailChaptersHtml.includes(expected), `chapter view should expose drawer: ${expected}`);
}
assert(detailChaptersHtml.includes('第 1 章：旧城灯火'), 'chapter view should show system chapter number plus clean title');
assert(!detailChaptersHtml.includes('第 1 章：第1章'), 'chapter view should not duplicate title chapter-number prefixes');

assert(detailOutlineHtml.includes('第 1 章：旧城灯火'), 'outline view should prefer current candidate chapter title when a non-stale chapter exists');
assert(!detailOutlineHtml.includes('第 1 章：第一章'), 'outline view should not surface stale-looking outline title prefixes for written chapters');

const reviewRows = [
  {
    page_mode: 'LIST',
    project_id: '22000000-0000-0000-0000-000000000001',
    project_title: '待审项目',
    chapter_id: '22000000-0000-0000-0000-000000000031',
    review_token: 'phase22-review-a',
    chapter_no: 1,
    chapter_title: '第一章 旧城灯火',
    body: '列表页不应显示正文',
    summary: '候选稿摘要。',
    total_score: 90,
    verdict: 'PASS',
    status: 'NEED_REVIEW',
  },
  {
    page_mode: 'LIST',
    project_id: '22000000-0000-0000-0000-000000000001',
    project_title: '待审项目',
    chapter_id: '22000000-0000-0000-0000-000000000032',
    review_token: 'phase22-review-b',
    chapter_no: 2,
    chapter_title: '雨夜重逢',
    summary: '需要重写。',
    total_score: 62,
    verdict: 'REWRITE',
    status: 'NEED_REVIEW',
  },
  {
    page_mode: 'LIST',
    project_id: '22000000-0000-0000-0000-000000000001',
    project_title: '待审项目',
    chapter_id: '22000000-0000-0000-0000-000000000033',
    review_token: 'phase22-review-c',
    chapter_no: 3,
    chapter_title: '暗线浮出',
    summary: '高风险。',
    total_score: 42,
    verdict: 'REJECT',
    status: 'NEED_REVIEW',
  },
];
const reviewListHtml = runCodeNode('n8n/code/novel_render_review_html.js', reviewRows)[0].json.html;
const reviewListText = visibleText(reviewListHtml);
for (const expected of ['建议通过', '建议重写', '高风险', '审核分组']) {
  assert(reviewListText.includes(expected), `review list should include grouped lane: ${expected}`);
}
assert(reviewListHtml.includes('app-sidebar'), 'review list should use the same left admin navigation');
assertStickyContext(reviewListHtml, 'review list');
assertFullWidthShell(reviewListHtml, 'review list');
for (const expected of ['data-pagination="reviews"', 'data-page-size', 'data-page-prev', 'data-page-next']) {
  assert(reviewListHtml.includes(expected), `review list should include basic pagination control: ${expected}`);
}
assert(reviewListHtml.includes('<details class="review-lane"'), 'review list should collapse review groups by default');
assert(!reviewListText.includes('列表页不应显示正文'), 'review list should remain summary-only');
assert(!reviewListText.includes('第一章 旧城灯火'), 'review list should strip generated chapter-number title prefixes');
assertNoGetWriteLinks(reviewListHtml, 'review list');

const reviewDetailHtml = runCodeNode('n8n/code/novel_render_review_html.js', [{...reviewRows[0], page_mode: 'DETAIL', body: '审核详情正文。'}])[0].json.html;
const reviewDetailText = visibleText(reviewDetailHtml);
const reviewDetailBodyHtml = reviewDetailHtml.slice(reviewDetailHtml.indexOf('<body'));
for (const expected of ['人工审核抽屉', '返回项目', '返回章节', '查看队列', '重新审稿', 'method="POST"']) {
  assert(reviewDetailText.includes(expected) || reviewDetailHtml.includes(expected), `review detail should include decision marker: ${expected}`);
}
for (const expected of ['review-detail-workspace', '审核内容', 'review-decision-launcher', 'review-decision-drawer', 'ai-review-drawer', '智能审稿抽屉', 'data-open-dialog']) {
  assert(reviewDetailText.includes(expected) || reviewDetailHtml.includes(expected), `review detail should prioritize reader and drawer interaction: ${expected}`);
}
assert(!reviewDetailText.includes('改稿与依据'), 'review decision drawer should only keep final decision controls');
for (const expected of ['manual-edit-drawer', '人工改稿抽屉', '/webhook/novel-review-manual-edit', 'data-review-manual-edit', '保存并重新审稿', '改稿并直接通过']) {
  assert(reviewDetailText.includes(expected) || reviewDetailHtml.includes(expected), `review detail should support manual text editing in a drawer: ${expected}`);
}
assert(
  reviewDetailBodyHtml.indexOf('class="review-reader-panel"') < reviewDetailBodyHtml.indexOf('class="side-drawer review-decision-drawer"'),
  'review detail should place the review text before the decision drawer'
);
assert(
  reviewDetailBodyHtml.indexOf('class="side-drawer review-decision-drawer"') < reviewDetailBodyHtml.indexOf('id="ai-review-drawer'),
  'review detail should keep the decision drawer before the AI review drawer'
);
assert(
  !reviewDetailHtml.includes('aria-label="审核快捷入口"'),
  'review detail should not repeat reader/decision/AI actions under the chapter title'
);
const reviewDetailHeader = reviewDetailHtml.match(/<div class="page-header">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
assert(
  reviewDetailHeader.includes('返回审核列表') &&
    reviewDetailHeader.includes('返回项目') &&
    reviewDetailHeader.includes('返回章节') &&
    reviewDetailHeader.includes('查看队列'),
  'review detail return actions should sit on the right side of the page title bar'
);
assertStickyContext(reviewDetailHtml, 'review detail');
assertFullWidthShell(reviewDetailHtml, 'review detail');
assert(reviewDetailHtml.includes('href="/webhook/novel-review-list">审核中心</a>'), 'review detail breadcrumb should drill down from review center');
assert(!reviewDetailHtml.includes('href="/webhook/novel-project-list">项目列表</a><span class="crumb-separator">/</span><a href="/webhook/novel-project-detail'), 'review detail breadcrumb should not pretend project list is its parent');
assert(reviewDetailHtml.includes("form.getAttribute('action')"), 'review decision forms should avoid form.action property shadowing by action buttons');
assert(reviewDetailHtml.includes('fetch(formPostUrl(form)'), 'review decision forms should submit in-place instead of navigating to result pages');
assert(reviewDetailHtml.includes("resultPrimaryHrefFromHtml(html, '/webhook/novel-review-list')"), 'review decision should return to the review list after success');
assert(!reviewDetailHtml.includes('<h2>第一章 旧城灯火</h2>'), 'review detail title should strip generated chapter-number prefixes');
assertNoGetWriteLinks(reviewDetailHtml, 'review detail');

const emptyReviewDetailHtml = runCodeNode('n8n/code/novel_render_review_html.js', [
  {is_empty: true, page_mode: 'DETAIL'},
])[0].json.html;
assert(emptyReviewDetailHtml.includes('href="/webhook/novel-review-list">审核中心</a>'), 'empty review detail breadcrumb should still point back to review center');
assert(emptyReviewDetailHtml.includes('<span>审核详情</span>'), 'empty review detail breadcrumb should use a stable detail label');
assert(!emptyReviewDetailHtml.includes('href="/webhook/novel-project-list">小说项目</a>'), 'empty review detail breadcrumb should not fall back to project list');

const queueHtml = runCodeNode('n8n/code/novel_render_queue_status_html.js', [
  {queue_total_count: 2, queue_waiting_count: 1, queue_running_count: 1, queue_failed_count: 1, queue_succeeded_today_count: 0},
  {job_id: 'j1', project_id: '22000000-0000-0000-0000-000000000001', project_title: '待审项目', job_type: 'REVIEW_CHAPTER', chapter_no: 1, chapter_title: '第1章 雨夜重逢', status: 'FAILED', attempt_count: 1, max_attempts: 3, error_message: '测试失败', updated_at: '2026-05-04T01:00:00.000Z'},
  {job_id: 'j2', project_id: '22000000-0000-0000-0000-000000000002', project_title: '运行项目', job_type: 'GENERATE_CHAPTER', status: 'RUNNING', attempt_count: 1, max_attempts: 3, updated_at: '2026-05-04T01:01:00.000Z'},
])[0].json.response_html;
const queueText = visibleText(queueHtml);
for (const expected of ['系统健康：哪里需要处理', '恢复入口', '查看项目上下文']) {
  assert(queueText.includes(expected), `queue page should include ops marker: ${expected}`);
}
assert(
  queueHtml.indexOf('class="ops-overview"') < queueHtml.indexOf('class="queue-workbench"'),
  'queue ops overview should sit above the filter/list workbench'
);
assert(queueHtml.includes('app-sidebar'), 'queue page should use the same left admin navigation');
assert(!queueText.includes('第 1 章 第1章'), 'queue page should strip generated chapter-number title prefixes');
assertStickyContext(queueHtml, 'queue');
assertFullWidthShell(queueHtml, 'queue');
for (const expected of ['data-pagination="queue"', 'data-page-size', 'data-page-prev', 'data-page-next']) {
  assert(queueHtml.includes(expected), `queue page should include basic pagination control: ${expected}`);
}
assertNoGetWriteLinks(queueHtml, 'queue');

const dailyHtml = runCodeNode('n8n/code/novel_render_daily_report_html.js', [{
  report_date: '2026-05-04',
  today_job_total_count: 4,
  today_job_failed_count: 1,
  today_ai_run_count: 2,
  waiting_job_count: 0,
  running_job_count: 0,
  need_review_count: 0,
  failed_job_count: 1,
  latest_failed_jobs: JSON.stringify([{project_title: '失败项目', job_type: 'REWRITE_CHAPTER', status: 'FAILED', error_message: '测试失败'}]),
  slow_ai_runs: JSON.stringify([]),
  snapshot_history: JSON.stringify([]),
}])[0].json.response_html;
const dailyText = visibleText(dailyHtml);
for (const expected of ['今日处理结论', '查看失败任务', '今日是否需要处理']) {
  assert(dailyText.includes(expected), `daily report should include verdict marker: ${expected}`);
}
assert(dailyHtml.includes('app-sidebar'), 'daily report should use the same left admin navigation');
assertStickyContext(dailyHtml, 'daily');
assertFullWidthShell(dailyHtml, 'daily');
assertNoGetWriteLinks(dailyHtml, 'daily');

const createPageHtml = runCodeNode('n8n/code/novel_render_project_create_html.js')[0].json.response_html;
assertStickyContext(createPageHtml, 'create page');
assertFullWidthShell(createPageHtml, 'create page');
for (const expected of ['select name="genre"', 'select name="audience"', 'select name="style"', 'select name="target_words_per_chapter"']) {
  assert(createPageHtml.includes(expected), `create page should use guided dropdown controls: ${expected}`);
}

const createResultHtml = runCodeNode('n8n/code/novel_render_project_create_result_html.js', [{
  id: '22000000-0000-0000-0000-000000000099',
  title: '结果页项目',
  success: true,
  status: 'CREATED',
  job_type: 'GENERATE_BIBLE',
  job_status: 'PENDING',
}])[0].json.response_html;
assert(visibleText(createResultHtml).includes('结果 + 下一步 + 返回上下文'), 'create result should use unified result shell');
assertStickyContext(createResultHtml, 'create result');

const generationResultHtml = runCodeNode('n8n/code/novel_render_generation_step_result.js', [], {
  project_id: '22000000-0000-0000-0000-000000000099',
  job_type: 'GENERATE_BIBLE',
  claim_success: true,
})[0].json.response_html;
assert(visibleText(generationResultHtml).includes('结果 + 下一步 + 返回上下文'), 'generation result should use unified result shell');
assertStickyContext(generationResultHtml, 'generation result');

const projectActionResultHtml = runCodeNode('n8n/code/novel_render_project_action_result.js', [], {
  success: true,
  result_code: 'CHAPTER_JOB_CREATED',
  action: 'CONTINUE_PROJECT',
  project_id: '22000000-0000-0000-0000-000000000099',
})[0].json.response_html;
assert(visibleText(projectActionResultHtml).includes('结果 + 下一步 + 返回上下文'), 'project action result should use unified result shell');
assertStickyContext(projectActionResultHtml, 'project action result');

const reviewActionResultHtml = runCodeNode('n8n/code/novel_render_review_action_result.js', [], {
  success: true,
  action: 'APPROVE',
  result_code: 'APPROVED',
  chapter_id: '22000000-0000-0000-0000-000000000031',
  project_id: '22000000-0000-0000-0000-000000000001',
  chapter_no: 3,
})[0].json.response_html;
assert(visibleText(reviewActionResultHtml).includes('结果 + 下一步 + 返回上下文'), 'review action result should use unified result shell');
assertStickyContext(reviewActionResultHtml, 'review action result');
for (const expected of ['继续审核下一章', '返回项目', '返回章节', '查看队列']) {
  assert(visibleText(reviewActionResultHtml).includes(expected), `review action result should include context action: ${expected}`);
}

console.log(JSON.stringify({
  ok: true,
  phase: 22,
  checks: [
    '工作台任务驱动',
    '项目列表按下一步扫描',
    '项目详情默认指挥台',
    '审核列表分组与详情决策抽屉',
    '队列和日报运营反馈',
    '结果页统一返回上下文',
  ],
}, null, 2));
