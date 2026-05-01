# image-restoration-agent

本项目是你现有 [4KAgent](../4KAgent) 的前后端封装层：

- 前端：React + Vite（已含页面）
- 后端：FastAPI（本次已补齐任务接口）
- 推理引擎：直接调用你已经部署好的 4KAgent CLI
- 历史记录：SQLite（轻量、本地单机场景推荐）

## 1. 关键原则

- 不改动 [4KAgent](../4KAgent) 目录任何代码和配置。
- 所有上传文件、任务输出、数据库都写在 [backend/runtime](backend/runtime)。
- 通过环境变量指定 4KAgent 路径和 GPU，默认读取你当前部署位置。

## 2. 是否使用现有 4KAgent 基础环境

建议：后端直接复用你现在能跑通 4KAgent 的 Python 环境。

原因：

- 你已经验证过命令可执行，复用最稳。
- 避免再装一套大模型依赖，占用系统盘。
- 当前目标是尽快形成可演示的完整系统。

实践方式：

- 前端 Node 环境独立（在本仓库 frontend 安装依赖）。
- 后端 Python 环境使用你当前 4KAgent 可运行的那套环境。

## 3. SQLite 是否建议

建议使用 SQLite，适合你当前场景：

- 单机部署
- 任务记录量中等
- 追求零运维、快速落地

后续如果并发任务很多，再切 MySQL/PostgreSQL 即可。

## 4. 后端接口（已实现）

- POST /api/restore
	- form-data: image(file), mode(string)
	- 返回 taskId，后台异步执行
- GET /api/tasks/{taskId}
	- 返回任务状态、结果图 URL、日志文本（包含 workflow.log 尾部）
- GET /api/history
	- 返回历史任务列表（含缩略图）
- GET /media/*
	- 提供运行期图片/文件静态访问

## 5. 与 4KAgent 的调用方式

后端会在任务线程中执行（cwd 指向 4KAgent）：

```bash
CUDA_VISIBLE_DEVICES=0 python infer_4kagent.py \
	--input_dir <任务输入目录> \
	--output_dir <任务输出目录> \
	--profile_name MyAgent_API \
	--tool_run_gpu_id 0
```

说明：

- 该调用方式与你当前手工命令一致。
- 每个任务独立输入/输出目录，便于追踪。
- 前端会轮询任务状态，并实时显示日志过程。

## 6. 部署步骤（数据盘友好）

下面命令都在 [image-restoration-agent](.) 执行。

### 6.1 前端依赖安装

```bash
cd frontend
npm install
```

如果你已把 npm 缓存指向数据盘，可保持现状不变。

### 6.2 后端依赖安装

进入你已经可运行 4KAgent 的 Python 环境后执行：

```bash
pip install -r requirements.txt
```

### 6.3 启动后端

```bash
export FOURKAGENT_DIR=/gz-data/projects2/4KAgent
export FOURKAGENT_GPU_ID=0
export FOURKAGENT_PROFILE_NAME=MyAgent_API

uvicorn backend.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 6.4 启动前端

另开终端：

```bash
cd frontend
echo 'VITE_API_BASE_URL=http://127.0.0.1:8001' > .env.local
npm run dev
```

打开浏览器：

- http://127.0.0.1:5173

## 7. 目录说明

- [backend/app/main.py](backend/app/main.py)：FastAPI 主入口与任务逻辑
- [backend/runtime/tasks.db](backend/runtime/tasks.db)：SQLite 任务库（运行后生成）
- [backend/runtime/uploads](backend/runtime/uploads)：上传原图
- [backend/runtime/jobs](backend/runtime/jobs)：每次任务的输入/输出和日志源

## 8. 前端现有能力

- 工作台上传图片、选择模式、提交任务
- 轮询任务状态直到完成/失败
- 展示推理日志过程（命令输出 + workflow.log 片段）
- 查看历史任务与缩略图

## 9. 常见问题

1. 报错 4KAgent 目录不存在

- 检查 FOURKAGENT_DIR 是否正确。

2. 任务失败但看不出原因

- 在工作台查看“智能体推理过程（日志）”。
- 同时检查任务输出目录下 logs/workflow.log。

3. 前端看不到结果图

- 确保设置了 VITE_API_BASE_URL 指向后端地址。
- 确保后端 /media 可访问。

## 10. 后续可扩展

- 增加 WebSocket/SSE 实时日志推送（替代轮询）
- 增加任务取消、并发队列和优先级
- 增加用户体系与多项目隔离
