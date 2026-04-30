# 00_选题入口层计划文档

更新时间：2026-04-30 15:20 CST

## 1. 背景

当前视频自动生成链路已经初步跑通：

```text
video_topics(IDEA)
  ↓
01 GLM 生成脚本
  ↓
06 分段渲染：VoxCPM + ComfyUI 封面 + Remotion 动态版式
  ↓
08 人工审核中心
  ↓
09 抖音半自动发布
```

现在的关键空缺是：`video_topics` 中 `IDEA` 状态的主题从哪里来。

目前测试阶段主要靠手动 SQL 插入 `IDEA` 数据。这能验证后续链路，但不适合作为长期选题生产方式。正式链路需要一个稳定的“选题入口层”，负责收集、生成、筛选和入池口播主题。

## 2. 目标

新增 `00_选题入口层`，让 `IDEA` 数据有明确来源、质量控制和可追踪记录。

目标链路：

```text
人工录入 / 批量导入 / GLM 生成 / 热点采集 / 竞品参考
  ↓
topic_candidates 候选池
  ↓
去重、评分、筛选、人工确认
  ↓
video_topics(IDEA)
  ↓
01 脚本生成
```

## 3. 非目标

本阶段暂不做：

- 自动登录抖音、小红书、B站抓取需要登录的数据。
- 大规模爬虫和反爬绕过。
- 根据发布数据自动训练选题模型。
- 多平台自动发布策略优化。
- 直接让低质量候选选题跳过人工确认进入 `video_topics`。

这些作为后续阶段扩展。

## 4. 设计原则

- `video_topics` 只放已经确认要进入生产链路的主题。
- 未确认、待筛选、质量不稳定的选题先进入 `topic_candidates`。
- 选题来源必须可追踪：人工、批量导入、GLM、热点、竞品等。
- 选题入池要幂等，避免同一主题重复进入 `IDEA`。
- 第一版优先做“可控”，再逐步增加自动化。

## 5. 数据模型

### 5.1 topic_candidates

建议新增表：

