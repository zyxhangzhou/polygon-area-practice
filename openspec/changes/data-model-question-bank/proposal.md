# Proposal

## Why

后续的判题（C）、会话接口（D）和总结（F）都要读写同一套数据：题库、匿名学生、练习会话、题目快照、作答、跳过和学习事件。先把表结构、约束和 12 道题定下来并落库，后面的 change 只写逻辑，不再改表。幂等、"每个学生同时只有一个进行中的练习"这类可靠性要求，也要先靠数据库约束兜底。

## What Changes

- 用 Drizzle 定义 8 张表：`stages`、`questions`、`learners`、`practice_sessions`、`session_questions`、`attempts`、`question_skips`、`learning_events`。用 drizzle-kit 生成 SQL 迁移文件并提交到仓库。
- 数据库约束：
  - 部分唯一索引：每个学生最多一个 `in_progress` 会话。
  - 幂等键在会话内唯一：`client_attempt_id`、`client_request_id`、`client_event_id`。
  - 同一会话同一题的尝试序号唯一。
  - 作答、跳过、学习事件只能指向本会话快照里的题（复合外键）。
  - 状态与结束时间、事件类型都有检查约束。
- 种子数据：4 关 12 题，即大纲 §2.3。每题包含题干、图形参数、答案（精确小数）、单位、3 步左右的图文解析、易错提醒和常见错误答案。第 4、10 题带视频地址（视频文件由 I 提供）。种子可以重复执行，按固定 ID 更新，不会产生重复数据。
- 图形参数和解析结构用 zod 定义，种子写入前先校验。
- 服务启动时先执行迁移和种子，再监听端口；任一步失败就以非零码退出。另提供 `npm run db:generate`、`db:migrate`、`db:seed`。
- 测试隔离（PR #1 评审遗留）：测试开始前把测试库重建、迁移并写入种子；测试文件改为串行执行；提供清空练习数据的辅助函数。
- Dockerfile 运行镜像带上迁移文件。

## Capabilities

### New Capabilities
- `question-bank`：题库的内容与完整性，包括关卡与题目的组成、答案的精确存储、每题解析与视频的覆盖、种子可重复执行。
- `practice-records`：练习数据的存储约束，包括进行中会话唯一、幂等键唯一、尝试序号唯一、记录只能指向会话快照中的题、状态与事件类型合法。

### Modified Capabilities
- `service-operations`：新增"启动时准备数据库"需求。启动时自动迁移和写入题库，失败时以非零码退出。

## Impact

- 新增：`server/src/db/schema.ts`、`server/src/db/migrate.ts`、`server/src/db/seed.ts`、`server/src/content/`（题库数据与 zod 结构）、`server/drizzle/`（迁移 SQL）、`server/drizzle.config.ts`。
- 修改：
  - `server/src/index.ts`：启动顺序改为迁移 → 种子 → 监听。
  - `server/vitest.config.ts`：加 globalSetup，测试文件串行执行。
  - `server/test/helpers.ts`。
  - `Dockerfile`：复制迁移文件。
  - README：数据库命令。
- 新依赖：`drizzle-kit`（dev）。
- 行为变化：数据库不可达时，服务**启动失败退出**，不再先启动、再让健康检查返回 503。Compose 已用 `depends_on: service_healthy` 等待数据库，Render 会自动重启服务。
