# Design

## Context

空仓库，只有文档。约束见 `docs/project-outline.md` §4：Node.js + TypeScript，Fastify，Drizzle + PostgreSQL，React + Vite，Vitest 连真实 Postgres，本地 Docker Compose，线上 Render（单 Web 服务 + Postgres）。三天交付，骨架要简单、少魔法、易排障。

## Goals / Non-Goals

**Goals:**
- 一条命令（`docker compose up --build`）在干净环境启动完整应用。
- 本地开发热重载：`npm run dev` 同时启动后端与 Vite。
- 测试连接真实 Postgres，本地与 CI 行为一致。
- 目录结构能直接承接 B–J，不需要中途重构。

**Non-Goals:**
- 业务表、迁移文件（change B）；业务接口（change D）。
- 大型代码风格规则集（如 Airbnb）：只配最小 ESLint，见 D9。
- `render.yaml`（change G）。

## Decisions

### D1. npm workspaces 单仓库：`server/` + `web/`
- 根 `package.json` 声明 workspaces，提供 `dev` / `build` / `test` / `typecheck` 汇总脚本。
- 暂不建 `shared/` 包。前后端共享的类型（接口请求/响应）到 change D 再评估；过早抽包会引入构建顺序问题。
- 备选：pnpm / Turborepo —— 对两个包没有收益，且增加评审者的环境要求。

### D2. 后端：Fastify 5 + ESM + TypeScript
- 开发用 `tsx watch`，生产用 `tsc` 编译到 `dist/` 后 `node dist/index.js`。
- **`buildApp(config)` 与 `index.ts`（监听端口）分离**：测试直接 `buildApp` + `app.inject()`，不占端口、不需要启动进程。
- 选 Fastify 而非 Express：内置 pino 日志与请求 ID、schema 校验、`inject` 测试能力，正好对应本项目的排障与测试要求。

### D3. 配置：zod 校验环境变量，失败即退出
- `DATABASE_URL`（必填）、`PORT`（默认 3000）、`LOG_LEVEL`（默认 info）、`NODE_ENV`、`WEB_DIST_DIR`（可选，默认指向 `web/dist`）。
- 校验失败打印字段名后 `process.exit(1)`；满足 `service-operations` 的启动校验要求。
- **只有进程入口读取环境变量**：`index.ts` 调用 `loadConfig(process.env)` 得到配置对象，再传给 `buildApp(config)`。应用内部和测试都不直接读 `process.env`。

### D3a. `.env` 的位置与各环境的加载方式

**只有一个 `.env`，放在仓库根目录**，从根目录的 `.env.example` 复制而来，已被 `.gitignore` 排除。

| 环境 | 配置来源 | 加载方式 |
|---|---|---|
| 本地开发 `npm run dev` | 根目录 `.env` | 后端脚本用 Node 原生参数 `--env-file-if-exists=../.env` 加载（已验证：shell 中已有的变量优先，文件不存在不报错）。不引入 dotenv |
| 测试 `npm test` | **不读 `.env`** | 只认 `TEST_DATABASE_URL`，未设置时默认 `postgres://postgres:postgres@localhost:5432/polygon_test`。测试自己构造配置对象传给 `buildApp`，避免误连开发库 |
| Docker Compose | compose 文件中**显式写出** | `app` 服务不使用 `env_file`，见下表；根目录 `.env` 只被 Compose 用于变量替换（端口、日志级别） |
| CI | workflow 中显式写出 | `TEST_DATABASE_URL` 指向 CI 的 Postgres service |
| Render（change G） | 平台环境变量 | 在 `render.yaml` 中声明，数据库连接串由平台注入 |

**Compose 显式传入的变量**：

| 服务 | 变量 | 值 |
|---|---|---|
| `db` | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `postgres` / `postgres` / `polygon`（仅本地开发用的固定值） |
| `app` | `DATABASE_URL` | `postgres://postgres:postgres@db:5432/polygon`（容器内用服务名 `db`） |
| `app` | `NODE_ENV` | `production` |
| `app` | `PORT` | `3000` |
| `app` | `LOG_LEVEL` | `${LOG_LEVEL:-info}` |
| 端口映射 | `DB_PORT` / `APP_PORT` | `${DB_PORT:-5432}` / `${APP_PORT:-3000}`，可在根 `.env` 中修改 |

