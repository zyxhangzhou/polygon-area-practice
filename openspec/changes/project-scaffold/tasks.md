# Tasks

## 1. 仓库与工具链

- [ ] 1.1 创建根 `package.json`（workspaces: `server`、`web`；脚本 `dev`/`build`/`test`/`typecheck`/`format`）、`.nvmrc`（Node 24）、`.prettierrc`、`.env.example`；验证 `npm install` 成功
- [ ] 1.2 创建 `server/` 包（Fastify 5、ESM、`tsconfig` strict、tsx、vitest）；验证 `npm run typecheck -w server` 通过
- [ ] 1.3 用 Vite 创建 `web/` 包（React + TS），开发服务器将 `/api` 代理到 `localhost:3000`，首页显示项目名占位；验证 `npm run build -w web` 生成 `web/dist/index.html`

## 2. 后端运维能力（service-operations）

- [ ] 2.1 实现 `config.ts`：zod 校验 `DATABASE_URL`、`PORT`、`LOG_LEVEL`、`NODE_ENV`、`WEB_DIST_DIR`，失败时打印字段名并以退出码 1 退出；验证单元测试覆盖"缺少 DATABASE_URL"和"PORT=abc"两个场景
- [ ] 2.2 实现 `db.ts`（`pg.Pool` + Drizzle，连接超时 2 秒）与 `buildApp(config)`：pino 日志、`genReqId` 沿用或生成 `x-request-id` 并写回响应头；验证集成测试：响应头带请求 ID、自带的 `test-123` 被沿用
- [ ] 2.3 实现 `GET /api/health`（`select 1` + 2 秒超时，200/503）；验证集成测试：真实 Postgres 时返回 200 与 `{"status":"ok","db":"ok"}`，指向不可达地址时 3 秒内返回 503 与 `db: "unreachable"`

## 3. 前端托管（app-hosting）

- [ ] 3.1 生产模式下用 `@fastify/static` 托管 `WEB_DIST_DIR`，notFound 处理区分 `/api/*`（JSON 404）与其他 GET（返回 `index.html`）；验证集成测试：`GET /` 与 `GET /practice/x` 返回 HTML，`GET /api/not-exist` 返回 JSON 404

## 4. 本地运行环境

- [ ] 4.1 编写多阶段 `Dockerfile`、`docker-compose.yml`（db + app，db healthcheck，`DB_PORT` 可配置）与 `docker/initdb/` 创建 `polygon_test` 库的脚本；验证 `docker compose up --build` 后 `curl localhost:3000/api/health` 返回 200，浏览器打开 `http://localhost:3000` 显示首页
- [ ] 4.2 验证开发模式：`docker compose up -d db` + `npm run dev`，访问 Vite 地址首页能通过代理拿到 `/api/health` 结果
- [ ] 4.3 在 README 中补充"快速开始"（Docker 方式与本地开发方式、测试命令）；验证按 README 命令能执行成功

## 5. CI

- [ ] 5.1 编写 `.github/workflows/ci.yml`（Node 24 + postgres:17 service：npm ci → typecheck → build → test）；验证推送后 GitHub Actions 运行通过

## Workflow follow-up

- 开 PR 合并 `change/project-scaffold` 到 `main`，并在 `mydoc/plans/polygon-area-demo/` 中将 A 打勾。
- 合并后执行 `openspec archive project-scaffold`，把 specs 同步到 `openspec/specs/`。
