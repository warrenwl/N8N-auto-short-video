# N8N Video Agent

基于 n8n + Docker 的自动化短视频生成流水线，从选题到成片全自动完成。

## 架构概览

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  n8n     │───>│ video-worker │───>│ VoxCPM TTS   │    │  PostgreSQL  │
│ :5678    │    │ :8000        │    │ :8010 (宿主机)│    │  :5432       │
└──────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     │                  │                                       │
     │                  └── ffmpeg 合成 → final.mp4             │
     └── GLM API 脚本生成 ──────────────────────────────────────┘
```

## 服务组件

| 服务 | 端口 | 说明 |
|------|------|------|
| **n8n** | 5678 | 工作流引擎，编排整个生成流程 |
| **video-worker** | 8000 | 视频渲染服务（FastAPI），负责图片生成、ffmpeg 合成 |
| **VoxCPM TTS** | 8010 | 语音合成服务（宿主机运行），基于 VoxCPM2 模型 |
| **PostgreSQL 17** | 5432 | n8n 数据库 + `video_agent` 业务数据库 |

## 数据库

### 连接信息

- 主机：`localhost:5432`（宿主机访问）/ `postgres:5432`（容器内访问）
- 用户：`n8n`
- n8n 数据库：`n8n`
- 业务数据库：`video_agent`

### 状态流转

```
IDEA → GENERATING_SCRIPT → SCRIPT_READY → MEDIA_READY → RENDERED → NEED_REVIEW → APPROVED → PUBLISHED
                                                                    ↘ FAILED
```

### 核心表：`video_topics`

| 字段 | 类型 | 说明 |
|------|------|------|
| topic | TEXT | 选题 |
| script | TEXT | 生成的脚本 |
| shots_json | JSONB | 分镜数据 |
| status | TEXT | 当前状态 |
| video_path | TEXT | 最终视频路径 |
| cover_path | TEXT | 封面图路径 |

## n8n 工作流

| 文件 | 说明 |
|------|------|
| `01_postgres_script_workflow.json` | 选题 → GLM 生成脚本 → 写入数据库 |
| `02_postgres_render_workflow.json` | 单镜头渲染 |
| `02b_postgres_render_multishot_workflow.json` | 多镜头渲染 |
| `03_voxcpm_tts_render_workflow.json` | TTS 语音合成 + 渲染合成 |

工作流通过 GLM API（OpenAI 兼容接口）生成脚本，`GLM_API_KEY` 和 `GLM_MODEL` 从 `.env` 读取。

## 视频渲染流程

1. n8n 调用 video-worker `POST /render`
2. video-worker 调用 VoxCPM TTS 生成语音（可选）
3. 为每个分镜生成占位图
4. ffmpeg 将图片转为视频片段
5. 合并片段 → 烧录字幕 → 混流音频 → 输出 `final.mp4`
6. 写入 `manifest.json`，返回路径给 n8n

## TTS 语音配置

`config/tts_voice_config.json` 控制语音风格和合成参数：

- `voice_prompt`：语音风格描述
- `cfg_value`：控制强度（默认 2.0）
- `inference_timesteps`：推理步数（默认 10）
- `max_chars`：分句最大字符数

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入实际的 GLM_API_KEY 等配置
```

### 2. 启动服务

```bash
docker compose up -d
```

### 3. 启动 TTS 服务（宿主机）

```bash
bash scripts/run_voxcpm_tts_server.sh
```

### 4. 导入工作流

在 n8n 界面（http://localhost:5678）中导入 `n8n/workflow/` 下的工作流 JSON 文件，配置 PostgreSQL 凭据后即可运行。

## 停止服务

```bash
docker compose down
```

## 项目结构

```
├── config/tts_voice_config.json   # TTS 语音配置
├── docker-compose.yml             # Docker 编排
├── n8n/workflow/                  # n8n 工作流 JSON
├── postgres/init/                 # 数据库初始化 SQL
├── scripts/                       # 启动/测试脚本
├── tts/                           # VoxCPM TTS 服务
├── worker/                        # 视频渲染 worker
├── .env.example                   # 环境变量模板
└── data/output/                   # 生成的视频输出
```

## 安全提示

- `.env` 已被 `.gitignore` 忽略，API Key 和密码不会被提交
- 在 n8n 中使用 Credentials 管理敏感凭据
- 如 Key 意外泄露，请立即轮换并更新 `.env`