不让 `app` 读取 `.env` 的原因：本地 `.env` 里的 `DATABASE_URL` 指向 `localhost`，在容器里会连错地址。

### D4. 数据库访问：`pg.Pool` + `drizzle-orm/node-postgres`
- 本 change 只建立连接与 Drizzle 实例，schema 为空；B 再加表与 drizzle-kit 迁移。
- 健康检查执行 `select 1`，并用 `Promise.race` 加 2 秒超时；连接池设置 `connectionTimeoutMillis: 2000`，避免数据库挂起时健康检查一直等待。

### D5. 单服务托管前端
- 生产模式下 `@fastify/static` 托管 `web/dist`（视频等后续静态资源也走这里）。
- `setNotFoundHandler` 中按顺序判断：
  1. `/api/*` → JSON 404；
  2. 路径最后一段带扩展名（如 `.js`、`.png`、`.mp4`）→ 404，**不回退**，避免丢失的资源被掩盖成 200 + HTML，增加排障难度；
  3. GET 且 `Accept` 含 `text/html` → 返回 `index.html`（前端路由刷新）；
  4. 其他 → 404。
- 前端路由约定：路径不使用带点的段（会话 ID 用 UUID，不含点），保证规则 2 不会误伤页面。
- 开发模式下由 Vite 提供页面，`/api` 代理到 `localhost:3000`。
- 备选：前后端分开部署 —— 需要处理跨域和两个地址，部署与排障都更复杂。

### D6. 请求 ID
- Fastify `genReqId`：优先取请求头 `x-request-id`，否则生成 UUID；`onSend` 钩子写回响应头。日志自动带 `reqId`。

### D7. 本地运行与测试数据库
- `docker-compose.yml`：
  - `db`：`postgres:17`，命名卷持久化，`healthcheck` 用 `pg_isready`；`docker/initdb/` 脚本额外创建测试库 `polygon_test`。
  - `app`：用多阶段 `Dockerfile` 构建（安装依赖 → 构建前后端 → 仅含生产依赖的运行镜像），`depends_on: db (service_healthy)`。
- 测试读取 `TEST_DATABASE_URL`（默认 `postgres://postgres:postgres@localhost:5432/polygon_test`）。只跑测试时用 `docker compose up -d db` 起数据库即可。
- 备选：Testcontainers —— 现有 Compose（本地）和 CI 的 Postgres service 已经能提供测试数据库，再引入一套数据库启动机制收益有限。

### D8. CI：GitHub Actions
- `ubuntu-latest`，Node 24，`services.postgres`（postgres:17）；步骤：`npm ci` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm run build` → `npm test`。

### D9. 最小 ESLint
- 根目录一份 flat config（`eslint.config.js`），覆盖 `server/` 与 `web/`：
  - `@eslint/js` recommended + `typescript-eslint` recommended（非 type-checked 版本，速度快、配置少）；
  - `web/` 额外启用 `eslint-plugin-react-hooks`（Hooks 依赖遗漏是类型检查发现不了的常见 bug）；
  - 最后接 `eslint-config-prettier`，关闭所有与格式相关的规则，**格式只由 Prettier 负责**，两者不重复检查。
- 不引入 Airbnb 等大型风格规则集。
- 提供 `npm run lint`，并放进 CI。
- 理由：新增成本有限，能补上类型检查之外的一部分问题，如未使用的变量、Hooks 误用、无意的 `any`。

## Risks / Trade-offs

- [Docker 镜像构建慢，演示现场重建耗时] → 多阶段构建 + 依赖层缓存；演示前预先构建好镜像。
- [本地 5432 端口已被占用] → compose 中宿主端口可通过 `DB_PORT` 环境变量修改，README 常见故障中说明。
- [最小 ESLint 规则覆盖有限，不做类型感知检查] → 由 `tsc --strict` 补足类型层面；需要时再逐条加规则。
- [前端路由若出现带点的路径段会被当成静态资源返回 404] → 约定路由不使用带点的段，并由 app-hosting 的测试覆盖。
- [测试与开发共用一个 Postgres 实例] → 使用独立的 `polygon_test` 库，测试不碰开发数据。

## Migration Plan

新项目，无需迁移。回退方式：本 change 通过独立分支与 PR 合并，出问题可直接 revert 该 PR。
