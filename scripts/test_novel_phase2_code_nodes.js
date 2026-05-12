#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'novel_phase2');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8'));
}

function makeInput(items) {
  const normalized = (Array.isArray(items) ? items : [items]).map((json) => ({json}));
  return {
    first() {
      return normalized[0];
    },
    all() {
      return normalized;
    },
  };
}

function runCodeNode(relativePath, {json = {}, inputItems = null, env = {}, namedNodes = {}} = {}) {
  const codePath = path.join(repoRoot, relativePath);
  const code = fs.readFileSync(codePath, 'utf8');
  const input = makeInput(inputItems || json);
  const dollar = (name) => {
    if (!namedNodes[name]) {
      throw new Error(`Missing named node fixture: ${name}`);
    }
    return makeInput(namedNodes[name]);
  };
  const runner = new Function('$json', '$input', '$env', 'require', '$', code);
  return runner(json, input, env, require, dollar);
}

function assertThrowsMessage(fn, expected) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert(thrown, `Expected error containing "${expected}"`);
  assert(
    String(thrown.message).includes(expected),
    `Expected "${thrown.message}" to include "${expected}"`
  );
}

function maxLineLength(value) {
  return Math.max(...String(value || '').split(/\n+/).map((line) => line.trim().length));
}

const configPath = path.join(repoRoot, 'config', 'novel_generation_config.jsonc');

const buildInput = readJson('build_chapter_input.json');
const built = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: buildInput,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
});
assert.strictEqual(Array.isArray(built), true, 'build script should return n8n items');
const builtJson = built[0].json;
assert.strictEqual(builtJson.run_type, 'GENERATE_CHAPTER');
assert.strictEqual(builtJson.prompt_key, 'chapter');
assert.strictEqual(builtJson.prompt_version, 'novel-v1-20260504');
assert.strictEqual(builtJson.llm_request_body.model, 'glm-5.1');
assert.strictEqual(builtJson.llm_request_body.max_tokens, 6000, 'chapter generation should use a tighter output budget');
assert.deepStrictEqual(builtJson.llm_request_body.thinking, {type: 'disabled'}, 'GLM-5.1 novel calls should disable thinking so content tokens are not exhausted');
assert.deepStrictEqual(builtJson.llm_request_body.response_format, {type: 'json_object'});
assert.strictEqual(builtJson.llm_request_body.messages.length, 2);
assert(
  builtJson.llm_request_body.messages[1].content.includes('旧钟表店的第一声回响'),
  'chapter prompt should include outline title'
);
assert(
  builtJson.llm_request_body.messages[1].content.includes('林昼要查清父亲失踪真相'),
  'chapter prompt should include continuity facts'
);
assert(
  builtJson.llm_request_body.messages[1].content.includes('【创作约束】'),
  'chapter prompt should include dropdown-derived creative constraints'
);
assert(
  builtJson.llm_request_body.messages[1].content.includes('类型：都市奇幻') &&
  builtJson.llm_request_body.messages[1].content.includes('目标读者：中文网文读者') &&
  builtJson.llm_request_body.messages[1].content.includes('文风：强冲突、强钩子') &&
  builtJson.llm_request_body.messages[1].content.includes('每章 1200 字左右'),
  'chapter prompt should bind genre, audience, style, and target words as hard constraints'
);
assert(
  builtJson.llm_request_body.messages[1].content.includes('正文换行硬规则') &&
    builtJson.llm_request_body.messages[1].content.includes('对话必须单独成段') &&
    builtJson.llm_request_body.messages[1].content.includes('单段超过 160 字视为失败'),
  'chapter prompt should require web-novel rhythm line breaks'
);
assert(
  builtJson.llm_request_body.messages[1].content.includes('角色称呼一致性') &&
    builtJson.llm_request_body.messages[1].content.includes('章节标题规则') &&
    builtJson.llm_request_body.messages[1].content.includes('不要带“第1章”“第一章”“第X章”') &&
    builtJson.llm_request_body.messages[1].content.includes('JSON字段白名单') &&
    builtJson.llm_request_body.messages[1].content.includes('正文不得散落到其他 JSON 字段名') &&
    builtJson.llm_request_body.messages[1].content.includes('半角英文双引号'),
  'chapter prompt should address the root cause of narrative text escaping into JSON keys'
);
assert.doesNotThrow(() => JSON.parse(builtJson.prompt_messages_json));

const builtBible = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'GENERATE_BIBLE',
    title: '逆光回响',
    premise: '普通修表师卷入城市异能事件。',
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert(
  builtBible.llm_request_body.messages[1].content.includes('角色命名必须建立唯一主名') &&
    builtBible.llm_request_body.messages[1].content.includes('aliases') &&
    builtBible.llm_request_body.messages[1].content.includes('public_name') &&
    builtBible.llm_request_body.messages[1].content.includes('organizations') &&
    builtBible.llm_request_body.messages[1].content.includes('locations') &&
    builtBible.llm_request_body.messages[1].content.includes('plot_constraints') &&
    builtBible.llm_request_body.messages[1].content.includes('所有字段值、描述、角色设定内容必须使用中文'),
  'bible prompt should force canonical names, registered aliases, and Chinese-readable values'
);

const builtBiblePatch = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'GENERATE_BIBLE_PATCH',
    title: '逆光回响',
    expansion_request: '新增反派商会、女主家族和城市禁区。',
    expansion_scope: 'rewrite_unwritten',
    expansion_constraints: '已批准正文不改；已激活事实不破坏。',
    novel_bible: {story_core: '修表师卷入旧城事件。'},
    existing_outlines: [{chapter_no: 1, title: '旧钟表店'}],
    approved_chapters: [{chapter_no: 1, summary: '林昼发现怀表异常。'}],
    continuity_facts: [{fact_key: '怀表', fact_value: '会在危险前响起'}],
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(builtBiblePatch.prompt_key, 'bible_patch');
assert(
  builtBiblePatch.llm_request_body.messages[1].content.includes('设定集补丁') &&
    builtBiblePatch.llm_request_body.messages[1].content.includes('新增反派商会') &&
    builtBiblePatch.llm_request_body.messages[1].content.includes('不要重写完整 Bible') &&
    builtBiblePatch.llm_request_body.messages[1].content.includes('risk_notes'),
  'bible patch prompt should create a confirmable patch instead of rewriting the whole Bible'
);

const expansionAssistValidation = runCodeNode('n8n/code/novel_validate_project_expansion_ai_assist.js', {
  json: {
    body: {
      project_id: '22222222-2222-2222-2222-222222222222',
      expansion_request: '新增女主家族线，加入反派商会和第12章前的背叛伏笔。',
      expansion_scope: '重排未写章节',
      expansion_constraints: '已批准正文不改；已激活事实不破坏。',
      target_total_chapters: '36',
      target_words_per_chapter: '2500',
    },
  },
})[0].json;
assert.strictEqual(expansionAssistValidation.expansion_scope, 'rewrite_unwritten');
assert.strictEqual(expansionAssistValidation.target_total_chapters, 36);
assert(expansionAssistValidation.expansion_request.includes('女主家族线'), 'project expansion AI assist validator should preserve user requirements');

const builtExpansionAssist = runCodeNode('n8n/code/novel_build_project_expansion_ai_assist_glm_request.js', {
  json: {
    ...expansionAssistValidation,
    title: '逆光回响',
    genre: '都市奇幻',
    audience: '中文网文读者',
    style: '强冲突、强钩子',
    novel_bible: {story_core: '林昼追查父亲失踪。', organizations: [{name: '沈氏商会'}]},
    existing_outlines: [{chapter_no: 8, title: '旧钟表店', summary: '林昼接近真相。'}],
    approved_chapters: [{chapter_no: 1, title: '旧钟表店', summary: '林昼发现怀表异常。'}],
    continuity_facts: [{fact_key: '怀表', fact_value: '会在危险前响起'}],
  },
})[0].json;
assert.strictEqual(builtExpansionAssist.run_type, 'PROJECT_EXPANSION_ASSIST');
assert(
  builtExpansionAssist.llm_request_body.messages[1].content.includes('【用户粗略要求】') &&
    builtExpansionAssist.llm_request_body.messages[1].content.includes('【当前设定集】') &&
    builtExpansionAssist.llm_request_body.messages[1].content.includes('【已有大纲】') &&
    builtExpansionAssist.llm_request_body.messages[1].content.includes('expansion_request'),
  'project expansion AI assist prompt should include user request, Bible, outline, and strict JSON schema'
);

