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
- ESLint 规则体系：时间有限，用 `tsc --noEmit` 做类型检查 + Prettier 格式化，已知限制。
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

### D4. 数据库访问：`pg.Pool` + `drizzle-orm/node-postgres`
- 本 change 只建立连接与 Drizzle 实例，schema 为空；B 再加表与 drizzle-kit 迁移。
- 健康检查执行 `select 1`，并用 `Promise.race` 加 2 秒超时；连接池设置 `connectionTimeoutMillis: 2000`，避免数据库挂起时健康检查一直等待。

### D5. 单服务托管前端
- 生产模式下 `@fastify/static` 托管 `web/dist`；`setNotFoundHandler` 中区分：`/api/*` → JSON 404；其他 GET → 返回 `index.html`。
- 开发模式下由 Vite 提供页面，`/api` 代理到 `localhost:3000`。
- 备选：前后端分开部署 —— 需要处理跨域和两个地址，部署与排障都更复杂。

### D6. 请求 ID
- Fastify `genReqId`：优先取请求头 `x-request-id`，否则生成 UUID；`onSend` 钩子写回响应头。日志自动带 `reqId`。

### D7. 本地运行与测试数据库
- `docker-compose.yml`：
  - `db`：`postgres:17`，命名卷持久化，`healthcheck` 用 `pg_isready`；`docker/initdb/` 脚本额外创建测试库 `polygon_test`。
  - `app`：用多阶段 `Dockerfile` 构建（安装依赖 → 构建前后端 → 仅含生产依赖的运行镜像），`depends_on: db (service_healthy)`。
- 测试读取 `TEST_DATABASE_URL`（默认 `postgres://postgres:postgres@localhost:5432/polygon_test`）。只跑测试时用 `docker compose up -d db` 起数据库即可。
- 备选：Testcontainers —— 自动化程度更高，但每次测试都要拉起容器，且 WSL / CI 中排障更复杂。

### D8. CI：GitHub Actions
- `ubuntu-latest`，Node 24，`services.postgres`（postgres:17）；步骤：`npm ci` → `npm run typecheck` → `npm run build` → `npm test`。

## Risks / Trade-offs

- [Docker 镜像构建慢，演示现场重建耗时] → 多阶段构建 + 依赖层缓存；演示前预先构建好镜像。
- [本地 5432 端口已被占用] → compose 中宿主端口可通过 `DB_PORT` 环境变量修改，README 常见故障中说明。
- [没有 ESLint，可能漏掉代码风格问题] → 依赖 `tsc --strict` 与 Prettier；在 `docs/verification.md` 中列为已知限制。
- [测试与开发共用一个 Postgres 实例] → 使用独立的 `polygon_test` 库，测试不碰开发数据。

## Migration Plan

新项目，无需迁移。回退方式：本 change 通过独立分支与 PR 合并，出问题可直接 revert 该 PR。
