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
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; }
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
    .ai-assist { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; touch-action: manipulation; white-space: nowrap; }
    .ai-assist:hover { border-color: var(--accent); background: #e2f3eb; }
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

      const profiles = {
        urban: {
          lead: ['濒临破产的前创投天才', '被亲近之人背叛的商业操盘手', '背着债务重回关键节点的普通青年'],
          trigger: ['重生回到命运崩塌前七十二小时', '意外拿到未来三年的行业暗线', '被迫接手一家濒临清算的小公司'],
          conflict: ['资本围猎、亲友背叛和舆论反噬同时压来', '旧敌提前布局，试图抢走最后一张底牌', '每一次翻盘都会引出更高层级的幕后玩家'],
          payoff: ['破局翻盘、打脸反转和商业博弈爽点', '短目标兑现、强反转和章末危机升级'],
          hook: ['新的盟友其实藏着前世没看穿的秘密', '赢下当前局后，真正的操盘者才露出轮廓'],
          title: ['逆流成王', '重启破局', '资本回响', '绝境翻盘', '暗盘重生'],
        },
        fantasy: {
          lead: ['被废掉根基的少年', '携带残缺传承的边境小人物', '从宗门底层爬起的弃徒'],
          trigger: ['在生死关头唤醒古老传承', '发现体内封印着失落时代的规则碎片', '被迫踏入一场跨越诸天的试炼'],
          conflict: ['宗门压迫、血脉谜团和强敌追杀层层升级', '修炼规则被权贵垄断，主角只能用禁忌路径破局', '每次升级都要付出代价，也逼近隐藏真相'],
          payoff: ['升级突破、越级反杀和秘境夺宝爽点', '境界成长、热血战斗和强章末钩子'],
          hook: ['传承真正的主人并未死去', '下一处秘境里藏着主角身世的反证'],
          title: ['万道归墟', '逆命天途', '长生破劫', '九霄燃骨', '一剑开天'],
        },
        suspense: {
          lead: ['背负旧案的民间调查者', '被卷入连环事件的普通人', '拥有异常记忆的年轻刑侦顾问'],
          trigger: ['收到一封来自死者的定时信件', '发现身边人都在隐瞒同一个夜晚', '被迫调查一桩被反复删改的旧案'],
          conflict: ['证据被不断改写，嫌疑人和受害者身份多次反转', '真相牵出更大的组织，也让主角成为下一个目标', '每个答案都会打开一个更危险的问题'],
          payoff: ['线索推进、身份反转和高压追查', '悬念递进、证据闭环和克制反转'],
          hook: ['最后一条线索指向主角自己', '下一名证人开口前已经失踪'],
          title: ['第十三封信', '雾中回声', '旧案未眠', '死者来电', '无声证词'],
        },
        romance: {
          lead: ['被迫重启人生的女主', '在人生低谷里重新夺回主动权的年轻女性', '带着秘密归来的女主'],
          trigger: ['意外发现婚约背后的利益骗局', '与曾经错过的人在新身份下重逢', '为了守住家人和事业，被迫进入一段契约关系'],
          conflict: ['情感拉扯、家族压力和事业危机交织推进', '旧误会被层层揭开，真心和利益难以分辨', '亲密关系每进一步都会触发新的外部阻力'],
          payoff: ['情绪递进、关系拉扯和双向奔赴', '高密度互动、甜虐反转和人物成长'],
          hook: ['对方保留的秘密恰好能推翻旧真相', '一次公开选择让两人的关系彻底失控'],
          title: ['春夜迟来', '偏爱入局', '雾色告白', '心动合约', '旧梦吻痕'],
        },
        sciFi: {
          lead: ['末世边缘的维修师', '掌握异常数据的底层研究员', '在灾变后醒来的普通人'],
          trigger: ['发现灾变倒计时并非自然生成', '捡到一段来自未来的求救信号', '意外绑定一套失控的生存系统'],
          conflict: ['资源争夺、秩序崩塌和隐藏实验同时爆发', '主角必须在生存和真相之间不断取舍', '每次修复世界都会暴露更大的系统漏洞'],
          payoff: ['生存压迫、技术破局和团队升级', '危机推进、末世爽点和悬念反转'],
          hook: ['下一次灾变其实已经被人为提前', '所谓安全区藏着最危险的实验核心'],
          title: ['废土回声', '末日重启者', '星火避难所', '倒计时纪元', '异常生还'],
        },
        general: {
          lead: ['被命运逼到低谷的主角', '拥有隐秘优势的小人物', '在关键节点重新选择的人'],
          trigger: ['意外获得一次改写人生的机会', '发现身边危机背后藏着更大的阴谋', '被迫接下一个看似不可能完成的目标'],
          conflict: ['外部强压、内部误解和隐藏敌人连续升级', '每一步胜利都会换来更高难度的反击', '主角必须在情感、利益和信念之间做选择'],
          payoff: ['目标推进、冲突升级和章末钩子', '人物成长、情绪兑现和持续追更理由'],
          hook: ['真正的幕后人物在结尾露出线索', '新的选择会改变所有人的命运'],
          title: ['逆光回响', '破局之日', '长夜将明', '风起旧城', '命运回声'],
        },
      };

      function valueOf(node) {
        return String(node && node.value ? node.value : '').trim();
      }

      function profileFor(genre) {
        if (/玄幻|仙侠|异世界/.test(genre)) return profiles.fantasy;
        if (/悬疑|灵异/.test(genre)) return profiles.suspense;
        if (/言情|甜宠/.test(genre)) return profiles.romance;
        if (/科幻|末世/.test(genre)) return profiles.sciFi;
        if (/都市|现实|游戏|历史|种田/.test(genre)) return profiles.urban;
        return profiles.general;
      }

      function hash(text) {
        let result = 0;
        for (let index = 0; index < text.length; index += 1) {
          result = ((result << 5) - result + text.charCodeAt(index)) | 0;
        }
        return Math.abs(result);
      }

      function pick(list, seed, offset) {
        return list[(seed + offset) % list.length];
      }

      function readerEmotion(audience) {
        if (/男频|爽文|快节奏/.test(audience)) return '逆袭快感、压迫释放和连续打脸';
        if (/女频|情感|甜/.test(audience)) return '情绪拉扯、关系递进和人物成长';
        if (/悬疑|烧脑/.test(audience)) return '线索闭环、反转惊喜和真相追逐';
        if (/玄幻|仙侠/.test(audience)) return '升级成就、越级挑战和世界观探索';
        return '清晰目标、稳定爽点和持续追更期待';
      }

      function styleBeat(style) {
        return style.split('、').filter(Boolean).slice(0, 2).join('、') || '冲突推进、章末留钩';
      }

      function buildIdea() {
        const genre = valueOf(genreSelect);
        const audience = valueOf(audienceSelect);
        const style = valueOf(styleSelect);
        const profile = profileFor(genre);
        const seed = hash([genre, audience, style, Date.now()].join('|'));
        const lead = pick(profile.lead, seed, 1);
        const trigger = pick(profile.trigger, seed, 3);
        const conflict = pick(profile.conflict, seed, 5);
        const payoff = pick(profile.payoff, seed, 7);
        const hook = pick(profile.hook, seed, 11);
        return '主角是' + lead + '，在' + trigger + '后，被迫用一条高风险路径改写命运。表层冲突是' + conflict + '；核心看点是' + payoff + '。前期按“' + styleBeat(style) + '”推进，每章只解决一个明确目标，同时埋下更大的反转。面向' + audience + '，重点兑现' + readerEmotion(audience) + '。章末钩子：' + hook + '。';
      }

      function titleSuffixByPremise(premise) {
        if (/重生|回到|前世/.test(premise)) return ['重生', '回响', '归来', '破局'];
        if (/系统|数据|芯片|末世|灾变/.test(premise)) return ['纪元', '信号', '重启', '星火'];
        if (/旧案|死者|证据|真相/.test(premise)) return ['旧案', '来信', '证词', '迷局'];
        if (/契约|告白|婚约|重逢/.test(premise)) return ['告白', '合约', '偏爱', '春夜'];
        return ['破局', '回响', '长明', '入局'];
      }

      function buildTitle() {
        const genre = valueOf(genreSelect);
        const audience = valueOf(audienceSelect);
        const style = valueOf(styleSelect);
        const premise = valueOf(premiseInput);
        const profile = profileFor(genre);
        const seed = hash([genre, audience, style, premise || Date.now()].join('|'));
        const base = pick(profile.title, seed, 2);
        if (!premise) return base;
        const suffix = pick(titleSuffixByPremise(premise), seed, 9);
        if (base.includes(suffix)) return base;
        if (base.length <= 4) return base;
        return pick([base, suffix + '之日', '逆光' + suffix, '长夜' + suffix], seed, 13);
      }

      function setValue(input, value) {
        if (!input || !value) return;
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.focus();
      }

      if (ideaButton) {
        ideaButton.addEventListener('click', () => {
          setValue(premiseInput, buildIdea());
        });
      }

      if (titleButton) {
        titleButton.addEventListener('click', () => {
          if (!valueOf(premiseInput)) setValue(premiseInput, buildIdea());
          setValue(titleInput, buildTitle());
        });
      }
    })();
  </script>
</body>
</html>`;

return [{json: {response_html: html}}];
