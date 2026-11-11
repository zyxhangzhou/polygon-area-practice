# 多边形面积练习 Demo

小学五年级"多边形面积计算"全栈练习网页（面试实践题·选题一）。

> 🚧 开发中。项目大纲见 [docs/project-outline.md](docs/project-outline.md)，题面见 [docs/assignment/](docs/assignment/assignment.md)，拆分计划见 [mydoc/plans/polygon-area-demo/](mydoc/plans/polygon-area-demo/README.md)。

## 快速开始

### 环境依赖

| 工具 | 版本 | 用途 |
|---|---|---|
| Docker（含 Compose v2） | 24+ | 方式一必需；方式二用它启动数据库 |
| Node.js | 24+（见 `.nvmrc`） | 方式二与运行测试 |

### 方式一：Docker 一条命令启动（推荐评审使用）

```bash
docker compose up --build
```

打开 <http://localhost:3000>。健康检查：`curl localhost:3000/api/health` 应返回 `{"status":"ok","db":"ok"}`。

停止：`Ctrl+C` 或 `docker compose down`（加 `-v` 会同时删除数据库数据）。

### 方式二：本地开发（热重载）

```bash
cp .env.example .env          # 首次执行；按需修改端口
npm install
docker compose up -d db       # 只启动 Postgres
npm run dev                   # 同时启动后端（:3000）与前端开发服务器（:5173）
```

打开 <http://localhost:5173>。前端开发服务器会把 `/api` 代理到后端。

### 运行测试

```bash
docker compose up -d db       # 测试需要真实 Postgres（使用独立的 polygon_test 库）
npm test
```

测试**不读 `.env`**。数据库端口不是默认的 55432 时，在 shell 中指定：

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:<端口>/polygon_test npm test
```

其他检查：`npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build`。CI（GitHub Actions）会依次执行这些检查和测试。

### 数据库迁移与题库

服务**启动时自动**执行迁移、写入题库（可重复执行；题库按题目 ID 更新为代码中的内容），然后才开始监听端口。任一步失败，进程输出原因并退出。

| 命令 | 作用 |
|---|---|
| `npm run db:generate -w server` | 修改 `server/src/db/schema.ts` 后生成新的迁移 SQL（`server/drizzle/`，需提交） |
| `npm run db:migrate -w server` | 只执行迁移（读取根目录 `.env` 的 `DATABASE_URL`） |
| `npm run db:seed -w server` | 只写入题库，题库内容在 `server/src/content/questions.ts` |

在 Docker 运行镜像中（没有 tsx）手动执行：`docker compose exec app node dist/db/cli.js migrate`（或 `seed`）。

多个实例同时启动时，迁移由数据库锁串行执行；等锁超过 30 秒按失败退出，并提示可能有另一个实例正在迁移。

测试开始前会**重建测试库**（`TEST_DATABASE_URL` 的库名必须以 `_test` 结尾，否则拒绝执行），再迁移并写入题库；测试文件串行执行。

## 接口

所有接口在 `/api` 下，请求体和响应体都是 JSON。没有登录：会话 ID 是随机 UUID，也是访问凭证，拿到它的人可以代为作答（已知限制）。写接口的幂等键（`clientAttemptId` 等）由前端生成 UUID，重试时沿用同一个键。

| 方法与路径 | 请求体 | 说明 |
|---|---|---|
| `GET /api/health` | — | 健康检查 |
| `POST /api/learners` | `{ nickname? }` | 创建匿名学生 → `201 { learnerId }` |
| `POST /api/sessions` | `{ learnerId }` | 开始或继续练习：有进行中的会话返回 `200`，否则新建 `201`；返回会话状态 |
| `GET /api/sessions/:id` | — | 会话状态：关卡、每题状态、当前题、能否完成、统计 |
| `GET /api/sessions/:id/questions/:qid` | — | 题目详情，不含答案和解析 |
| `POST /api/sessions/:id/attempts` | `{ questionId, clientAttemptId, answer }` | 提交作答：新作答 `201`；重放或已答对 `200`；返回 `{ replayed, alreadySolved, result, session }` |
| `POST /api/sessions/:id/questions/:qid/skip` | `{ clientRequestId }` | 跳过：`201`；重放或已答对 `200` |
| `GET /api/sessions/:id/questions/:qid/explanation` | — | 解析：答错、跳过、答对后或会话结束后可获取 |
| `POST /api/sessions/:id/events` | `{ questionId, type, clientEventId, payload? }` | 学习行为：`explanation_text_opened` / `video_started` / `video_completed` |
| `POST /api/sessions/:id/complete` | `{ endedEarly }` | 结束练习；没做完时须 `endedEarly: true`；重复调用返回 `200` |
| `GET /api/sessions/:id/summary` | — | 学习总结：每题分类、原因、行为事实，以及两个比率 |

作答重放时，`result` 是那一次提交的结果，`session` 是当前状态。两者可能不同，例如先错后对之后重放第一次。

### 错误码

错误响应格式为 `{ "error": { "code", "message" } }`，`message` 是可以直接展示给学生的中文提示。`5xx` 只返回通用提示，细节只写日志。

| 状态码 | `code` | 含义 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体格式不对（缺字段、类型不对、`payload` 超过 1 KB 等） |
| 400 | `INVALID_ANSWER` | 答案不合法（空、带单位、负数、超过 2 位小数等），不计作答次数；`error.reason` 给出原因代码 |
| 400 | `BAD_REQUEST` | 请求体不是合法 JSON |
| 403 | `EXPLANATION_LOCKED` | 还不能看这道题的解析，也不能上报它的学习行为 |
| 404 | `LEARNER_NOT_FOUND` | 学生不存在 |
| 404 | `SESSION_NOT_FOUND` | 会话不存在，或 ID 不是 UUID |
| 404 | `QUESTION_NOT_IN_SESSION` | 这道题不在本次练习中 |
| 404 | `NOT_FOUND` | 接口不存在 |
| 409 | `SESSION_COMPLETED` | 练习已结束，不能再作答或跳过 |
| 409 | `STAGE_LOCKED` | 题目所在关卡还没解锁 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一个幂等键带了不同的内容 |
| 409 | `NOT_FINISHED` | 还有题没完成，结束时需要 `endedEarly: true` |
| 413 | `BAD_REQUEST` | 请求体超过 16 KB |
| 500 | `INTERNAL_ERROR` | 服务器内部错误（包括数据库等锁超过 2 秒）；写请求可以用同一个幂等键安全重试 |

## 配置

仓库中**只有一个** `.env`，放在根目录，由 `.env.example` 复制而来，不提交到 Git。各环境的取值方式：

| 场景 | 配置来源 |
|---|---|
| 本地开发 `npm run dev` | 后端用 Node 的 `--env-file-if-exists=../.env` 读取根目录 `.env`；shell 中已设置的同名变量优先。Vite 也从根目录 `.env` 读取 `WEB_DEV_PORT` 与 `PORT` |
| 测试 `npm test` | **不读 `.env`**。只认 `TEST_DATABASE_URL`，默认 `postgres://postgres:postgres@localhost:55432/polygon_test` |
| Docker Compose | `app` 服务的变量在 `docker-compose.yml` 中显式写出（不读 `.env`，避免把指向 `localhost` 的连接串带进容器）；根目录 `.env` 只用于替换端口和日志级别 |
| CI | 在 `.github/workflows/ci.yml` 中显式设置 |

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | 无（必填） | 后端连接的数据库；缺失时进程启动即退出并提示 |
| `PORT` | `3000` | 后端监听端口 |
| `LOG_LEVEL` | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `NODE_ENV` | `development` | `production` 时后端同时托管前端构建产物（`npm start` 与 Docker 已自动设置） |
| `WEB_DIST_DIR` | `web/dist` | 生产模式下托管的前端目录；相对路径按启动目录解析 |
| `WEB_DEV_PORT` | `5173` | 前端开发服务器端口 |
| `DB_PORT` | `55432` | Compose 中 Postgres 映射到宿主机的端口 |
| `APP_PORT` | `3000` | Compose 中应用映射到宿主机的端口 |
| `TEST_DATABASE_URL` | 见上 | 测试数据库；只从 shell 读取，写在 `.env` 中无效 |