```sql
CREATE TABLE IF NOT EXISTS topic_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  topic TEXT NOT NULL,
  title TEXT,
  angle TEXT,
  audience TEXT,
  platform TEXT DEFAULT 'douyin',
  account_key TEXT,
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  score NUMERIC,
  score_reason TEXT,
  duplicate_of UUID,
  promoted_topic_id UUID,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

候选状态建议：

- `NEW`：刚进入候选池。
- `SCORED`：已完成模型或规则评分。
- `SELECTED`：已选中，准备进入 `video_topics`。
- `PROMOTED`：已写入 `video_topics(IDEA)`。
- `REJECTED`：人工或规则淘汰。
- `DUPLICATE`：重复选题。

### 5.2 video_topics 补充字段

第一版尽量复用现有字段。如果需要增强可追踪性，可后续新增：

- `source_candidate_id UUID`
- `source TEXT`
- `account_key TEXT`

短期也可以先把来源信息写入现有 `metadata/json` 类字段，如果现有表已有可复用 JSON 字段。

## 6. 配置设计

建议新增：

```text
config/topic_idea_config.jsonc
```

建议配置内容：

```jsonc
{
  // 默认账号配置 key，对应 config/Account/*.json
  "default_account_key": "mes",

  // 默认平台：douyin / xiaohongshu / bilibili 等
  "default_platform": "douyin",

  // 每批自动生成候选选题数量
  "batch_size": 10,

  // 低于该分数的候选不进入待选
  "min_score": 70,

  // 去重相似度阈值，第一版可先用文本规范化 + 关键词匹配
  "dedupe_threshold": 0.86,

  // 分类与选题方向联动：category 是一级内容领域，directions 是二级栏目/生成范围
  "category_direction_groups": [
    {
      "category": "认知成长",
      "directions": ["认知偏差", "判断力训练", "行动系统"]
    },
    {
      "category": "AI自动化",
      "directions": ["办公提效", "内容生产", "自动化工作流"]
    }
  ],

  // 不希望出现的方向
  "blocked_topics": [
    "医疗诊断",
    "高风险投资建议"
  ]
}
```

当前 M5 实现已落地为 `config/topic_idea_config.jsonc`。第一版配置包含：

- `defaults`：控制 `AI生成` Tab 打开时的默认数量、方向、分类、目标受众、表达语气和内容结构；数量默认 1 条，页面提供 1/2/5/10 下拉并保留自定义输入。
- `category_direction_groups/audience_groups/audience_recommendations/tones/content_structures`：页面下拉数据源，同时支持手动自定义输入。`category` 是一级内容领域，`directions` 是该分类下的二级栏目/生成范围；`audience_recommendations` 会根据分类和方向优先推荐目标受众，`audience_groups` 仍作为全量受众池保留。
- `system_prompt/user_prompt_template`：GLM 生成候选选题的固定提示词。
- `blocked_topics`：提示 GLM 避开的高风险方向。
- `topic_generation_jobs`：记录 GLM 候选生成异步任务，支持刷新页面后继续查看 `RUNNING/SUCCEEDED/FAILED` 状态；超过 5 分钟仍为 `RUNNING` 的任务会被轮询接口标记为 `FAILED`。

M5 不处理 `template_type`。该字段仍由 01 脚本生成阶段根据选题正文输出。候选阶段生成 `topic/title/angle/audience/category/tags`，并在 `raw_payload.raw_candidate` 中保留 `core_angle/pain_point/promise/opening_hook/risk_note/score_reason`，用于人工筛选和轻量去重。

## 7. n8n 工作流规划

### 7.1 00A_人工选题录入

用途：先解决最稳定的来源，让用户不用写 SQL。

入口：

```text
/webhook/topic-create
```

功能：

- 表单提交单条主题。
- 写入 `topic_candidates` 或直接写入 `video_topics(IDEA)`。
- 第一版建议先写 `topic_candidates(NEW)`，再通过“确认入池”进入 `video_topics`。

### 7.2 00B_批量导入选题

用途：从 CSV/多行文本批量导入候选主题。

入口：

```text
/webhook/topic-import
```

功能：

- 接收多行文本或 CSV。
- 每行生成一条 `topic_candidates(NEW)`。
- 做基础去重。

### 7.3 00C_GLM 生成候选选题

用途：根据账号定位、栏目方向、近期偏好生成一批候选。

入口：

```text
Manual Trigger 或 /webhook/topic-generate
```

功能：

- 读取 `config/topic_idea_config.jsonc`。
- 读取 `config/Account/mes.json`。
- 调用 GLM 输出候选选题 JSON。
- 写入 `topic_candidates(NEW)`。

### 7.4 00D_候选评分与筛选

用途：对候选选题做质量分和原因说明。

功能：

- 根据账号定位、受众、平台、历史主题做评分。
- 回写 `score`、`score_reason`、`status = SCORED`。
- 低分自动 `REJECTED`，重复自动 `DUPLICATE`。

### 7.5 00E_选题确认入池

用途：把确认要生产的视频写入 `video_topics(IDEA)`。

入口：

```text
/webhook/topic-promote?candidate_id=...
```

功能：

- 校验候选状态为 `SCORED` 或 `SELECTED`。
- 写入 `video_topics`，状态为 `IDEA`。
- 回写 `topic_candidates.promoted_topic_id` 和 `status = PROMOTED`。

## 8. 页面规划

第一版可新增一个轻量页面：

```text
/webhook/topic-center
```

页面 Tab：

- `AI生成`：根据配置和自定义方向调用 GLM 生成候选。
- `手动录入`：人工新增单条候选。
- `候选池`：`NEW/SCORED`
- `已入池`：`PROMOTED`
- `已拒绝`：`REJECTED`
- `重复`：`DUPLICATE`

候选卡片展示：

- 主题
- 标题/角度
- 受众
- 来源
- 分数和评分理由
- 创建时间

操作按钮：

- `确认入池`
- `拒绝`
- `标记重复`
- `重新评分`

导航预留：

- `topic-center` 顶部需要预留“视频审核中心”入口，跳转到 `/webhook/video-review-list`。
- `video-review-list` 顶部需要预留“选题中心”入口，跳转到 `/webhook/topic-center`。
- 两个页面的导航位置和视觉风格保持一致，避免后续页面越做越散。
- 跳转不要求二级确认，直接打开对应中心页面。

录入交互：

- 人工录入作为独立 `手动录入` Tab，不混在候选列表里。
- 当前阶段来源固定为 `manual / 人工录入`，不展示尚未实现的 `import/glm` 来源选项。
- 点击“加入候选池”成功后清空表单，并跳回候选池 Tab，让新增候选和候选数量立即可见。
- `AI生成` 作为独立 Tab，调用 `/webhook/topic-generate` 后写入 `topic_candidates(NEW, source=glm)`，成功后跳回候选池。
- 后续批量导入、热点采集、竞品参考都应作为独立入口或独立 Tab，不复用人工录入表单里的来源下拉。

## 9. 实施里程碑

### M1：文档和数据库基础

- [x] 生成本计划文档。
- [x] 新增 `topic_candidates` 建表 SQL。
- [x] 确认是否给 `video_topics` 增加 `source_candidate_id/source/account_key`。
- [x] 更新 README 的 00 选题入口说明。

### M2：手动录入最小闭环

- [x] 新增 `00A_人工选题录入` workflow。
- [x] 支持单条主题写入 `topic_candidates(NEW)`。
- [x] 新增 `00E_确认入池` 最小 webhook。
- [x] 能从候选主题生成 `video_topics(IDEA)`。
- [ ] 用 1 条真实主题跑通 `00 -> 01`。

### M3：选题中心页面

- [x] 新增 `/webhook/topic-center` 页面。
- [x] 手动录入作为独立 Tab。
- [x] 人工录入来源固定为 `manual`，不展示未实现来源选项。
- [x] 加入候选池后清空表单，并跳回候选池展示新增记录。
- [x] `topic-center` 顶部新增“视频审核中心”跳转入口。
- [x] `video-review-list` 顶部新增“选题中心”跳转入口。
- [x] 展示候选池、已入池、已拒绝、重复 Tab。
- [x] 支持 `确认入池 / 拒绝 / 标记重复`。
- [x] 操作后当前页刷新，不跳二级确认页。

### M4：批量导入

- [ ] 新增多行文本导入。
- [ ] 新增 CSV 导入格式说明。
- [ ] 导入时做基础字段清洗。
- [ ] 重复候选自动标记 `DUPLICATE`。

### M5：GLM 自动生成候选

- [x] 新增 `config/topic_idea_config.jsonc`。
- [x] 新增 GLM 选题生成提示词配置。
- [x] 在 `00_选题中心_候选池到IDEA` 中新增 `00C_GLM 生成候选选题` webhook 路径。
- [x] 生成结果写入 `topic_candidates(NEW)`。
- [x] 输出本次 GLM prompt 和响应到候选 `raw_payload`。
- [x] `/webhook/topic-center` 新增 `AI生成` Tab，支持“分类 -> 选题方向”二级联动；数量、目标受众、表达语气、内容结构支持默认下拉和自定义输入。
- [x] GLM 候选生成改为异步 job：点击后立即返回，页面用 5 秒倒计时轮询 `/webhook/topic-generation-jobs` 展示生成状态，刷新页面不丢进度。

### M6：评分与筛选

- [ ] 新增评分规则。
- [ ] 新增 GLM 评分提示词。
- [ ] 回写 `score/score_reason/status`。
- [ ] 低分和重复主题不自动入池。

### M7：与现有链路联动

- [x] 选题入池后可直接触发 01 脚本生成。
- [x] 审核中心或新选题中心能看到来源信息。
- [x] README 更新完整主线：`00 -> 01 -> 06 -> 08 -> 09`。

## 10. 验收标准

### 10.1 功能验收

- 不写 SQL，也能新增一个待生产主题。
- 候选主题可以被确认进入 `video_topics(IDEA)`。
- `01` 工作流可以领取该 `IDEA` 主题并生成脚本。
- 重复主题不会重复进入 `video_topics`。
- 每条进入 `video_topics` 的主题能追踪来源。

### 10.2 质量验收

- GLM 生成候选不是直接生产，必须经过候选池。
- 候选评分理由可读，方便人工判断。
- 选题中心页面能快速筛选和操作。
- 失败时 webhook 返回明确错误，不出现 200 空响应。

### 10.3 回退验收

- 即使 00 工作流不可用，仍然可以手动向 `video_topics(IDEA)` 插入数据跑后续链路。
- 新增 `topic_candidates` 不影响现有 `01/06/08/09`。
- 所有新状态只影响候选池，不改变现有视频生产状态机。

## 11. 风险和决策

### 风险 1：自动选题质量不稳定

决策：自动生成先进入候选池，不直接进入 `video_topics(IDEA)`。

### 风险 2：热点/竞品采集涉及反爬和平台限制

决策：第一版不做复杂爬虫。先支持人工录入、批量导入和 GLM 生成。

### 风险 3：重复主题难以精准判断

决策：第一版使用规范化文本、关键词、标题相似度做保守去重；宁可进入人工确认，也不自动删除边界样本。

### 风险 4：表结构过度设计

决策：`topic_candidates` 先保留通用字段和 `raw_payload`，具体平台字段后续按真实来源补充。

## 12. 当前状态

截至 2026-04-30 15:20 CST：

- `01 -> 06 -> 08 -> 09` 已初步跑通。
- `00_选题中心_候选池到IDEA` 已新增并导入 n8n，访问入口为 `/webhook/topic-center`。
- 已新增 `topic_candidates` 表，并给 `video_topics` 增加 `source_candidate_id/source/account_key` 用于追踪来源。
- 选题中心支持人工新增候选、确认入池到 `video_topics(IDEA)`、拒绝和标记重复。
- 选题中心新增 `AI生成` Tab，可通过 GLM 生成 `topic_candidates(NEW, source=glm)`；分类与选题方向改为一级/二级联动，数量、目标受众、表达语气和内容结构均由 `config/topic_idea_config.jsonc` 提供默认下拉并支持自定义。
- `AI生成` 已改成异步任务：`topic_generation_jobs(RUNNING)` 先落库，页面展示刷新倒计时并轮询状态；GLM 成功后更新为 `SUCCEEDED` 并写入候选池。
- M5 候选生成默认 `max_tokens = 8000`，避免 GLM-5.1 reasoning tokens 过多时截断 JSON 正文。
- GLM 生成候选的 prompt、响应和 batch_id 已写入候选 `raw_payload`，重复候选会跳过并返回统计。
- 选题中心与视频审核中心已互相预留跳转入口。
- 已通过 webhook 联调验证：创建候选成功，确认入池可生成 `video_topics(IDEA)`；联调测试数据已清理。
- 09 抖音半自动发布已支持发布包、下载页、Server酱提醒和手动确认回写。
- 下一步建议用 `AI生成` 生成一批候选，人工选择一条入池后跑通 `00 -> 01 -> 06`；之后可进入 M6 自动评分与筛选。M4 批量导入暂缓。
