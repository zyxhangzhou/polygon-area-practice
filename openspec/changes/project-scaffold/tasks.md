# Tasks

## 1. 仓库与工具链

- [x] 1.1 创建根 `package.json`（workspaces: `server`、`web`；脚本 `dev`/`build`/`test`/`typecheck`/`lint`/`format`/`format:check`）、`.nvmrc`（Node 24）、`.prettierrc`、根目录 `.env.example`（列出 `DATABASE_URL`、`PORT`、`LOG_LEVEL`、`DB_PORT`、`APP_PORT`、`TEST_DATABASE_URL` 并注释用途）；验证 `npm install` 成功
- [x] 1.2 创建 `server/` 包（Fastify 5、ESM、`tsconfig` strict、tsx、vitest），`dev`/`start` 脚本通过 `--env-file-if-exists=../.env` 加载根目录 `.env`；验证 `npm run typecheck -w server` 通过，且 `.env` 不存在时 `dev` 不因缺文件报错（只报配置缺失）
- [x] 1.3 用 Vite 创建 `web/` 包（React + TS），开发服务器将 `/api` 代理到 `localhost:3000`，首页显示项目名占位；验证 `npm run build -w web` 生成 `web/dist/index.html`
- [x] 1.4 配置最小 ESLint（根目录 `eslint.config.js`：`@eslint/js` + `typescript-eslint` recommended，`web/` 加 `react-hooks`，最后接 `eslint-config-prettier`）；验证 `npm run lint` 与 `npm run format:check` 通过，且故意写一个未使用变量时 `lint` 报错

## 2. 后端运维能力（service-operations）

- [x] 2.1 实现 `config.ts`：zod 校验 `DATABASE_URL`、`PORT`、`LOG_LEVEL`、`NODE_ENV`、`WEB_DIST_DIR`，失败时打印字段名并以退出码 1 退出；验证单元测试覆盖"缺少 DATABASE_URL"和"PORT=abc"两个场景
- [x] 2.2 实现 `db.ts`（`pg.Pool` + Drizzle，连接超时 2 秒）与 `buildApp(config)`：pino 日志、`genReqId` 沿用或生成 `x-request-id` 并写回响应头；验证集成测试：响应头带请求 ID、自带的 `test-123` 被沿用
- [x] 2.3 实现 `GET /api/health`（`select 1` + 2 秒超时，200/503）；验证集成测试：真实 Postgres 时返回 200 与 `{"status":"ok","db":"ok"}`，指向不可达地址时 3 秒内返回 503 与 `db: "unreachable"`

## 3. 前端托管（app-hosting）

- [x] 3.1 生产模式下用 `@fastify/static` 托管 `WEB_DIST_DIR`，notFound 处理按顺序区分：`/api/*` → JSON 404；最后一段带扩展名 → 404；GET 且 `Accept` 含 `text/html` → `index.html`；其他 → 404；验证集成测试覆盖 app-hosting 全部场景：`GET /`、存在的脚本、`/practice/x` 刷新返回 HTML；`/assets/missing.js`、`/videos/missing.mp4`（带 `Accept: text/html`）返回 404 且不是 HTML；`/api/not-exist` 返回 JSON 404

## 4. 本地运行环境

- [x] 4.1 编写多阶段 `Dockerfile`、`docker-compose.yml`（db + app，db healthcheck；`app` 不用 `env_file`，按 design D3a 显式传入 `DATABASE_URL`/`NODE_ENV`/`PORT`/`LOG_LEVEL`；端口用 `DB_PORT`/`APP_PORT` 替换）与 `docker/initdb/` 创建 `polygon_test` 库的脚本；验证 `docker compose up --build` 后 `curl localhost:3000/api/health` 返回 200，浏览器打开 `http://localhost:3000` 显示首页
- [x] 4.2 验证开发模式：`docker compose up -d db` + `npm run dev`，访问 Vite 地址首页能通过代理拿到 `/api/health` 结果
- [x] 4.3 在 README 中补充"快速开始"（Docker 方式与本地开发方式、测试命令）和"配置"一节（`.env` 位置、开发/测试/Compose 各自如何取配置）；验证按 README 命令能执行成功

## 5. CI

- [x] 5.1 编写 `.github/workflows/ci.yml`（Node 24 + postgres:17 service：npm ci → lint → format:check → typecheck → build → test）；验证推送后 GitHub Actions 运行通过

## 6. PR 评审修复

- [x] 6.1 连接池加 `query_timeout: 2000`、`keepAlive: true`，`pool` 挂到应用实例；验证集成测试：假数据库"能连上但不回应"时 3 秒内 503；通过可冻结的 TCP 代理让 10 个并发健康检查卡住，解冻后健康检查恢复为 200，且 `app.close()` 能结束
- [x] 6.2 `index.ts` 关闭流程：忽略重复信号、10 秒强制退出、关闭出错时记录日志并以退出码 1 退出
- [x] 6.3 `setErrorHandler` 统一错误格式（D6a）；验证集成测试：错误 JSON → 400 + `BAD_REQUEST`；抛异常 → 500 + `INTERNAL_ERROR`，响应不含内部信息，日志含异常与 `reqId`
- [x] 6.4 只沿用格式合法的 `x-request-id`；验证集成测试：日志 `reqId` 与响应头一致；超长或非法字符的值被替换
- [x] 6.5 配置校验收紧：`PORT` 只接受纯数字，`DATABASE_URL` 必须能被解析为 URL，`WEB_DIST_DIR` 转为绝对路径；`npm start` 设置 `NODE_ENV=production`；验证单元测试覆盖 `PORT=1e3`、相对 `WEB_DIST_DIR`
- [x] 6.6 README 与 `.env.example`：改正 `TEST_DATABASE_URL` 的设置方式（在 shell 中 export，测试不读 `.env`）；配置表补 `NODE_ENV`、`WEB_DIST_DIR`；常见故障补"旧数据卷没有 `polygon_test`"
- [x] 6.7 CI 新增 `docker build .` job，触发条件改为推送 `main` 与 pull request；验证 PR 上两个 job 都通过

## Workflow follow-up

- 开 PR 合并 `change/project-scaffold` 到 `main`，并在 `mydoc/plans/polygon-area-demo/` 中将 A 打勾。
- 合并后执行 `openspec archive project-scaffold`，把 specs 同步到 `openspec/specs/`。