## 常见故障

| 现象 | 原因与处理 |
|---|---|
| 测试或开发时连接数据库超时 | 先执行 `docker port polygon-area-practice-db-1`，若没有输出，说明宿主端口没绑上（被其他程序占用）。在 `.env` 中修改 `DB_PORT` 与 `DATABASE_URL` 的端口；运行测试时在 shell 中设置 `TEST_DATABASE_URL`（见"运行测试"）。数据库宿主端口默认就用 55432 而不是 5432，正是为了避开本机已安装的 Postgres |
| `npm run dev` 报 `Port 5173 is already in use` | 在 `.env` 中修改 `WEB_DEV_PORT`。WSL（mirrored 网络模式）下 Windows 可能保留了 5173 附近的端口段，可改用 `4173` |
| 启动即退出，提示"数据库准备失败" | 输出中有原因与连接目标（不含密码）。`timeout expired` / `ECONNREFUSED`：数据库没启动或端口不对，检查 `docker compose ps`；`28P01`：用户名或密码错误；迁移 SQL 报错：检查 `server/drizzle/` 是否完整 |
| 启动即退出，提示"配置错误" | 按提示补齐环境变量，参考 `.env.example` |
| 测试报 `database "polygon_test" does not exist` | 数据卷是在加入建库脚本之前创建的（`docker/initdb/` 只在数据卷首次创建时执行）。执行 `docker compose down -v` 删除旧数据卷后重新 `docker compose up -d db`（会清空本地数据） |
| `/api/health` 返回 503 | 数据库不可达。检查 `docker compose ps` 中 `db` 是否 healthy，查看 `docker compose logs db` |

## 日志

后端使用 pino 输出结构化日志，每条请求日志带 `reqId`，并在响应头 `x-request-id` 中返回同一个值，便于按请求定位：

- 本地开发：终端中查看（pino-pretty 格式化）。
- Docker：`docker compose logs -f app`（JSON 格式）。