const parsedExpansionAssist = runCodeNode('n8n/code/novel_parse_project_expansion_ai_assist_glm_response.js', {
  json: {
    llm_request_body: {model: 'glm-5.1'},
    llm_response: {
      choices: [{message: {content: JSON.stringify({
        expansion_request: '从第9章开始新增沈氏商会线：先让女主家族旧账牵出商会货仓，再用男二一次迟疑埋下背叛伏笔；第12章前只暴露商会外围，保留父亲失踪核心真相。',
        beat_design: [{chapter_range: '9-12', purpose: '引出商会压力', conflict: '家族旧账逼近女主', hook: '男二隐瞒一张旧票据'}],
        setting_additions: [{type: 'organization', name: '沈氏商会'}],
        risk_notes: [{risk: '提前揭露父亲真相', fix: '只写外围账本'}],
        message: '已生成扩写设计。',
      })}}],
    },
  },
})[0].json.response_json;
assert(JSON.parse(parsedExpansionAssist).expansion_request.includes('沈氏商会线'), 'project expansion AI assist parser should return fillable expansion request');

const builtOutline = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'GENERATE_OUTLINE',
    title: '逆光回响',
    expansion_request: '新增女主身世线、反派商会和第8章前的背叛伏笔。',
    expansion_scope: 'append_only',
    expansion_constraints: '已批准正文不改；已激活事实不破坏。',
    existing_outlines: [{chapter_no: 1, title: '旧钟表店', summary: '林昼发现旧钟表店线索。'}],
    approved_chapters: [{chapter_no: 1, title: '旧钟表店', summary: '林昼发现旧钟表店线索。'}],
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert(
  builtOutline.llm_request_body.messages[1].content.includes('角色名必须只使用 Bible 中已登记的 name、aliases 或 public_name') &&
    builtOutline.llm_request_body.messages[1].content.includes('不得写“X（实为Y）”') &&
    builtOutline.llm_request_body.messages[1].content.includes('【组织势力】') &&
    builtOutline.llm_request_body.messages[1].content.includes('【剧情约束】') &&
    builtOutline.llm_request_body.messages[1].content.includes('chapters[].title 只写标题本身') &&
    builtOutline.llm_request_body.messages[1].content.includes('【章节连续性与镜头转换】') &&
    builtOutline.llm_request_body.messages[1].content.includes('不要让读者感觉上一章刚离开 A 地，下一章突然已在 B 地执行新任务'),
  'outline prompt should not invent alias-style double names or frequent cross-chapter breaks'
);
assert(
  builtOutline.llm_request_body.messages[1].content.includes('【项目扩写计划】') &&
    builtOutline.llm_request_body.messages[1].content.includes('新增女主身世线、反派商会') &&
    builtOutline.llm_request_body.messages[1].content.includes('扩写范围：只追加新章节') &&
    builtOutline.llm_request_body.messages[1].content.includes('已有大纲') &&
    builtOutline.llm_request_body.messages[1].content.includes('已批准章节摘要') &&
    builtOutline.llm_request_body.messages[1].content.includes('不要重写已经存在的章节'),
  'outline prompt should carry the project expansion plan, existing outlines, and approved-chapter guardrails'
);

const builtExpandedOutline = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'GENERATE_OUTLINE',
    title: '天命之星',
    target_total_chapters: 40,
    expansion_request: '从第七章起全面接入女主真实身世主线与商业权谋线。',
    expansion_scope: 'rewrite_unwritten',
    expansion_constraints: '已批准正文不改；已激活事实不破坏。',
    existing_outlines: Array.from({length: 20}, (_, index) => ({chapter_no: index + 1, title: `旧章${index + 1}`})),
    approved_chapters: Array.from({length: 6}, (_, index) => ({chapter_no: index + 1, summary: `已批准第${index + 1}章`})),
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert(
  builtExpandedOutline.llm_request_body.messages[1].content.includes('系统根据目标章节数、扩写范围、已批准正文和已有大纲动态计算') &&
    builtExpandedOutline.llm_request_body.messages[1].content.includes('第 7 章到第 40 章') &&
    builtExpandedOutline.llm_request_body.messages[1].content.includes('最大 chapter_no 必须等于当前目标总章数 40') &&
    builtExpandedOutline.llm_request_body.messages[1].content.includes('不要沿用旧目标章节数') &&
    builtExpandedOutline.llm_request_body.messages[1].content.includes('旧结局表述') &&
    builtExpandedOutline.llm_request_body.messages[1].content.includes('按“新增剧情要求”和“本次大纲请求备注”里的节奏分层释放'),
  'expanded outline prompt should compute coverage from confirmed chapters and protect target-length pacing'
);

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_parse_glm_json.js', {
    json: {
      run_type: 'GENERATE_OUTLINE',
      target_total_chapters: 40,
      expansion_scope: 'rewrite_unwritten',
      approved_chapters: Array.from({length: 6}, (_, index) => ({chapter_no: index + 1})),
      existing_outlines: Array.from({length: 20}, (_, index) => ({chapter_no: index + 1})),
      choices: [{message: {content: JSON.stringify({
        chapters: Array.from({length: 13}, (_, index) => ({
          chapter_no: index + 7,
          title: `新章${index + 7}`,
          summary: '扩写剧情',
        })),
      })}}],
    },
  });
}, '大纲章节覆盖不足');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_parse_glm_json.js', {
    json: {
      run_type: 'GENERATE_OUTLINE',
      target_total_chapters: 40,
      expansion_scope: 'rewrite_unwritten',
      approved_chapters: Array.from({length: 6}, (_, index) => ({chapter_no: index + 1})),
      existing_outlines: Array.from({length: 20}, (_, index) => ({chapter_no: index + 1})),
      choices: [{message: {content: JSON.stringify({
        chapters: Array.from({length: 34}, (_, index) => {
          const chapterNo = index + 7;
          return {
            chapter_no: chapterNo,
            title: chapterNo === 20 ? '天命之星（大结局）' : `新章${chapterNo}`,
            summary: chapterNo === 20 ? '主线收束，故事落幕。' : '扩写剧情',
          };
        }),
      })}}],
    },
  });
}, '大纲提前完结风险');

const parsedExpandedOutline = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_OUTLINE',
    target_total_chapters: 9,
    expansion_scope: 'rewrite_unwritten',
    approved_chapters: Array.from({length: 6}, (_, index) => ({chapter_no: index + 1})),
    existing_outlines: Array.from({length: 6}, (_, index) => ({chapter_no: index + 1})),
    choices: [{message: {content: JSON.stringify({
      chapters: [7, 8, 9].map((chapterNo) => ({
        chapter_no: chapterNo,
        title: `新章${chapterNo}`,
        summary: '扩写剧情',
      })),
    })}}],
  },
})[0].json;
assert.strictEqual(JSON.parse(parsedExpandedOutline.chapters_json).at(-1).chapter_no, 9, 'outline parser should accept complete rewrite-unwritten coverage');

const builtReview = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'REVIEW_CHAPTER',
    chapter_body: '第一段正文。\n第二段正文。',
    chapter_word_count: 1528,
    target_words_per_chapter: 2000,
    previous_chapter_summary: '林昼坐上去钟表店的车，怀表再次响起。',
    previous_chapter_ending: '林昼握紧怀表上车，车窗外的旧钟表店灯光突然熄灭。',
    director_card: {cross_chapter_transition: {mode: 'direct_continuation', opening_bridge: '从车内续写怀表异响。'}},
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
const reviewPrompt = builtReview.llm_request_body.messages[1].content;
assert.strictEqual(builtReview.prompt_key, 'review');
assert(
  reviewPrompt.includes('【系统统计字数】1528') &&
    reviewPrompt.includes('【允许范围】1700-2300') &&
    reviewPrompt.includes('字数判断必须以【系统统计字数】为唯一依据') &&
    reviewPrompt.includes('不得推测作者动机') &&
    reviewPrompt.includes('低于允许下限但仍达到目标字数 70% 以上，最多标 medium') &&
    reviewPrompt.includes('【跨章承接审稿】') &&
    reviewPrompt.includes('镜头转换是允许的') &&
    reviewPrompt.includes('direct_continuation 只允许用于同一时间、同一地点、同一行动链') &&
    reviewPrompt.includes('前 300 字必须交代') &&
    reviewPrompt.includes('【审稿事实边界】') &&
    reviewPrompt.includes('不得把“某个线索/道具”扩写成未铺垫的“某某案相关身份”') &&
    reviewPrompt.includes('allowed=true 且 should_block=false 时，不要把“跨章断链”写入 issues') &&
    reviewPrompt.includes('【评分硬规则】') &&
    reviewPrompt.includes('必须使用 0-100 分制整数') &&
    reviewPrompt.includes('不要输出 9、9.2、9.5') &&
    reviewPrompt.includes('cross_chapter_transition_review'),
  'review prompt should use authoritative DB word count and expose cross-chapter transition analysis'
);

