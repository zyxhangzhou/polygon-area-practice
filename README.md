# 多边形面积练习 Demo

小学五年级"多边形面积计算"全栈练习网页（面试实践题·选题一）。学生在"图形小镇"里做 4 关 12 道题：每做对一道题，这一关的建筑就盖高一层，三道题都做对就点亮。小熊"圆圆"给出反馈；答错时可以看图文解析，第 1、4、7、10 题（每关一题）还有视频讲解；练习结束后，总结页根据后端保存的作答记录给出统计和建议。

- **线上地址**：<https://polygon-area-practice.onrender.com>（Render 免费档，闲置后会休眠，第一次打开约需 30–60 秒）
- **交付说明**：验证结果、已知限制、未完成项、投入时间，见 [docs/delivery.md](docs/delivery.md)
- **AI 协同记录**：[docs/ai-collaboration.md](docs/ai-collaboration.md)

![答对第 3 题后面包店点亮](docs/screenshots/h/04-lit.jpg)

## 功能与题面要求

| 题面要求 | 实现 | 说明与验证 |
|---|---|---|
| 至少 10 道题，逐题作答 | 4 关 × 3 题：平行四边形、三角形、梯形、组合图形，含逆运算与实际应用 | 题库 `server/src/content/questions.ts`，启动时写入数据库 |
| 后端判题，保存作答与尝试记录 | 后端规范化输入后做十进制精确比较，每次有效作答都存一条记录（第几次、是否正确、命中的常见错误） | `server/src/grading/`；测试 `grading-*.test.ts`、`api-attempts.test.ts` |
| 空输入、非法输入、精度、重复提交 | 非法输入返回 400 且不计次数；`30`/`30.0`/`30.00` 相等；幂等键保证重复提交只记一次；前端在结果不确定时用同一个键重试 | 见下方"可靠性" |
| 正向反馈；答错友好地帮助继续 | 圆圆的 5 种状态；答对时建筑长高，三题都做对时点亮；答错时给出针对常见错误的提示，并在图形上画辅助线 | `web/src/companion/`、`web/src/town/`；截图 [docs/screenshots/h/](docs/screenshots/h/) |
| 两种解析方式，学生自选 | 12 题都有图文解析，条件、公式和关键用不同底色标出；每关一道题另有约 1 分钟的视频讲解（第 1、4、7、10 题），带字幕 | 素材来源 [docs/video-assets.md](docs/video-assets.md) |
| 趣味互动，与练习结合 | 图形小镇：建筑由各关进度驱动，按关卡解锁；首次进入时有引导 | 建筑状态只来自后端，刷新不变 |
| 学习总结，基于真实记录 | 三类题数（一次做对、订正后做对、需回顾）、首次正确率和最终完成率、具体建议、回看题目与解析；还有练习记录页 | 见下方"统计口径" |
| 部署与排障 | Docker Compose 一条命令启动；线上 Render；冒烟检查；日志带请求 ID；回滚步骤 | [docs/deploy.md](docs/deploy.md) |
| 自动化测试 | 后端 334 个（连接真实 PostgreSQL）、前端 208 个；CI 在每个 PR 上运行 | 见"运行测试"与 [docs/delivery.md](docs/delivery.md) |

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
docker compose up -d db       # 后端测试需要真实 Postgres（使用独立的 polygon_test 库）
npm test                      # 依次运行后端测试和前端测试
```

- 只跑前端测试：`npm run test -w web`。前端测试在 jsdom 中渲染页面，用模拟的 `fetch` 代替后端，不需要数据库。
- 需要真实浏览器的验证，记录在 [docs/verification.md](docs/verification.md)。

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

## 系统结构

```mermaid
flowchart LR
  subgraph 浏览器
    SPA["React 单页应用<br/>localStorage 只存匿名学生 ID 和会话 ID"]
  end
  subgraph Render["Render（新加坡，免费档）"]
    APP["Fastify 服务（Node 24）<br/>同时提供页面、视频与 /api"]
    DB[("PostgreSQL 17<br/>只允许内网连接")]
  end
  SPA -- "HTTPS：Cloudflare → Render 内网代理" --> APP
  APP -- "连接池；启动时迁移并写入题库" --> DB
  GH["GitHub main"] -- "CI 通过后自动部署" --> APP
  TTS["微软 Edge 在线朗读服务<br/>（只在生成视频时使用）"] -. "video/build.py" .-> VID["web/public/videos/*.mp4"]
