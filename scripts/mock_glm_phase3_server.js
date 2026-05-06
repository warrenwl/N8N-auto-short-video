#!/usr/bin/env node

const http = require('http');

const port = Number(process.env.PORT || 18080);

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('request too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function biblePayload() {
  return {
    world_setting: '城市传闻正在复苏，老物件会保存失踪者的回声。',
    story_core: '修表师林昼追查父亲失踪真相，被卷入镜会争夺传闻能力的暗战。',
    main_character: {
      name: '林昼',
      identity: '旧钟表店修表师',
      goal: '查清父亲失踪真相',
      weakness: '习惯独自承担风险',
      growth_arc: '从逃避继承父亲遗产，到主动守护城市传闻。',
    },
    supporting_characters: [
      {name: '许青瓷', role: '调查记者', relation: '互相试探的盟友'},
    ],
    villain_setting: [
      {name: '镜会', goal: '控制城市传闻并抹除不稳定见证者'},
    ],
    power_system: '传闻能力需要付出记忆、时间或身体感知作为代价。',
    relationship_map: [
      {from: '林昼', to: '许青瓷', relation: '从不信任到合作'},
    ],
    tone_rules: '强场景推进，少解释，章节结尾保留明确钩子。',
    forbidden_rules: '不提前揭露父亲结局，不让主角轻易获得无代价能力。',
    selling_points: ['都市传闻', '父子悬念', '代价型异能'],
  };
}

function outlinePayload() {
  return {
    chapters: [
      {
        chapter_no: 1,
        volume_no: 1,
        title: '旧钟表店的第一声回响',
        summary: '林昼收到停在父亲失踪时刻的怀表，并遭遇镜会抢夺。',
        chapter_goal: '建立主角目标并引出怀表异常。',
        conflict_point: '陌生人抢夺怀表。',
        emotional_point: '林昼从逃避父亲遗物转为主动追查。',
        hook: '怀表里传出父亲的声音。',
      },
      {
        chapter_no: 2,
        volume_no: 1,
        title: '雨夜追逐',
        summary: '林昼在追逐中首次触发传闻能力。',
        chapter_goal: '展示能力代价。',
        conflict_point: '镜会追击并逼他交出怀表。',
        emotional_point: '林昼第一次主动反击。',
        hook: '许青瓷认出怀表上的暗记。',
      },
      {
        chapter_no: 3,
        volume_no: 1,
        title: '镜中人',
        summary: '许青瓷带林昼接触父亲旧案线索。',
        chapter_goal: '扩大谜团并建立合作关系。',
        conflict_point: '真假证人给出相反口供。',
        emotional_point: '林昼开始信任许青瓷。',
        hook: '镜面里出现父亲失踪当天的画面。',
      },
    ],
  };
}

function chapterPayload() {
  return {
    chapter_title: '旧钟表店的第一声回响',
    chapter_body: '雨水砸在旧钟表店的卷帘门上。林昼刚把钥匙插进锁孔，身后就有人说，那块怀表不该在你手里。对方的伞沿压得很低，手套却干净得不像刚穿过雨夜。林昼下意识攥紧怀表，表盖忽然震了一下，里面传出父亲失踪前留下的半句话：别相信镜子。',
    chapter_summary: '林昼收到父亲怀表，并在雨夜遭遇镜会抢夺，确认父亲失踪另有隐情。',
    word_count_estimate: 1280,
    new_facts: [
      {
        fact_type: 'item',
        fact_key: '父亲怀表',
        fact_value: '怀表停在父亲失踪的时刻。',
        confidence: 0.9,
      },
    ],
    foreshadowing: [
      {
        fact_key: '怀表声音',
        fact_value: '怀表能短暂传出父亲留下的声音。',
        confidence: 0.8,
      },
    ],
  };
}

function rewritePayload() {
  return {
    chapter_title: '旧钟表店的第一声回响',
    chapter_body: '雨声压低了旧钟表店门口的霓虹。林昼刚拉开卷帘门，黑伞下的人已经伸手按住怀表链，声音冷得像齿轮咬合：那不是遗物，是钥匙。林昼退了半步，掌心却被表壳震得发麻。怀表停在父亲失踪的那一秒，表盖里传出更清晰的低语：别相信镜子，也别相信来拿表的人。',
    chapter_summary: '林昼在旧钟表店门口遭遇镜会抢表，确认怀表是父亲失踪案的关键钥匙。',
    word_count_estimate: 1320,
    new_facts: [
      {
        fact_type: 'item',
        fact_key: '父亲怀表',
        fact_value: '怀表被镜会称作钥匙，可能关联父亲失踪案。',
        confidence: 0.9,
      },
    ],
    foreshadowing: [
      {
        fact_key: '镜会来客',
        fact_value: '抢表者知道怀表不是普通遗物。',
        confidence: 0.8,
      },
    ],
  };
}

function reviewPayload() {
  return {
    consistency_score: 88,
    readability_score: 91,
    plot_score: 84,
    commercial_score: 86,
    total_score: 87,
    issues: [
      {
        type: '节奏',
        description: '中段追逐可以在正式扩写时压缩解释，保留动作推进。',
        severity: 'low',
      },
    ],
    suggestions: [
      '强化结尾“别相信镜子”的悬念。',
      '下一章优先解释怀表代价，不要直接揭露父亲下落。',
    ],
    verdict: 'PASS',
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, {error: 'method_not_allowed'});
    return;
  }

  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText || '{}');
    const promptText = JSON.stringify(body.messages || []);
    let parsed;
    if (promptText.includes('原章节') || promptText.includes('审稿问题') || promptText.includes('改稿')) {
      parsed = rewritePayload();
    } else if (promptText.includes('请审查以下章节') || promptText.includes('consistency_score')) {
      parsed = reviewPayload();
    } else if (promptText.includes('当前章节') || promptText.includes('chapter_body')) {
      parsed = chapterPayload();
    } else if (promptText.includes('章节大纲') || promptText.includes('chapters')) {
      parsed = outlinePayload();
    } else {
      parsed = biblePayload();
    }

    json(res, 200, {
      id: `mock-${Date.now()}`,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(parsed),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      },
    });
  } catch (error) {
    json(res, 500, {error: error.message});
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Mock GLM Phase 3 server listening on ${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