const builtRewrite = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'REWRITE_CHAPTER',
    chapter_body: '旧稿正文。',
    issues: [{type: '逻辑', description: '主角动机跳变', severity: 'medium'}],
    suggestions: ['补足主角决定冒险的心理转折。'],
    human_comment: '',
    director_card: {
      chapter_intent: '旧钟表店必须保留为本章核心场景，不能把线索改到医院。',
      causal_chain: {
        irreversible_result: '主角公开承认自己听见过旧钟表店的午夜钟声。',
      },
      continuity_constraints: {
        must_not_break: ['主角手臂仍有伤，不能突然满血追车。'],
        future_outline_guardrails: ['第10章前不得揭露父亲真实身份。'],
      },
      foreshadowing_ops: [
        {thread_key: '第10章身份揭露', action: 'avoid_reveal', instruction: '只触碰异常称呼。', do_not_reveal: true},
      ],
      segment_plan: [{segment_no: 1, goal: '先修复陌生人可信度铺垫。'}],
    },
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
const rewritePrompt = builtRewrite.llm_request_body.messages[1].content;
assert.strictEqual(builtRewrite.prompt_key, 'rewrite');
assert(
    rewritePrompt.includes('重写依据优先级') &&
    rewritePrompt.includes('必须逐条阅读并落实【审稿问题】和【修改建议】') &&
    rewritePrompt.includes('如果【人工意见】与智能审稿一致或为空') &&
    rewritePrompt.includes('高/中风险问题必须在新正文中明显修正') &&
    rewritePrompt.includes('【重写事实边界】') &&
    rewritePrompt.includes('审稿建议和人工意见是修法清单，不是新增设定来源'),
  'rewrite prompt should force AI review issues and suggestions as the rewrite checklist'
);
assert(
  rewritePrompt.includes('【导演台重写约束】') &&
    rewritePrompt.includes('旧钟表店必须保留为本章核心场景') &&
    rewritePrompt.includes('不得提前揭露 do_not_reveal=true 的伏笔') &&
    rewritePrompt.includes('主角手臂仍有伤，不能突然满血追车'),
  'rewrite prompt should preserve the current READY director card constraints'
);

const builtDirector = runCodeNode('n8n/code/novel_build_glm_request.js', {
  json: {
    ...buildInput,
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    novel_bible: {
      world_setting: '旧城里钟表会记录异能痕迹。',
      story_core: '林昼追查父亲失踪。',
    },
    chapter_segment_total: 4,
    previous_chapters: [{chapter_no: 1, summary: '林昼发现父亲失踪和钟表店有关。'}],
    previous_chapter_ending: '林昼握紧怀表上车，旧钟表店的灯光在身后熄灭。',
    previous_transition_modes: [{chapter_no: 1, mode: 'direct_continuation'}],
    future_outlines: [{chapter_no: 3, summary: '真实身份仍不能揭露。'}],
    plot_threads: [{thread_key: '第10章身份揭露', status: 'ACTIVE', do_not_reveal_before: 10}],
    recent_review_issues: [{chapter_no: 1, issues: ['角色突然相信陌生人']}],
    director_request_comment: '解决导演台阻断',
    expansion_request: '让女主身世线在本章出现第一枚证据。',
    expansion_scope: 'rewrite_unwritten',
    expansion_constraints: '已批准正文不改；主角能力边界不升级过快。',
    director_repair_context: {
      current_status: 'NEEDS_REVIEW',
      expected_segment_count: 4,
      current_segment_count: 3,
      current_blocking_issues: [
        '事实来源不足：宫宴名为“太后举办的赏花宴”',
        '导演台 segment_plan 数量必须等于正文分段数：期望 4，实际 3',
      ],
      current_fact_source_audit: [{claim: '太后举办的赏花宴', verdict: 'unsupported'}],
    },
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
const directorPrompt = builtDirector.llm_request_body.messages[1].content;
assert.strictEqual(builtDirector.run_type, 'PLAN_CHAPTER_DIRECTOR');
assert.strictEqual(builtDirector.prompt_key, 'director');
assert.strictEqual(builtDirector.llm_request_body.max_tokens, 3200, 'four-segment director cards should get enough room to avoid truncating segment_plan');
assert(
  directorPrompt.includes('【正文分段数】4') &&
    directorPrompt.includes('【segment_plan 数量硬规则】') &&
    directorPrompt.includes('segment_no 必须从 1 连续编号到 4') &&
    directorPrompt.includes('segment_plan 数量必须严格等于') &&
    directorPrompt.includes('第10章身份揭露') &&
    directorPrompt.includes('最近审稿问题') &&
    directorPrompt.includes('【事实来源闸门】') &&
    directorPrompt.includes('不要把“某个道具/线索属于某人”自动写成“某某案/某某案相关身份”') &&
    directorPrompt.includes('fact_source_audit') &&
    directorPrompt.includes('推断') &&
    directorPrompt.includes('【跨章镜头调度】') &&
    directorPrompt.includes('cross_chapter_transition') &&
    directorPrompt.includes('【导演台阻断修复】') &&
    directorPrompt.includes('赏花宴') &&
    directorPrompt.includes('current_blocking_issues') &&
    directorPrompt.includes('如果上一版段数不足，本版必须补齐对应段计划') &&
    directorPrompt.includes('【项目扩写计划】') &&
    directorPrompt.includes('让女主身世线在本章出现第一枚证据') &&
    directorPrompt.includes('扩写范围：重排未写章节'),
  'director prompt should include segment count, plot ledger, recent review issues, transition planning, blocker repair context, and expansion plan'
);

const parsedDirector = runCodeNode('n8n/code/novel_parse_director_card_json.js', {
  json: {
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    project_id: '22222222-2222-2222-2222-222222222222',
    outline_id: '33333333-3333-3333-3333-333333333333',
    job_id: '44444444-4444-4444-4444-444444444444',
    chapter_no: 2,
    chapter_segment_total: 4,
    choices: [{message: {content: JSON.stringify({
      chapter_intent: '修正上一章信任断裂，让本章自然进入追查。',
      causal_chain: {
        from_previous: '上一章林昼不信任陌生人。',
        trigger: '陌生人交出旧怀表刻痕。',
        character_motives: ['林昼要确认父亲线索', '陌生人要换取短暂合作'],
        obstacles: ['林昼手臂受伤', '追兵迫近'],
        irreversible_result: '林昼暴露听钟能力。',
        to_next: '废弃地铁站坐标出现。',
      },
      continuity_constraints: {
        must_remember: ['林昼手臂受伤'],
        must_not_break: ['不能突然满血'],
        future_outline_guardrails: ['第10章前不得揭露父亲身份'],
      },
      foreshadowing_ops: [{thread_key: '第10章身份揭露', action: 'avoid_reveal', instruction: '只碰触不揭露', do_not_reveal: true, do_not_reveal_before: 10}],
      abruptness_risks: [{risk: '突然相信陌生人', reason: '缺少可信凭证', fix: '用旧怀表刻痕铺垫'}],
      fact_source_audit: [{claim: '从车内自然转到钟表店门口', source_type: 'previous_chapter_ending', source_evidence: '林昼握紧怀表上车', verdict: 'supported'}],
      cross_chapter_transition: {
        mode: 'natural_scene_cut',
        allowed: true,
        reason: '从上一章车内转到钟表店门口，省略路程。',
        opening_bridge: '第一段先交代林昼下车后仍握着怀表。',
        risk: '',
        needs_explicit_bridge: true,
      },
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [
        {segment_no: 1, goal: '旧怀表响起'},
        {segment_no: 2, goal: '可信凭证出现'},
        {segment_no: 3, goal: '追问地铁站线索'},
        {segment_no: 4, goal: '做出不可逆决定'},
      ],
    })}}],
  },
})[0].json;
assert.strictEqual(parsedDirector.director_status, 'READY');
assert.strictEqual(parsedDirector.chapter_segment_total, 4);
assert.strictEqual(JSON.parse(parsedDirector.card_payload_json).segment_plan.length, 4);
assert.strictEqual(JSON.parse(parsedDirector.card_payload_json).cross_chapter_transition.mode, 'natural_scene_cut');
assert.strictEqual(JSON.parse(parsedDirector.card_payload_json).fact_source_audit[0].verdict, 'supported');
assert.strictEqual(JSON.parse(parsedDirector.plot_threads_json)[0].status, 'ACTIVE');

const unsupportedDirector = runCodeNode('n8n/code/novel_parse_director_card_json.js', {
  json: {
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    project_id: '22222222-2222-2222-2222-222222222222',
    outline_id: '33333333-3333-3333-3333-333333333333',
    job_id: '44444444-4444-4444-4444-444444444444',
    chapter_no: 2,
    chapter_segment_total: 1,
    choices: [{message: {content: JSON.stringify({
      chapter_intent: '验证事实来源审计。',
      causal_chain: {},
      continuity_constraints: {},
      foreshadowing_ops: [],
      abruptness_risks: [],
      fact_source_audit: [{claim: '新增官方强制理由', source_type: 'none', source_evidence: '', verdict: 'unsupported'}],
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1, goal: '测试'}],
    })}}],
  },
})[0].json;
assert.strictEqual(unsupportedDirector.director_status, 'NEEDS_REVIEW');
assert(
  unsupportedDirector.blocking_issues_json.includes('事实来源不足'),
  'director parser should downgrade unsupported fact-source audits to NEEDS_REVIEW'
);

const inferredOfficialDirector = runCodeNode('n8n/code/novel_parse_director_card_json.js', {
  json: {
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    chapter_segment_total: 1,
    choices: [{message: {content: JSON.stringify({
      chapter_intent: '验证制度性理由来源。',
      causal_chain: {},
      continuity_constraints: {},
      foreshadowing_ops: [],
      abruptness_risks: [],
      fact_source_audit: [{claim: '以相关人等需集中看护为由强制转移', source_type: '推断', source_evidence: '某个线索属于关键人物', verdict: 'supported'}],
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1, goal: '测试'}],
    })}}],
  },
})[0].json;
assert.strictEqual(inferredOfficialDirector.director_status, 'NEEDS_REVIEW');
assert(
  inferredOfficialDirector.blocking_issues_json.includes('制度性理由不能用推断来源'),
  'director parser should not accept inferred institutional reasons as supported'
);

