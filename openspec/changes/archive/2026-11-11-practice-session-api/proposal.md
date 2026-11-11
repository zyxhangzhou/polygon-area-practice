# Proposal

## Why

B 建好了表，C 写好了判题和统计的纯函数，但学生还没法真正做一次练习：没有接口把"开始 → 作答 → 跳过 → 看解析 → 结束 → 总结"串起来。前端（E、F）依赖这些接口，而评分重心"后端判题、持久化、幂等、刷新恢复、前后端状态一致"也主要落在这一层（大纲 §4.4、§5、§6）。

## What Changes

- 新增 9 个接口（大纲 §4.4，`/api/health` 已有）：
  - `POST /api/learners`：创建匿名学生。
  - `POST /api/sessions`：开始或继续练习；已有进行中的会话就返回它，否则新建并复制 12 题快照。
  - `GET /api/sessions/:id`：会话状态（关卡、每题状态、当前题、统计），刷新恢复靠它。
  - `GET /api/sessions/:id/questions/:qid`：题目详情，不含答案和解析。
  - `POST /api/sessions/:id/attempts`：提交答案，返回判题结果与最新进度。
  - `POST /api/sessions/:id/questions/:qid/skip`：跳过。
  - `GET /api/sessions/:id/questions/:qid/explanation`：解析内容，按状态限制。
  - `POST /api/sessions/:id/events`：上报学习行为。
  - `POST /api/sessions/:id/complete`：结束练习。
  - `GET /api/sessions/:id/summary`：学习总结。
- 幂等：作答、跳过、学习事件用客户端生成的键去重；重放返回首次结果。同一个键带了不同内容时返回 409。
- 并发：写入前锁住会话行，作答序号不重复、`seq` 代表会话内的真实顺序；两个"开始练习"同时到达时返回同一个会话。
- 已结束的会话拒绝作答和跳过（`409 SESSION_COMPLETED`）；解析仍可查看，行为仍会记录，但不计入统计。
- 统一错误格式 `{ error: { code, message } }`，每种拒绝有固定错误码。
- 表结构：`practice_sessions` 新增 `completed_seq`（C 评审遗留）。结束时取一个 `seq` 写入，统计只看这之前的学习事件。
- 集成测试连真实 Postgres，覆盖大纲 §6 的 9 个场景和并发、幂等场景。

## Capabilities

### New Capabilities
- `practice-sessions`：匿名学生、会话的开始与继续、会话状态与刷新恢复、题目详情、结束练习、学习总结接口。
- `practice-answering`：提交作答与跳过，包括判题结果、幂等重放、并发下的序号、关卡与会话状态的限制。
- `explanation-access`：解析内容的访问规则与学习行为上报。

### Modified Capabilities
- `practice-records`：新增"会话结束时记录结束序号"的要求。

## Impact

- 新增：`server/src/practice/`（服务层：读写与事务）、`server/src/routes/learners.ts`、`server/src/routes/sessions.ts`、迁移 `server/drizzle/0002_*.sql`、集成测试 `server/test/api-*.test.ts`。
- 修改：`server/src/db/schema.ts`（`completed_seq`）、`server/src/app.ts`（注册路由）、README（接口列表）。
- 不加依赖：请求体用已有的 zod 校验。
- 前端尚未调用这些接口，没有兼容性问题。
