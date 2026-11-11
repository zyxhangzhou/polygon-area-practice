# Proposal

## Why

仓库目前只有文档，还没有可运行的代码。后续 B–J 各个 change 都要在同一套工程底座上开发、测试和部署，所以先搭好"一条命令启动、能连数据库、能跑测试、CI 自动检查"的骨架，把环境问题集中在第一步解决，避免后面每个 change 各自踩坑。

## What Changes

- 新建 npm workspaces 单仓库：`server/`（Fastify + TypeScript）与 `web/`（React + Vite + TypeScript）。
- 后端：启动时校验环境变量，配置缺失立即退出并给出明确提示；`GET /api/health` 检查数据库连通性；结构化日志（pino）且每个请求带请求 ID；未知的 `/api/*` 路由返回 JSON 404。
- 后端在生产模式下托管前端构建产物，**单服务单端口**；只有页面导航请求回退到 `index.html`，缺失的静态资源如实返回 404。
- 配置：仓库根目录唯一的 `.env`（由 `.env.example` 复制），开发、测试、Compose、CI 各自的取值方式明确分开。
- 代码质量：最小 ESLint（与 Prettier 分工，不重复检查），`npm run lint` 进 CI。
- 本地运行：`docker-compose.yml`（Postgres + 应用），多阶段 `Dockerfile`；另支持本地 `npm run dev`（Vite 开发服务器代理 `/api`）。
- 测试：Vitest，集成测试连接真实 Postgres（独立测试库）。
- CI：GitHub Actions，带 Postgres service，执行类型检查、构建、测试。
- `.env.example` 提供配置示例，密钥不入库。

## Capabilities

### New Capabilities
- `service-operations`: 服务的运维可观测行为——启动配置校验、健康检查（含数据库连通性）、请求追踪 ID。
- `app-hosting`: 同一服务对外提供前端页面与 API 的路由行为——页面访问、前端路由回退、缺失静态资源 404、未知 API 的 JSON 404。

### Modified Capabilities
（无）

## Impact

- 新增目录与文件：`package.json`（workspaces）、`server/`、`web/`、`Dockerfile`、`docker-compose.yml`、`.env.example`、`.github/workflows/ci.yml`。
- 新增依赖：fastify、@fastify/static、pg、drizzle-orm、zod、pino-pretty（开发）、tsx、typescript、vitest、eslint、typescript-eslint、eslint-plugin-react-hooks、eslint-config-prettier、prettier；前端 react、react-dom、vite。
- 后续 change G（首次上线 Render）复用本 change 的 `Dockerfile`，只需新增 `render.yaml`。