const mismatchedDirectorSegments = runCodeNode('n8n/code/novel_parse_director_card_json.js', {
  json: {
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    chapter_segment_total: 4,
    choices: [{message: {content: JSON.stringify({
      chapter_intent: '错误示例',
      causal_chain: {},
      continuity_constraints: {},
      foreshadowing_ops: [],
      abruptness_risks: [],
      fact_source_audit: [{claim: '无新增事实', source_type: 'outline', source_evidence: '测试', verdict: 'supported'}],
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1}, {segment_no: 2}],
    })}}],
  },
})[0].json;
assert.strictEqual(mismatchedDirectorSegments.director_status, 'NEEDS_REVIEW');
assert(
  mismatchedDirectorSegments.blocking_issues_json.includes('segment_plan 数量必须等于正文分段数'),
  'director parser should save mismatched segment plans as NEEDS_REVIEW instead of leaving the job running'
);

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_parse_director_card_json.js', {
    json: {
      run_type: 'PLAN_CHAPTER_DIRECTOR',
      chapter_segment_total: 1,
      choices: [{message: {content: JSON.stringify({
        chapter_intent: '错误示例',
        causal_chain: {},
        continuity_constraints: {},
        foreshadowing_ops: [],
        abruptness_risks: [],
        quality_gate: {pass: true, blocking_issues: []},
        chapter_body: '这里不应写正文。',
        segment_plan: [{segment_no: 1}],
      })}}],
    },
  });
}, '禁止包含正文字段');

const shortSegmentRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: buildInput,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(shortSegmentRequest.run_type, 'GENERATE_CHAPTER');
assert.strictEqual(shortSegmentRequest.chapter_segment_no, 1);
assert.strictEqual(shortSegmentRequest.chapter_segment_total, 1, '1200-word chapters should generate as one short model call');
assert.strictEqual(shortSegmentRequest.has_more_segments, false);
assert.strictEqual(shortSegmentRequest.next_chapter_segment_no, null);
assert.strictEqual(shortSegmentRequest.llm_request_body.max_tokens, 2400);
assert.deepStrictEqual(shortSegmentRequest.llm_request_body.thinking, {type: 'disabled'}, 'chapter segment calls should disable GLM thinking');
assert(
  shortSegmentRequest.llm_request_body.messages[1].content.includes('第 1/1 段') &&
    shortSegmentRequest.llm_request_body.messages[1].content.includes('分为 1 段生成'),
  'short segment prompt should explicitly generate the complete chapter in one segment'
);
assert(
  shortSegmentRequest.llm_request_body.messages[1].content.includes('segment_body 必须包含自然段换行'),
  'segment prompt should require paragraph breaks inside segment_body'
);
assert(
  shortSegmentRequest.llm_request_body.messages[1].content.includes('对话必须单独成段') &&
    shortSegmentRequest.llm_request_body.messages[1].content.includes('普通段建议 40-120 个中文字符') &&
    shortSegmentRequest.llm_request_body.messages[1].content.includes('chapter_title 只写标题本身'),
  'segment prompt should require dialogue and rhythm based paragraphing'
);

const twoSegmentBuildInput = {
  ...buildInput,
  target_words_per_chapter: 2000,
};
const segmentOneRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: twoSegmentBuildInput,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(segmentOneRequest.run_type, 'GENERATE_CHAPTER');
assert.strictEqual(segmentOneRequest.chapter_segment_no, 1);
assert.strictEqual(segmentOneRequest.chapter_segment_total, 2);
assert.strictEqual(segmentOneRequest.has_more_segments, true);
assert.strictEqual(segmentOneRequest.next_chapter_segment_no, 2);
assert.strictEqual(segmentOneRequest.llm_request_body.max_tokens, 2400);
assert(
  segmentOneRequest.llm_request_body.messages[1].content.includes('第 1/2 段') ||
    segmentOneRequest.llm_request_body.messages[1].content.includes('第 1/2 段正文'),
  'segment 1 prompt should explicitly generate only the first half'
);
assert(
  segmentOneRequest.llm_request_body.messages[1].content.includes('segment_body 必须包含自然段换行'),
  'segment prompt should require paragraph breaks inside segment_body'
);
assert(
  segmentOneRequest.llm_request_body.messages[1].content.includes('不要把多轮对话写在同一段'),
  'multi-segment prompt should reject dialogue blocks crammed into one paragraph'
);

