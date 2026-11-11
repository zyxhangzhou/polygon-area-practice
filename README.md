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
| 启动即退出，提示"配置错误" | 按提示补齐环境变量，参考 `.env.example` |
| 测试报 `database "polygon_test" does not exist` | 数据卷是在加入建库脚本之前创建的（`docker/initdb/` 只在数据卷首次创建时执行）。执行 `docker compose down -v` 删除旧数据卷后重新 `docker compose up -d db`（会清空本地数据） |
| `/api/health` 返回 503 | 数据库不可达。检查 `docker compose ps` 中 `db` 是否 healthy，查看 `docker compose logs db` |

## 日志

后端使用 pino 输出结构化日志，每条请求日志带 `reqId`，并在响应头 `x-request-id` 中返回同一个值，便于按请求定位：

- 本地开发：终端中查看（pino-pretty 格式化）。
- Docker：`docker compose logs -f app`（JSON 格式）。
