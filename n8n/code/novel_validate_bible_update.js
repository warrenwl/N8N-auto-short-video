// n8n Code node: Validate Novel Bible Manual Update
// Only accepts POST body fields from /webhook/novel-bible-update.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('编辑设定集必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('编辑设定集必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function parseJsonField(value, fallback, label) {
  const raw = text(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} 必须是合法 JSON。`);
  }
}

const bibleFieldAlias = {
  姓名: 'name',
  名字: 'name',
  主名: 'name',
  别名: 'aliases',
  昵称: 'aliases',
  公开称呼: 'public_name',
  对外身份: 'public_name',
  真实姓名: 'real_name',
  年龄: 'age',
  身份: 'identity',
  身份说明: 'identity_note',
  真实身份: 'identity_note',
  性格: 'personality',
  人物性格: 'personality',
  目标: 'goal',
  人物目标: 'goal',
  动机: 'motivation',
  欲望: 'motivation',
  弱点: 'weakness',
  缺陷: 'weakness',
  成长线: 'growth_arc',
  人物弧光: 'growth_arc',
  定位: 'role',
  角色定位: 'role',
  作用: 'function',
  背景: 'background',
  出身: 'origin',
  与主角关系: 'relationship_with_mc',
  和主角关系: 'relationship_with_mc',
  与主角冲突: 'conflict_with_mc',
  和主角冲突: 'conflict_with_mc',
  冲突点: 'conflict_point',
  描述: 'description',
  外貌: 'appearance',
  特征: 'traits',
  冲突: 'conflict',
  秘密: 'secret',
  能力: 'ability',
  技能: 'skills',
  限制: 'limitation',
  阵营: 'faction',
  家族: 'family',
  组织: 'organization',
  状态: 'status',
  人物线: 'arc',
  情感线: 'emotional_arc',
  威胁等级: 'threat_level',
  反派定位: 'antagonist_role',
  来源角色: 'from',
  目标角色: 'to',
  原因: 'reason',
  内容: 'value',
  补充信息: 'note',
  备注: 'note',
};

function normalizeBibleKeys(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeBibleKeys(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [
    bibleFieldAlias[key] || key,
    normalizeBibleKeys(val),
  ]));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

const mainCharacter = normalizeBibleKeys(parseJsonField(body.main_character_json || body.main_character, {}, '主角设定'));
const supportingCharacters = normalizeBibleKeys(parseJsonField(body.supporting_characters_json || body.supporting_characters, [], '配角设定'));
const villainSetting = normalizeBibleKeys(parseJsonField(body.villain_setting_json || body.villain_setting, [], '反派设定'));
const relationshipMap = normalizeBibleKeys(parseJsonField(body.relationship_map_json || body.relationship_map, [], '人物关系'));
const sellingPoints = normalizeBibleKeys(parseJsonField(body.selling_points_json || body.selling_points, [], '卖点'));

return [{
  json: {
    project_id: projectId,
    world_setting: text(body.world_setting),
    story_core: text(body.story_core),
    main_character_json: JSON.stringify(mainCharacter),
    supporting_characters_json: JSON.stringify(supportingCharacters),
    villain_setting_json: JSON.stringify(villainSetting),
    power_system: text(body.power_system),
    relationship_map_json: JSON.stringify(relationshipMap),
    tone_rules: text(body.tone_rules),
    forbidden_rules: text(body.forbidden_rules),
    selling_points_json: JSON.stringify(sellingPoints),
    comment,
    reviewer,
    action: 'UPDATE_BIBLE',
  },
}];