const fourSegmentDirectorCard = {
  chapter_intent: '让林昼确认钟表店线索，但不能揭露父亲真实身份。',
  causal_chain: {
    from_previous: '上一章留下父亲失踪的压力。',
    trigger: '旧怀表在午夜再次响起。',
    character_motives: ['林昼想证明父亲不是逃避责任。'],
    obstacles: ['陌生协助者可信度不足。'],
    irreversible_result: '林昼暴露自己能听见钟声。',
    to_next: '线索指向废弃地铁站。',
  },
  continuity_constraints: {
    must_remember: ['林昼上一章手臂受伤。'],
    must_not_break: ['不能突然满血行动。'],
    future_outline_guardrails: ['第10章前不得揭露父亲身份。'],
  },
  foreshadowing_ops: [{thread_key: '第10章身份揭露', action: 'avoid_reveal', instruction: '只让读者看到异常称呼。', do_not_reveal: true}],
  abruptness_risks: [{risk: '林昼突然相信陌生人', fix: '先让对方拿出只有父亲知道的旧怀表刻痕。'}],
  cross_chapter_transition: {
    mode: 'summary_bridge',
    allowed: true,
    reason: '上一章以怀表响起收尾，本章开头省略赶路，用一句话交代抵达旧钟表店。',
    opening_bridge: '先写林昼下车仍听见怀表余响，再进入旧钟表店门口冲突。',
    needs_explicit_bridge: true,
  },
  quality_gate: {pass: true, blocking_issues: []},
  segment_plan: [
    {segment_no: 1, goal: '怀表响起', ending_hook: '陌生人敲门'},
    {segment_no: 2, goal: '验证陌生人可信度', ending_hook: '刻痕出现'},
    {segment_no: 3, goal: '追问线索', ending_hook: '废弃地铁站坐标'},
    {segment_no: 4, goal: '林昼做出不可逆决定', ending_hook: '门外脚步声'},
  ],
};
const fourSegmentRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: {
    ...buildInput,
    target_words_per_chapter: 4000,
    previous_chapter_ending: '林昼握着怀表坐上车，旧钟表店的钟声在雨里追了上来。',
    director_card: fourSegmentDirectorCard,
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
const fourSegmentPrompt = fourSegmentRequest.llm_request_body.messages[1].content;
assert.strictEqual(fourSegmentRequest.chapter_segment_total, 4, '4000-word chapters should use the existing four-segment strategy');
assert(
  fourSegmentPrompt.includes('【导演台全局约束】') &&
    fourSegmentPrompt.includes('【当前分段导演计划】') &&
    fourSegmentPrompt.includes('【上一章结尾片段】') &&
    fourSegmentPrompt.includes('【跨章承接要求】') &&
    fourSegmentPrompt.includes('怀表响起') &&
    fourSegmentPrompt.includes('不得提前揭露 do_not_reveal=true 的伏笔') &&
    fourSegmentPrompt.includes('【事实来源硬规则】') &&
    fourSegmentPrompt.includes('不得新造案名或身份'),
  'chapter segment prompt should inject director constraints, previous ending, transition bridge, and current segment plan'
);
assert(
  !fourSegmentPrompt.includes('林昼做出不可逆决定'),
  'segment 1 prompt should not receive future segment plans'
);

const parsedSegmentOne = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...segmentOneRequest,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '第一章：旧钟表店的第一声回响',
            segment_no: 1,
            segment_body: '林昼在雨夜推开旧钟表店的门，墙上的钟同时停住。',
            segment_summary: '林昼进入旧钟表店，发现时间异常。',
            bridge_to_next: '柜台后的老人说出了父亲的名字。',
            new_facts: [{fact_type: 'location', fact_key: 'old_clock_shop', fact_value: '店内钟表会在林昼进门时停住'}],
          }),
        },
      }],
    },
  },
})[0].json;
assert.strictEqual(parsedSegmentOne.parse_success, true);
assert.strictEqual(parsedSegmentOne.chapter_title, '旧钟表店的第一声回响', 'segment parser should strip generated chapter-number title prefixes');
assert.strictEqual(parsedSegmentOne.segment_no, 1);
assert.strictEqual(parsedSegmentOne.new_facts[0].fact_key, '地点：店内钟表会在林昼进门时停住');
assert.strictEqual(parsedSegmentOne.has_more_segments, true);
assert.strictEqual(parsedSegmentOne.next_chapter_segment_no, 2);
assert(parsedSegmentOne.segment_body.includes('旧钟表店'), 'segment parser should expose body text');
assert.strictEqual(
  JSON.parse(parsedSegmentOne.generated_segments_json).length,
  1,
  'segment parser should carry generated segments forward'
);

const parsedLongSingleParagraphSegment = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...shortSegmentRequest,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '第X章 旧钟表店的第一声回响',
            segment_no: 1,
            segment_body: Array(12).fill('林昼握紧怀表冲进雨里，街口的霓虹忽明忽暗，陌生人追上来逼他交出父亲留下的东西。').join(''),
            segment_summary: '林昼被追逐并守住怀表。',
            new_facts: [],
          }),
        },
      }],
    },
  },
})[0].json;
assert(
  (parsedLongSingleParagraphSegment.segment_body.match(/\n/g) || []).length >= 2,
  'segment parser should add readable paragraph breaks when a model returns one long paragraph'
);
assert(
  maxLineLength(parsedLongSingleParagraphSegment.segment_body) <= 170,
  'segment parser should keep generated paragraphs short enough for mobile reading'
);

const parsedStrayNarrativeKeySegment = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...shortSegmentRequest,
    segment_target_words: 900,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '坏 JSON 字段测试',
            segment_no: 1,
            segment_body: '暖阁里重新安静下来。\n沈落星从袖中取出那只紫檀木匣。',
            '喀哒"一声，机关弹开。\n里头躺着一枚赤金衔珠簪，背面刻着大渊皇室才有的半开莲图腾。': '怎么可能……',
            'n沈衍独坐密室，展开泛黄画卷。\n画中女婴手腕的朱砂胎记，与沈落星一模一样。': '她终归是我的。',
            segment_summary: '模型把正文错误拆成 JSON key。',
            new_facts: [],
          }),
        },
      }],
    },
  },
})[0].json;
assert.strictEqual(parsedStrayNarrativeKeySegment.parse_success, false, 'segment parser should reject body scattered into abnormal JSON keys');
assert(
  parsedStrayNarrativeKeySegment.error_message.includes('异常 JSON 字段'),
  'segment parser should explain malformed narrative JSON keys'
);

const segmentTwoRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: parsedSegmentOne,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(segmentTwoRequest.chapter_segment_no, 2);
assert.strictEqual(segmentTwoRequest.llm_request_body.max_tokens, 1800);
assert(
  segmentTwoRequest.llm_request_body.messages[1].content.includes('上一分段结尾片段') &&
    segmentTwoRequest.llm_request_body.messages[1].content.includes('墙上的钟同时停住'),
  'segment 2 prompt should carry forward compact segment 1 context'
);
assert(
  segmentTwoRequest.llm_request_body.messages[1].content.includes('角色称呼一致性') &&
    segmentTwoRequest.llm_request_body.messages[1].content.includes('正文不得散落到其他 JSON 字段名') &&
    segmentTwoRequest.llm_request_body.messages[1].content.includes('半角英文双引号'),
  'segment prompt should enforce naming consistency and prevent narrative text from becoming JSON keys'
);

const parsedSegmentTwo = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...segmentTwoRequest,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '旧钟表店的第一声回响',
            segment_no: 2,
            segment_body: '老人递出一枚倒走的怀表，林昼终于明白父亲失踪不是意外。',
            segment_summary: '林昼拿到怀表，确认父亲失踪另有隐情。',
            new_facts: [{fact_type: 'item', fact_key: '倒走的怀表', fact_value: '怀表会倒走并指向父亲失踪线索'}],
          }),
        },
      }],
    },
  },
})[0].json;
assert.strictEqual(parsedSegmentTwo.parse_success, true);
assert.strictEqual(parsedSegmentTwo.chapter_title, '旧钟表店的第一声回响');
assert.strictEqual(parsedSegmentTwo.has_more_segments, false);
assert.strictEqual(parsedSegmentTwo.next_chapter_segment_no, null);
assert.strictEqual(JSON.parse(parsedSegmentTwo.generated_segments_json).length, 2);
const combinedChapter = runCodeNode('n8n/code/novel_combine_chapter_segments.js', {
  json: parsedSegmentTwo,
})[0].json;
assert.strictEqual(combinedChapter.chapter_title, '旧钟表店的第一声回响');
assert(
  combinedChapter.chapter_body.includes('墙上的钟同时停住') &&
    combinedChapter.chapter_body.includes('倒走的怀表'),
  'chapter combiner should join both generated segments'
);
assert.strictEqual(JSON.parse(combinedChapter.parsed_payload_json).segments.length, 2);
assert.strictEqual(JSON.parse(combinedChapter.new_facts_json).length, 2);
assert(combinedChapter.chapter_body_base64, 'chapter combiner should expose base64 body for safe SQL writes');

const threeSegmentOneRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: {
    ...buildInput,
    target_words_per_chapter: 3000,
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(threeSegmentOneRequest.chapter_segment_total, 3);
assert.strictEqual(threeSegmentOneRequest.next_chapter_segment_no, 2);
assert(
  threeSegmentOneRequest.llm_request_body.messages[1].content.includes('第 1/3 段'),
  '3000-word chapters should use three slices'
);
const threeSegmentOneParsed = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...threeSegmentOneRequest,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '三段测试章',
            segment_no: 1,
            segment_body: '第一段正文，打开冲突。',
            segment_summary: '打开冲突。',
            new_facts: [],
          }),
        },
      }],
    },
  },
})[0].json;
const threeSegmentTwoRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: threeSegmentOneParsed,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(threeSegmentTwoRequest.chapter_segment_no, 2);
assert.strictEqual(threeSegmentTwoRequest.chapter_segment_total, 3);
assert.strictEqual(threeSegmentTwoRequest.has_more_segments, true);
assert(
  threeSegmentTwoRequest.llm_request_body.messages[1].content.includes('已生成分段摘要') &&
    threeSegmentTwoRequest.llm_request_body.messages[1].content.includes('第 2/3 段'),
  'middle segment prompts should carry prior summaries and keep the same total segment count'
);
const threeSegmentTwoParsed = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...threeSegmentTwoRequest,
    llm_response: {
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '三段测试章',
            segment_no: 2,
            segment_body: '第二段正文，升级危机。',
            segment_summary: '升级危机。',
            new_facts: [],
          }),
        },
      }],
    },
  },
})[0].json;
const threeSegmentThreeRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: threeSegmentTwoParsed,
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(threeSegmentThreeRequest.chapter_segment_no, 3);
assert.strictEqual(threeSegmentThreeRequest.has_more_segments, false);
assert(
  threeSegmentThreeRequest.llm_request_body.messages[1].content.includes('收束切片'),
  'last segment prompt should switch to closing-hook instructions'
);

const longSegmentRequest = runCodeNode('n8n/code/novel_build_chapter_segment_request.js', {
  json: {
    ...buildInput,
    target_words_per_chapter: 8000,
  },
  env: {NOVEL_GENERATION_CONFIG_PATH: configPath},
})[0].json;
assert.strictEqual(longSegmentRequest.chapter_segment_total, 7);
assert.strictEqual(longSegmentRequest.next_chapter_segment_no, 2);
assert(
  longSegmentRequest.llm_request_body.messages[1].content.includes('第 1/7 段'),
  '8000-word chapters should use the maximum seven-slice plan'
);

const parsedBadSegment = runCodeNode('n8n/code/novel_parse_chapter_segment_json.js', {
  json: {
    ...segmentOneRequest,
    llm_response: {choices: [{message: {content: '不是 JSON'}}]},
  },
})[0].json;
assert.strictEqual(parsedBadSegment.parse_success, false, 'segment parser should route invalid JSON to DB failure handling');

const parsedChapter = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: readJson('glm_chapter_response.json'),
})[0].json;
assert.strictEqual(parsedChapter.run_type, 'GENERATE_CHAPTER');
assert.strictEqual(parsedChapter.chapter_title, '旧钟表店的第一声回响');
assert.strictEqual(parsedChapter.word_count_estimate, 1280);
assert.strictEqual(parsedChapter.new_facts.length, 2);
assert.strictEqual(parsedChapter.new_facts[0].fact_type, 'item');
assert.strictEqual(parsedChapter.new_facts[1].fact_type, 'foreshadowing');
assert.doesNotThrow(() => JSON.parse(parsedChapter.parsed_payload_json));
assert.doesNotThrow(() => JSON.parse(parsedChapter.new_facts_json));
assert(parsedChapter.chapter_body_base64, 'chapter parser should expose base64 body for safe SQL writes');

const parsedPrefixedTitleChapter = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REWRITE_CHAPTER',
    outline_title: '雨夜追逐',
    choices: [{
      message: {
        content: JSON.stringify({
          chapter_title: '第X章 雨夜追逐',
          chapter_body: '雨点砸在玻璃上，林昼攥紧怀表。',
          chapter_summary: '林昼雨夜追逐线索。',
          word_count_estimate: 24,
          new_facts: [],
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedPrefixedTitleChapter.chapter_title, '雨夜追逐', 'chapter parser should strip 第X章 style title prefixes');

const parsedOutlineWithPrefixedTitles = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_OUTLINE',
    choices: [{
      message: {
        content: JSON.stringify({
          chapters: [
            {chapter_no: 1, volume_no: 1, title: '第一章：旧钟表店', summary: '开局。'},
            {chapter_no: 2, volume_no: 1, title: '第2章 雨夜追逐', summary: '追逐。'},
          ],
        }),
      },
    }],
  },
})[0].json;
assert.deepStrictEqual(
  parsedOutlineWithPrefixedTitles.chapters.map((chapter) => chapter.title),
  ['旧钟表店', '雨夜追逐'],
  'outline parser should strip generated chapter-number title prefixes'
);

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_parse_glm_json.js', {
    json: {
      ...buildInput,
      run_type: 'GENERATE_CHAPTER',
      target_words_per_chapter: 1200,
      choices: [{
        message: {
          content: JSON.stringify({
            chapter_title: '坏 JSON 字段测试',
            chapter_body: '暖阁里重新安静下来。\n沈落星从袖中取出那只紫檀木匣。',
            '喀哒"一声，机关弹开。\n里头躺着一枚赤金衔珠簪，背面刻着大渊皇室才有的半开莲图腾。': '怎么可能……',
            'n沈衍独坐密室，展开泛黄画卷。\n画中女婴手腕的朱砂胎记，与沈落星一模一样。': '她终归是我的。',
            chapter_summary: '模型把正文错误拆成 JSON key。',
            new_facts: [],
          }),
        },
      }],
    },
  });
}, '异常 JSON 字段');

const parsedRhythmChapter = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REWRITE_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          chapter_title: '节奏拆段测试',
          chapter_body: [
            '陆泽把合同摔在桌上，会议室里所有人的目光都压了过来，方凯笑着说：“陆总，你现在签字，还能体面一点。”沈清秋站在门口，指尖攥得发白，她明明想开口，却被赵强抢先一步堵住。',
            '陆泽看见屏幕上跳出的旧照片，前世那场车祸像一把冷刀扎进脑海，他忽然明白，所谓并购只是局中局。下一秒，电话响了，陌生号码只留下一句话：“想救她，就到天台来。”',
          ].join(''),
          chapter_summary: '陆泽识破并购骗局，收到天台威胁。',
          word_count_estimate: 260,
          new_facts: [],
        }),
      },
    }],
  },
})[0].json;
assert(
  (parsedRhythmChapter.chapter_body.match(/\n/g) || []).length >= 5,
  'chapter parser should split mixed dialogue, action, and inner monologue into rhythm paragraphs'
);
assert(
  maxLineLength(parsedRhythmChapter.chapter_body) <= 170,
  'chapter parser should prevent oversized mixed-content paragraphs'
);
assert(
  JSON.parse(parsedRhythmChapter.parsed_payload_json).chapter_body === parsedRhythmChapter.chapter_body,
  'chapter parser payload JSON should preserve normalized paragraphing'
);
const parsedQuotedNounChapter = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          chapter_title: '专名引号测试',
          chapter_body: '看着这张前世坑过自己的“好兄弟”的脸，陆泽忍不住笑了。今天下午三点，江城本土企业‘星海科技’将发布公告，资本市场会被彻底引爆。',
          chapter_summary: '陆泽识别赵强并判断星海科技机会。',
          word_count_estimate: 90,
          new_facts: [],
        }),
      },
    }],
  },
})[0].json;
assert(
  parsedQuotedNounChapter.chapter_body.includes('自己的“好兄弟”的脸') &&
    parsedQuotedNounChapter.chapter_body.includes('企业‘星海科技’将'),
  'chapter parser should not treat quoted nouns or company names as standalone dialogue paragraphs'
);

const parsedUnknownFact = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          chapter_title: '测试章节',
          chapter_body: '测试正文',
          chapter_summary: '测试摘要',
          word_count_estimate: 300,
          new_facts: [{fact_type: 'organization', fact_key: '未知组织', fact_value: '真实模型可能返回 schema 外类型'}],
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedUnknownFact.new_facts[0].fact_type, 'other');

const parsedReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: readJson('glm_review_response.json'),
})[0].json;
assert.strictEqual(parsedReview.run_type, 'REVIEW_CHAPTER');
assert.strictEqual(parsedReview.total_score, 87);
assert.strictEqual(parsedReview.verdict, 'PASS');
assert.strictEqual(JSON.parse(parsedReview.issues_json)[0].type, '节奏');

const parsedTenPointReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 9.5,
          readability_score: 9,
          plot_score: 9.5,
          commercial_score: 9.5,
          total_score: 9.4,
          issues: [],
          suggestions: [],
          verdict: 'PASS',
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedTenPointReview.total_score, 94, 'review parser should normalize 0-10 GLM scores to 0-100');
assert.strictEqual(parsedTenPointReview.readability_score, 90, 'individual 0-10 scores should also be normalized');
assert.strictEqual(JSON.parse(parsedTenPointReview.parsed_payload_json).score_scale_normalized_from, '0-10');

const parsedTransitionReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 72,
          readability_score: 80,
          plot_score: 62,
          commercial_score: 76,
          total_score: 70,
          issues: [],
          suggestions: ['补写从旧楼到新基地的过桥段。'],
          verdict: 'MANUAL_REVIEW',
          cross_chapter_transition_review: {
            mode: 'time_skip',
            allowed: false,
            evidence: '上一章结尾刚离开旧楼，本章开头已经在新基地执行任务。',
            risk: '缺少人物为何从旧场景转到新场景的承接。',
            fix: '开头补一段途中被已有势力拦下并转送新地点的过桥戏。',
            should_block: true,
          },
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedTransitionReview.cross_chapter_transition_review.mode, 'time_skip');
assert(
  JSON.parse(parsedTransitionReview.issues_json).some((issue) => issue.type === '跨章断链' && issue.severity === 'high'),
  'review parser should surface blocking cross-chapter breaks as review issues'
);

const parsedContradictoryTransitionReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    previous_chapter_ending: '她转身上车，司机会送她回安全屋，车辆很快驶远。',
    chapter_body: '新基地的外墙足有八尺高，墙头插着的碎瓷片在月色下泛着冷光。她提着裙摆，盯着墙头叹气。',
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 90,
          readability_score: 95,
          plot_score: 85,
          commercial_score: 95,
          total_score: 91,
          issues: [],
          suggestions: [],
          verdict: 'MANUAL_REVIEW',
          cross_chapter_transition_review: {
            mode: 'direct_continuation',
            allowed: true,
            evidence: '上一章结尾坐上车辆离开旧地点，本章开头直接转场至新基地，属于时间流逝与空间转换。',
            risk: '',
            fix: '',
            should_block: false,
          },
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedContradictoryTransitionReview.cross_chapter_transition_review.allowed, false);
assert.strictEqual(parsedContradictoryTransitionReview.cross_chapter_transition_review.should_block, true);
assert(
  JSON.parse(parsedContradictoryTransitionReview.issues_json).some((issue) => issue.type === '跨章断链' && issue.severity === 'high'),
  'review parser should harden contradictory transition approvals from the model'
);

const parsedAllowedTransitionNoise = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 90,
          readability_score: 94,
          plot_score: 88,
          commercial_score: 90,
          total_score: 90,
          issues: [{
            type: '跨章断链',
            severity: 'low',
            description: '当前处理属于合理的情节延展，未产生严重断链。',
          }],
          suggestions: ['扩写甜宠互动。'],
          verdict: 'MANUAL_REVIEW',
          cross_chapter_transition_review: {
            mode: 'natural_scene_cut',
            allowed: true,
            evidence: '车辆刚驶出旧地点便被拦下，行动线衔接流畅。',
            risk: '无跨章断链风险。',
            fix: '无需修改跨章衔接。',
            should_block: false,
          },
        }),
      },
    }],
  },
})[0].json;
assert(
  !JSON.parse(parsedAllowedTransitionNoise.issues_json).some((issue) => issue.type === '跨章断链'),
  'review parser should remove low-value cross-chapter issues when transition review allows the scene cut'
);

const parsedLengthReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    target_words_per_chapter: 2000,
    chapter_word_count: 1528,
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 90,
          readability_score: 95,
          plot_score: 92,
          commercial_score: 85,
          total_score: 88,
          issues: [{
            type: '字数不达标',
            severity: 'high',
            description: '正文仅约600字左右，作者明显为了缩短篇幅，属于严重短章。',
          }],
          suggestions: ['补足商业细节。'],
          verdict: 'REWRITE',
        }),
      },
    }],
  },
})[0].json;
const normalizedLengthIssue = JSON.parse(parsedLengthReview.issues_json)[0];
assert.strictEqual(normalizedLengthIssue.severity, 'medium');
assert(
  normalizedLengthIssue.description.includes('系统统计字数为1528字') &&
    normalizedLengthIssue.description.includes('允许范围1700-2300字') &&
    !normalizedLengthIssue.description.includes('约600') &&
    !normalizedLengthIssue.description.includes('作者明显') &&
    !normalizedLengthIssue.description.includes('严重'),
  'review parser should rewrite hallucinated word-count issues from authoritative stats'
);

const parsedOverflowReview = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'REVIEW_CHAPTER',
    choices: [{
      message: {
        content: JSON.stringify({
          consistency_score: 95,
          readability_score: 93,
          plot_score: 94,
          commercial_score: 96,
          total_score: 378,
          issues: [],
          suggestions: [],
          verdict: 'PASS',
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedOverflowReview.total_score, 100, 'review scores should be clamped to DB-safe 0..100 range');

const parsedChineseBible = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_BIBLE',
    choices: [{
      message: {
        content: JSON.stringify({
          世界设定: '旧城有隐秘商会。',
          故事核心: '主角回城翻盘。',
          主角设定: {姓名: '陆明', 身份: '修表师', 目标: '翻身', 身份说明: '真实身份暂时隐藏'},
          配角设定: [{姓名: '许青', 与主角关系: '盟友'}],
          反派设定: [{姓名: '赵衡', 与主角冲突: '争夺旧城控制权', 威胁等级: '高'}],
          组织势力: [{名称: '万衡商会', 类型: '商会', 负责人: '赵衡', 利益: '垄断旧城资源'}],
          关键地点: [{名称: '旧钟楼', 类型: '禁区', 所属: '万衡商会', 剧情功能: '伏笔汇合点'}],
          剧情约束: [{约束: '第4章前不能揭露钟楼真相', 原因: '保留悬念', 揭露章节: 4}],
          扩写备注: '新增商会线只影响后续章节。',
          能力体系: '信息差与资本博弈。',
          人物关系: [{来源角色: '陆明', 目标角色: '许青', 关系: '互相信任'}],
          文风规则: '节奏快。',
          禁忌规则: '不乱改角色名。',
          卖点: ['逆袭', '商战'],
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsedChineseBible.world_setting, '旧城有隐秘商会。');
assert.strictEqual(JSON.parse(parsedChineseBible.main_character_json).identity_note, '真实身份暂时隐藏');
assert.strictEqual(JSON.parse(parsedChineseBible.supporting_characters_json)[0].relationship_with_mc, '盟友');
assert.strictEqual(JSON.parse(parsedChineseBible.villain_setting_json)[0].conflict_with_mc, '争夺旧城控制权');
assert.strictEqual(JSON.parse(parsedChineseBible.villain_setting_json)[0].threat_level, '高');
assert.strictEqual(JSON.parse(parsedChineseBible.organizations_json)[0].leader, '赵衡');
assert.strictEqual(JSON.parse(parsedChineseBible.locations_json)[0].story_function, '伏笔汇合点');
assert.strictEqual(JSON.parse(parsedChineseBible.plot_constraints_json)[0].constraint, '第4章前不能揭露钟楼真相');
assert.strictEqual(parsedChineseBible.expansion_notes, '新增商会线只影响后续章节。');

const parsedBiblePatch = runCodeNode('n8n/code/novel_parse_glm_json.js', {
  json: {
    run_type: 'GENERATE_BIBLE_PATCH',
    choices: [{
      message: {
        content: JSON.stringify({
          summary: '为扩写增加商会和家族阻力。',
          new_characters: [{姓名: '苏棠', 身份: '女主表姐', 与主角关系: '暂时敌对'}],
          new_organizations: [{名称: '万衡商会', 类型: '商会', 负责人: '赵衡', 与主角冲突: '争夺旧城控制权'}],
          new_locations: [{名称: '旧钟楼', 类型: '禁区', 剧情功能: '伏笔汇合点'}],
          relationship_updates: [{from: '陆明', to: '苏棠', relationship: '先敌后友'}],
          plot_constraints: [{约束: '第4章前不能揭露钟楼真相', 原因: '保留悬念'}],
          risk_notes: [{risk: '女主线可能挤压主线', suggested_fix: '只放后续章节'}],
        }),
      },
    }],
  },
})[0].json;
const patchPayload = JSON.parse(parsedBiblePatch.patch_payload_json);
assert.strictEqual(parsedBiblePatch.run_type, 'GENERATE_BIBLE_PATCH');
assert.strictEqual(patchPayload.new_characters[0].name, '苏棠');
assert.strictEqual(patchPayload.new_organizations[0].leader, '赵衡');
assert.strictEqual(patchPayload.plot_constraints[0].constraint, '第4章前不能揭露钟楼真相');
assert.strictEqual(JSON.parse(parsedBiblePatch.risk_notes_json)[0].risk, '女主线可能挤压主线');

const validatedChineseBibleUpdate = runCodeNode('n8n/code/novel_validate_bible_update.js', {
  json: {
    body: {
      project_id: '22222222-2222-2222-2222-222222222222',
      story_core: '主角回城翻盘。',
      world_setting: '旧城有隐秘商会。',
      main_character_json: JSON.stringify({姓名: '陆明', 身份说明: '真实身份暂时隐藏', 目标: '翻身'}),
      supporting_characters_json: JSON.stringify([{姓名: '许青', 与主角关系: '盟友'}]),
      villain_setting_json: JSON.stringify([{姓名: '赵衡', 与主角冲突: '争夺旧城控制权', 威胁等级: '高'}]),
      relationship_map_json: JSON.stringify([{来源角色: '陆明', 目标角色: '许青', 关系: '互相信任'}]),
      organizations_json: JSON.stringify([{名称: '万衡商会', 类型: '商会', 负责人: '赵衡'}]),
      locations_json: JSON.stringify([{名称: '旧钟楼', 剧情功能: '伏笔汇合点'}]),
      plot_constraints_json: JSON.stringify([{约束: '第4章前不能揭露钟楼真相'}]),
      expansion_notes: '扩写只影响后续章节。',
      selling_points_json: JSON.stringify(['逆袭']),
    },
  },
})[0].json;
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.main_character_json).identity_note, '真实身份暂时隐藏');
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.supporting_characters_json)[0].relationship_with_mc, '盟友');
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.villain_setting_json)[0].conflict_with_mc, '争夺旧城控制权');
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.organizations_json)[0].leader, '赵衡');
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.locations_json)[0].story_function, '伏笔汇合点');
assert.strictEqual(JSON.parse(validatedChineseBibleUpdate.plot_constraints_json)[0].constraint, '第4章前不能揭露钟楼真相');
assert.strictEqual(validatedChineseBibleUpdate.expansion_notes, '扩写只影响后续章节。');

