# 第 3 阶段：VoxCPM 本地 TTS 口播音频工作流

本包用于把你已经跑通的“多分镜拼接版 video-worker”升级为“多分镜 + VoxCPM 口播音频 + 字幕烧录”的版本。

## 推荐架构

```text
Mac 宿主机：VoxCPM TTS Server，端口 8010
Docker：n8n + PostgreSQL + video-worker

n8n → video-worker:8000/render
video-worker → host.docker.internal:8010/tts
video-worker → FFmpeg 合成 final.mp4
video-worker → n8n → PostgreSQL 回写 NEED_REVIEW
```

为什么 VoxCPM Server 放在 Mac 宿主机？

- 你的 VoxCPM 已经在 `/Users/warrn/study/语音生成/VoxCPM`。
- Mac M 系列的 MPS/Metal 加速一般在宿主机 Python 里更直接。
- Docker 容器不适合直接跑大模型和本地 Apple GPU 推理。

## 文件说明

```text
tts/voxcpm_tts_server.py                 本机 VoxCPM TTS FastAPI 服务
tts/requirements.txt                     TTS 服务依赖
scripts/run_voxcpm_tts_server.sh          一键启动 TTS 服务
scripts/test_voxcpm_tts_server.sh         测试 TTS 服务
worker/video_worker_app_tts.py            支持 TTS 的 video-worker v0.3.0
worker/Dockerfile                         video-worker 镜像
worker/requirements.txt                   video-worker 依赖
docker-compose.override.tts.yml           video-worker 覆盖配置
sql/10_add_tts_audio_columns.sql          新增音频字段
sql/11_claim_one_script_ready_for_tts.sql 领取 SCRIPT_READY 任务
sql/12_update_need_review_tts.sql         回写 NEED_REVIEW
n8n/code/build_render_request_tts.js      构造 Render 请求
n8n/code/parse_render_response_tts.js     解析 Render 结果
examples/tts_request_example.json         TTS 单独测试请求
examples/render_multishot_tts_request_example.json video-worker TTS 测试请求
```

## 1. 复制文件

把本包文件复制到你现有的 n8n 项目根目录。

如果你已经有 `docker-compose.override.yml`，把 `docker-compose.override.tts.yml` 里的 `video-worker` 服务合并进去。

如果没有，则执行：

```bash
cp docker-compose.override.tts.yml docker-compose.override.yml
```

## 2. 启动 Mac 本机 VoxCPM TTS 服务

```bash
chmod +x scripts/run_voxcpm_tts_server.sh
./scripts/run_voxcpm_tts_server.sh
```

默认环境变量：

```bash
VOXCPM_DIR="/Users/warrn/study/语音生成/VoxCPM"
VOXCPM_MODEL="openbmb/VoxCPM2"
VOXCPM_DEVICE="mps"
VOXCPM_OPTIMIZE="false"
VOXCPM_LOAD_DENOISER="false"
```

如果你的模型权重在本地路径，把 `VOXCPM_MODEL` 改成本地模型目录：

```bash
export VOXCPM_MODEL="/Users/warrn/study/语音生成/VoxCPM2"
./scripts/run_voxcpm_tts_server.sh
```

## 3. 测试 TTS 服务

另开一个终端：

```bash
chmod +x scripts/test_voxcpm_tts_server.sh
./scripts/test_voxcpm_tts_server.sh
```

成功后会生成：

```text
/tmp/voxcpm_test.wav
```

## 4. 升级数据库字段

```bash
docker exec -i n8n-video-postgres \
  psql -U n8n -d video_agent \
  < sql/10_add_tts_audio_columns.sql
```

## 5. 重建 video-worker

```bash
docker compose up -d --build video-worker
```

检查：

```bash
curl http://localhost:8000/health
```

应该看到：

```json
{
  "status": "ok",
  "service": "video-worker",
  "version": "0.3.0"
}
```

## 6. 不经过 n8n，直接测试 video-worker TTS 合成

```bash
curl -X POST http://localhost:8000/render \
  -H "Content-Type: application/json" \
  -d @examples/render_multishot_tts_request_example.json
```

成功后检查：

```bash
ls -R ./data/output/demo_tts_001
```

你应该看到：

```text
voice.wav
subtitles.srt
base_no_audio.mp4
final.mp4
manifest.json
images/
clips/
```

## 7. 修改 n8n 第二个增强版工作流

你不用完全重建工作流，只需要替换 3 个地方。

### 7.1 替换 Claim SQL

节点：`Postgres - Claim One SCRIPT_READY Enhanced`

把 Query 改成：

```text
sql/11_claim_one_script_ready_for_tts.sql
```

### 7.2 替换 Build Request Code

节点：`Code - Build Render Request Enhanced`

把代码改成：

```text
n8n/code/build_render_request_tts.js
```

### 7.3 替换 Parse Response Code

节点：`Code - Parse Render Response Enhanced`

把代码改成：

```text
n8n/code/parse_render_response_tts.js
```

### 7.4 替换 Update SQL

节点：`Postgres - Update NEED_REVIEW Enhanced`

把 Query 改成：

```text
sql/12_update_need_review_tts.sql
```

Query Parameters 按顺序填：

```text
$1 = {{$json.video_path}}
$2 = {{$json.cover_path}}
$3 = {{$json.subtitle_path}}
$4 = {{$json.clips_json}}
$5 = {{$json.render_manifest}}
$6 = {{$json.voice_path}}
$7 = {{$json.audio_duration}}
$8 = {{$json.audio_engine}}
$9 = {{$json.task_id}}
```

HTTP Request 节点保持不变：

```text
POST http://video-worker:8000/render
Body: ={{$json}}
```

## 8. 成功标准

工作流执行后：

```bash
docker exec -it n8n-video-postgres \
  psql -U n8n -d video_agent \
  -c "SELECT id, status, video_path, voice_path, audio_duration FROM video_topics ORDER BY updated_at DESC LIMIT 5;"
```

应该看到：

```text
status = NEED_REVIEW
video_path = /data/output/<task_id>/final.mp4
voice_path = /data/output/<task_id>/voice.wav
audio_duration > 0
```

本地目录应该有：

```text
./data/output/<task_id>/voice.wav
./data/output/<task_id>/final.mp4
./data/output/<task_id>/manifest.json
```

## 常见问题

### n8n/video-worker 调不到 VoxCPM 服务

确认 Mac 本机服务正在运行：

```bash
curl http://localhost:8010/health
```

确认 Docker 容器能访问宿主机：

```bash
docker exec -it <video-worker容器名> curl http://host.docker.internal:8010/health
```

### VoxCPM 导入失败

在项目根目录执行：

```bash
source .venv-voxcpm-tts/bin/activate
pip install -e "/Users/warrn/study/语音生成/VoxCPM"
```

或者：

```bash
pip install voxcpm
```

### MPS 报错或 torch.compile 报错

把环境变量改成：

```bash
export VOXCPM_DEVICE="mps"
export VOXCPM_OPTIMIZE="false"
```

如果还是不行，先用 CPU 验证链路：

```bash
export VOXCPM_DEVICE="cpu"
```

### 口播比视频长，声音被截断

本版 worker 会根据 `audio_duration` 自动拉长分镜总时长。如果仍然截断，检查 `manifest.json` 里的 `audio_duration` 和 `durations`。

## 下一步

第 3 阶段跑通后，下一阶段是：

```text
第 4 阶段：接 ComfyUI 生成真实封面/分镜图
```
