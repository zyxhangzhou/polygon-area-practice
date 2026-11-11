# Design

## Context

- 表结构见 B（`server/src/db/schema.ts`）。判题与统计用 C 的纯函数：`gradeAnswer`、`summarize`（`server/src/grading/`）。
- 连接池设置了 `query_timeout: 2000`：等锁超过 2 秒的查询会报错，变成 `500`。
- 错误处理器（`app.ts`）已统一为 `{ error: { code, message } }` 格式，`5xx` 只返回通用文案。
- 计划的 Follow-ups 给 D 留了 3 条：并发开始练习、写入前锁会话行、按 `seq` 过滤结束后的学习事件。

## Goals / Non-Goals

**Goals:**
- 每个写接口在一个事务里完成，并发和重试都不会产生重复或互相矛盾的记录。
- 所有进度和统计数字都来自 `summarize`，接口自己不再计算状态。

**Non-Goals:**
- 请求频率限制（`@fastify/rate-limit`）归 G。
- 会话归属校验：没有登录，会话 ID（随机 UUID）就是访问凭证，见 Risks。
- 题库修改后已有会话的答案不变：快照只冻结题目组成和顺序，答案仍读题库，见 Risks。

## Decisions

### D1 分层

| 层 | 文件 | 职责 |
|---|---|---|
| 路由 | `routes/learners.ts`、`routes/sessions.ts` | zod 校验请求，调用服务，设置状态码 |
| 服务 | `practice/service.ts` | 事务、加锁、读写，调用 C 的纯函数 |
| 视图 | `practice/view.ts` | 把 `summarize` 的结果和题库信息拼成响应 |
| 纯函数 | `grading/`（C） | 判题与统计 |

新增 `AppError(status, code, message)`。服务层抛出它，错误处理器原样转成响应，其他错误仍按 `500` 处理。

### D2 写操作一律先锁会话行

作答、跳过、学习事件、结束这 4 种写操作，都在事务里先执行 `SELECT … FROM practice_sessions WHERE id = $1 FOR UPDATE`，再做检查和写入。

- 同一会话的写操作因此串行：作答序号取"该题已有作答数 + 1"不会撞车，`seq` 的先后就是处理的先后。
- 不同会话之间互不影响。
- 写操作先锁住，再在锁内用 `summarize` 计算解锁和是否已答对，所以检查和写入之间状态不会被别的请求改掉。
- 读接口（会话状态、题目、解析、总结）不加锁。

备选方案"不加锁，靠唯一约束冲突后重试"：代码更绕，`seq` 也不能保证代表真实顺序。

### D3 开始练习：锁学生行

`POST /api/sessions` 在事务里先 `SELECT … FROM learners WHERE id = $1 FOR UPDATE`，再查进行中的会话，没有就新建会话并写入快照。同一学生的并发请求因此排队，第二个请求能看到第一个建好的会话。

备选方案"直接插入，捕获部分唯一索引的 23505 再查询"：在 Postgres 里，事务中报错后整个事务作废，必须另开事务重查，更复杂。部分唯一索引保留，作为兜底。

### D4 幂等与"首次结果"

锁住会话后，先按 `(session_id, client_*_id)` 查已有记录：

- 已存在且题目和原始输入相同 → 重放（`200`，`replayed: true`）；
- 已存在但内容不同 → `409 IDEMPOTENCY_CONFLICT`；
- 不存在 → 按写入限制依次检查，再写入。

幂等检查放在"会话已结束"检查之前，保证结束前已保存的作答在结束后重放仍能拿到结果。

作答结果不单独存储，而是由记录**重新推出**：用该作答 `seq` 之前的记录和到这条为止的记录，各算一次 `summarize`，比较前后差异得到分类、是否点亮关卡等字段。

- 首次请求和重放走同一段代码，结果必然一致。
- `result` 只描述那一次提交，`session` 描述当前状态。例如先错后对之后重放第一次，`result` 仍为错误、第 1 次，`session` 中该题为 `solved`。前端收到 `replayed: true` 时只按 `session` 刷新界面，不弹出对错反馈（E 实现）。
- 常见错误的提示按 `matched_mistake`（规范值）从题库中查出。

### D5 结束练习与 `completed_seq`

迁移 `0002`：`practice_sessions` 加 `completed_seq bigint`，并加检查约束 `(status = 'completed') = (completed_seq is not null)`。

结束时在锁内执行：`status = 'completed'`、`completed_at = now()`、`completed_seq = nextval('practice_record_seq')`、`ended_early = not canFinish`。

学习事件写入前同样要锁会话行，所以结束之后写入的事件，`seq` 一定大于 `completed_seq`。计算总结时只取 `seq < completed_seq` 的学习事件；作答和跳过在结束后本来就写不进去。

### D6 请求校验

- 请求体和路径参数用 zod 校验。
- 路径中的会话 ID 不是 UUID 时直接返回 `404 SESSION_NOT_FOUND`，避免把非法 UUID 传给 Postgres，导致 `22P02` 报错，进而变成 `500`。
- `answer` 限制为最长 200 个字符的字符串；更细的规则（32 个字符等）交给 `gradeAnswer`，由它返回 `INVALID_ANSWER` 和提示。
- `payload` 序列化后不超过 1 KB；这些接口的请求体上限设为 16 KB。

### D7 响应结构

会话视图 `SessionView` 用于会话状态，也附在每个写接口的响应里：

```ts
{
  session: { id, status, endedEarly, startedAt, completedAt },
  stages: [{ stageId, name, buildingName, intro, lit, unlocked, solvedCount, total }],
  questions: [{ questionId, stageId, position, status }],
  currentQuestionId, canFinish, skippedCount,
  counts: { total, firstTry, corrected, notYet },
  rates: { firstTry, completion },
}
```

作答响应：

```ts
{
  replayed, alreadySolved,
  result: { questionId, correct, attemptNo, normalizedValue, outcome, mistakeHint, stageLit } | null,
  session,
}
```

总结 `GET /summary`：在 `SessionView` 的基础上，每题再附 `outcome`、`reviewReason`、`facts`、`prompt`、`knowledgePoint`。会话进行中也可以请求，前端按 `session.status` 决定怎么展示。

### D8 测试

- 集成测试用 `app.inject` 走真实路由和真实 Postgres，每个测试前调用 `resetPracticeData`。
- 并发场景用 `Promise.all` 同时发出多个 `inject`。这些请求会从连接池拿到不同的连接，对数据库来说就是真实的并发事务。
- 写一个测试辅助：自动创建学生和会话，并提供 `answer(qid, value)`、`skip(qid)` 这类简写。

## Risks / Trade-offs

- [会话 ID 即凭证：拿到 ID 的人可以代答] → UUID v4 无法猜测，且只存在学生自己的浏览器里；写入已知限制。加登录不在本题范围内。
- [锁等待超过 2 秒变成 `500`] → 同一会话的并发只来自同一个学生连点或重试，事务很短；万一超时，前端按"结果不确定"提示重试，幂等键保证不会重复记录。
- [答案不进快照，题库改了答案会影响进行中的会话] → 答案改动只会是修正错误，此时希望立即生效；已保存的作答对错不会被重算。
- [每次写入都要读全会话记录并跑 `summarize`] → 每个会话最多 12 题、几十条记录，查询量很小，换来所有数字同一口径。

## Migration Plan

`0002` 只新增可空列和检查约束。已有的已结束会话没有 `completed_seq`，会违反新约束。迁移中先给它们补一个 `nextval`，再加约束；目前只有测试库和本地开发库有数据，线上还未部署。