const biblePatchAction = runCodeNode('n8n/code/novel_validate_bible_patch_action.js', {
  json: {
    body: {
      patch_id: '33333333-3333-3333-3333-333333333333',
      patch_action: '确认',
      comment: '通过',
      reviewer: 'phase2_test',
    },
  },
})[0].json;
assert.strictEqual(biblePatchAction.patch_action, 'APPLY');
assert.strictEqual(biblePatchAction.reviewer, 'phase2_test');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_parse_glm_json.js', {
    json: {
      run_type: 'GENERATE_CHAPTER',
      choices: [{message: {content: '不是 JSON'}}],
    },
  });
}, '不是合法 JSON');

const html = runCodeNode('n8n/code/novel_render_review_html.js', {
  inputItems: readJson('review_rows.json'),
})[0].json.html;
assert(html.includes('小说审核中心'), 'review HTML should render title');
assert(html.includes('method="POST"'), 'review action forms must use POST');
assert(html.includes('/webhook/novel-review-action'), 'review action target missing');
assert(html.includes('name="review_token"'), 'review token hidden field missing');
assert(!/href=["'][^"']*novel-review-action/i.test(html), 'review actions must not be GET links');
assert(html.includes('window.confirm'), 'review HTML should confirm human review actions');
assert(html.includes('跨章承接分析') && html.includes('自然转场'), 'review HTML should expose cross-chapter transition analysis');

const approvedAction = runCodeNode('n8n/code/novel_validate_review_action.js', {
  json: readJson('review_action_approve.json'),
})[0].json;
assert.strictEqual(approvedAction.action, 'APPROVE');
assert.strictEqual(approvedAction.action_sql_function, 'approve_novel_chapter');
assert.strictEqual(approvedAction.reviewer, 'phase2_tdd');

const rewriteAction = runCodeNode('n8n/code/novel_validate_review_action.js', {
  json: {
    body: {
      chapter_id: '22222222-2222-2222-2222-222222222222',
      review_token: 'review-token-phase2',
      action: 'request_rewrite',
    },
  },
})[0].json;
assert.strictEqual(rewriteAction.action, 'REQUEST_REWRITE');
assert.strictEqual(rewriteAction.action_sql_function, 'request_novel_chapter_rewrite');

const rejectAction = runCodeNode('n8n/code/novel_validate_review_action.js', {
  json: {
    body: {
      chapter_id: '22222222-2222-2222-2222-222222222222',
      review_token: 'review-token-phase2',
      action: 'reject',
    },
  },
})[0].json;
assert.strictEqual(rejectAction.action, 'REJECT');
assert.strictEqual(rejectAction.action_sql_function, 'reject_novel_chapter');

const directorSaveAction = runCodeNode('n8n/code/novel_validate_director_card_action.js', {
  json: {
    body: {
      project_id: '22222222-2222-2222-2222-222222222222',
      director_card_id: '55555555-5555-5555-5555-555555555555',
      action: 'save_current',
      reviewer: 'phase2_tdd',
      card_payload: JSON.stringify(fourSegmentDirectorCard),
    },
  },
})[0].json;
assert.strictEqual(directorSaveAction.action, 'UPDATE_DIRECTOR_CARD');
assert.strictEqual(directorSaveAction.reviewer, 'phase2_tdd');
assert.strictEqual(JSON.parse(directorSaveAction.card_payload_json).segment_plan.length, 4);

const directorStartAction = runCodeNode('n8n/code/novel_validate_director_card_action.js', {
  json: {
    body: {
      project_id: '22222222-2222-2222-2222-222222222222',
      director_card_id: '55555555-5555-5555-5555-555555555555',
      action: 'generate_chapter',
    },
  },
})[0].json;
assert.strictEqual(directorStartAction.action, 'START_CHAPTER_FROM_DIRECTOR');

const reviewManualEdit = runCodeNode('n8n/code/novel_validate_review_manual_edit.js', {
  json: {
    body: {
      chapter_id: '22222222-2222-2222-2222-222222222222',
      review_token: 'review-token-phase2',
      title: '人工改稿标题',
      body: '人工改稿正文',
      decision: 'direct_approve',
    },
  },
})[0].json;
assert.strictEqual(reviewManualEdit.action, 'MANUAL_EDIT_REVIEW_CHAPTER');
assert.strictEqual(reviewManualEdit.decision, 'APPROVE');
assert.strictEqual(reviewManualEdit.body, '人工改稿正文');

const reviewManualEditDefault = runCodeNode('n8n/code/novel_validate_review_manual_edit.js', {
  json: {
    body: {
      chapter_id: '22222222-2222-2222-2222-222222222222',
      review_token: 'review-token-phase2',
      title: '人工改稿标题',
      body: '人工改稿正文',
    },
  },
})[0].json;
assert.strictEqual(reviewManualEditDefault.decision, 'SAVE_ONLY');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_validate_review_action.js', {
    json: readJson('review_action_get_like_query.json'),
  });
}, '审核动作必须通过 POST body 提交');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_validate_review_action.js', {
    json: {body: {chapter_id: '22222222-2222-2222-2222-222222222222', action: 'approve'}},
  });
}, '缺少 review_token');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_validate_review_action.js', {
    json: {body: {chapter_id: 'bad-id', review_token: 'token', action: 'approve'}},
  });
}, '无效 chapter_id');

assertThrowsMessage(() => {
  runCodeNode('n8n/code/novel_validate_review_manual_edit.js', {
    json: {query: {chapter_id: '22222222-2222-2222-2222-222222222222'}},
  });
}, '审核改稿必须通过 POST body 提交');

console.log(JSON.stringify({
  result: 'phase2_code_node_tdd_passed',
  promptVersion: builtJson.prompt_version,
  parsedChapterFacts: parsedChapter.new_facts.length,
  reviewTotalScore: parsedReview.total_score,
  htmlUsesPost: html.includes('method="POST"'),
  approvedFunction: approvedAction.action_sql_function,
  rewriteFunction: rewriteAction.action_sql_function,
  rejectFunction: rejectAction.action_sql_function,
}, null, 2));