```

- **前端**：React 19 + Vite 8。所有进度都从后端读取；刷新任何页面都回到后端保存的状态。
- **后端**：Fastify 5 + Drizzle ORM + pg。判题与统计是纯函数（`server/src/grading/`），数据库读写集中在 `server/src/practice/service.ts`。
- **数据库**：PostgreSQL 17。本地用 Docker Compose；线上用 Render Postgres，连接串由平台注入。
- **外部服务**：运行时没有。视频旁白在开发时一次生成后提交到仓库。

## 数据模型

| 表 | 内容 | 关键约束 |
|---|---|---|
| `stages` | 4 个关卡（名称、建筑名、介绍） | `position` 唯一 |
| `questions` | 12 道题：题干、图形参数、答案、单位、分步解析、易错提醒、常见错误、知识点、视频地址 | 每关 3 题；答案非负 |
| `learners` | 匿名学生 | — |
| `practice_sessions` | 一次练习：进行中 / 已结束、是否提前结束、结束时的序号 `completed_seq` | 每个学生最多一个进行中的练习（部分唯一索引） |
| `session_questions` | 开始练习时的题目快照（题号、顺序、关卡） | 会话内顺序唯一 |
| `attempts` | 每次有效作答：原始输入、规范化后的值、是否正确、第几次、命中的常见错误 | 幂等键会话内唯一；每题的作答序号唯一；每题最多一条正确记录 |
| `question_skips` | 跳过 | 幂等键会话内唯一 |
| `learning_events` | 学习行为：打开图文解析、开始播放视频、看完视频 | 幂等键会话内唯一；类型受检查约束 |

作答、跳过、学习事件共用一个数据库序列 `seq`。判断"答对前有没有看过解析"等先后关系时一律按 `seq`，不按时间戳。迁移文件在 `server/drizzle/`。

## 统计口径

完整规则见 `openspec/specs/learning-summary/spec.md`。练习进行中与结束后使用同一套计算（纯函数 `summarize()`），总结页的数字直接取自接口，前端不重新计算。

- **总题数** = 开始练习时快照中的题数，没作答的题也计入。
- **每道题只归入一类**：
  - **一次做对**：第 1 次有效作答就正确，且在这之前（按 `seq`）没有打开过图文解析、播放过视频；
  - **订正后做对**：答对了，但不满足上一条（先错后对，或先看解析再做对）；
  - **需回顾**：没有答对，原因分为答错还没改对、跳过了、没有作答。
- **首次正确率** = 一次做对 / 总题数；**最终完成率** =（一次做对 + 订正后做对）/ 总题数。四舍五入为整数百分数。
- **非法输入**（空、带单位、负数、超过 2 位小数等）返回 400，不写入记录，不计入第几次。**重复提交**（同一个幂等键）只记一次，返回第一次的结果。
- **跳过**不算作答；本关每题都做对或跳过过，就能进入下一关。
- **结束之后**上报的学习事件照常保存，但 `seq` 大于 `completed_seq`，不计入总结。

## 接口

所有接口在 `/api` 下，请求体和响应体都是 JSON。没有登录：会话 ID 是随机 UUID，也是访问凭证，拿到它的人可以代为作答（已知限制）。写接口的幂等键（`clientAttemptId` 等）由前端生成 UUID，重试时沿用同一个键。

| 方法与路径 | 请求体 | 说明 |
|---|---|---|
| `GET /api/health` | — | 健康检查 |
| `POST /api/learners` | `{ nickname? }` | 创建匿名学生 → `201 { learnerId }` |
| `GET /api/learners/:id/sessions` | — | 练习记录：最近 20 次练习，最近的在前，每次附统计 |
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
| 429 | `RATE_LIMITED` | 请求太频繁：`/api/` 下每个 IP 每分钟最多 300 次，创建学生每小时最多 60 次（健康检查不限）。请求没有被处理，`Retry-After` 秒后可以用同一个幂等键重试 |
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
| `TRUST_PROXY_HOPS` | `0` | 服务前面可信的反向代理层数，用于从 `X-Forwarded-For` 取客户端 IP（限流按它计数）；`0` 表示使用连接地址。线上取值见 [docs/deploy.md](docs/deploy.md) |
| `WEB_DIST_DIR` | `web/dist` | 生产模式下托管的前端目录；相对路径按启动目录解析 |
| `WEB_DEV_PORT` | `5173` | 前端开发服务器端口 |
| `DB_PORT` | `55432` | Compose 中 Postgres 映射到宿主机的端口 |
| `APP_PORT` | `3000` | Compose 中应用映射到宿主机的端口 |
| `TEST_DATABASE_URL` | 见上 | 测试数据库；只从 shell 读取，写在 `.env` 中无效 |

## 可靠性

| 问题 | 处理 |
|---|---|
| 重复提交、网络重试 | 写操作都带前端生成的幂等键，数据库唯一约束兜底；重放返回首次结果；同一个键带不同内容返回 `409 IDEMPOTENCY_CONFLICT` |
| 并发（两个标签页、连点） | 写操作先锁会话行（`FOR UPDATE`），开始练习时锁学生行；前端写请求排队，按顺序发送 |
| 结果不确定（超时、断网、5xx） | 前端不显示成功，提示"暂时没法确认有没有提交成功"，锁定输入，只能用同一个键"再提交一次" |
| 页面刷新 | 浏览器只存两个 ID，进度全部从后端恢复；建筑直接显示当前阶段，不重播动画 |
| 非法输入 | 后端校验并返回原因；前端只拦下空输入 |
| 数据库卡住 | 查询有超时；超时的连接直接销毁，不放回连接池（避免带着锁继续被使用）；健康检查 3 秒内返回 503 |
| 公网滥用 | 按 IP 限流（每分钟 300 次，创建学生每小时 60 次）；被限流的写请求在前端保留，等学生再提交一次 |
| 视频加载失败 | 提示改看图文解析 |

**仍有的限制**：
- 没有登录，换浏览器或清除缓存后找不到原来的记录；
- 会话 ID 就是访问凭证；
- 免费数据库约 30 天后过期，没有自动备份；
- 免费实例闲置后会休眠；
- 视频是公开的静态文件。

详见 [docs/delivery.md](docs/delivery.md)。

## 设计取舍

| 选择 | 原因 | 放弃了什么 |
|---|---|---|
| PostgreSQL，而不是 SQLite | Render 免费档的文件系统是临时的，SQLite 会丢数据；PostgreSQL 支持部分唯一索引、行锁和序列，用来保证并发一致性 | 本地多一个 Docker 容器 |
| 统计用纯函数从原始记录推导，不存汇总字段 | 只有一套口径，可以单测；重放结果也从记录重新算出，不会和存储的结果不一致 | 每次读取时重新计算（12 题，开销很小） |
| 前后端同源部署 | 一个 Render 服务，没有跨域；前端直接用后端的响应类型（`import type`） | 前后端不能分开扩容（演示不需要） |
| 建筑和圆圆用 SVG + CSS 动画，不引入动画库 | 由状态驱动、体积小、可测试；系统开了"减少动态效果"时统一关闭 | 复杂的手势或物理动画 |
| 标题字体自托管（Fontsource），正文用系统黑体 | Google Fonts 在国内访问不稳定，加载失败会卡住首屏 | 构建产物多出约 15 MB 字体切片（每个访问者只下载用到的几块） |
| 视频用 Python + Pillow 逐帧绘制，旁白用 edge-tts | 本机没有 Manim；可重复生成，数字从题库算出；edge-tts 由本人试听后选定 | edge-tts 是非官方接口（只在生成时使用） |
| 只要求学生填数字，单位固定 | 避免单位写法五花八门，判题口径清楚 | 不考查单位换算 |

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
- 线上：Render 控制台的 Logs，见 [docs/deploy.md](docs/deploy.md)。

## 部署与回退

- **线上**：Render Blueprint（[render.yaml](render.yaml)）声明一个 Docker Web 服务和一个 Postgres。main 分支的 CI 通过后自动部署；启动时自动迁移并写入题库；健康检查不通过时继续运行上一个版本。
- **部署后检查**：`npm run smoke -- https://polygon-area-practice.onrender.com`，6 步，任一步失败会输出请求 ID。
- **回退**：Render 控制台 → Events → 选上一次成功的部署 → Rollback。迁移只做向前兼容的变更（只加不删），回滚代码不需要回滚数据库。
- **导出数据**：临时允许本机 IP 连接数据库，用 `pg_dump` 导出。
- 首次部署步骤、代理层数的实测、常见故障：见 [docs/deploy.md](docs/deploy.md)。

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/delivery.md](docs/delivery.md) | 验证与限制说明：测试结果、已验证场景、已知问题、未完成项、投入时间、外部服务与成本 |
| [docs/ai-collaboration.md](docs/ai-collaboration.md) | AI 协同开发：3 段代表性记录、分工、AI 出错汇总 |
| [docs/ai-log-notes.md](docs/ai-log-notes.md) | 按 change 记录的完整过程 |
| [docs/verification.md](docs/verification.md) | 真实浏览器实跑记录与截图 |
| [docs/deploy.md](docs/deploy.md) | 部署、日志、回滚、导出、已知限制 |
| [docs/video-assets.md](docs/video-assets.md) | 视频讲解的素材来源与重新生成 |
| [docs/demo-script.md](docs/demo-script.md) | 展示流程 |
| [docs/project-outline.md](docs/project-outline.md) | 最初的项目大纲与决策记录 |
| `openspec/specs/` | 各模块的行为规格（21 份）；`openspec/changes/archive/` 是每个 change 的方案、设计与任务 |
| [mydoc/plans/polygon-area-demo/](mydoc/plans/polygon-area-demo/README.md) | 需求拆分计划（A–J，v1–v4） |

## 提交说明

- **开发过程**：A–J 共 10 个 change，各对应一个 PR（#1–#9；J 为最后一个 PR）。main 上是 squash 合并，逐条提交保留在各 PR 中。
- **投入时间、复用内容、未完成项**：见 [docs/delivery.md](docs/delivery.md)。
