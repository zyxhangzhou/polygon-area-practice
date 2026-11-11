# Design

## Context

A 已经搭好 Fastify + Drizzle（`pg.Pool`）的骨架，schema 还是空的。这个 change 要定下全部表结构和题库内容，C（判题）、D（会话接口）、F（总结）直接在上面写逻辑。约束来自大纲：
- §2.3：12 道题。
- §2.4：题目四种状态与会话规则。
- §3：统计需要快照、作答、跳过和学习事件四类数据。
- §4.3：数据模型草案。
- §5：幂等与并发。

部署目标是 Render 免费档。免费档不支持 pre-deploy 命令，迁移只能放在服务启动流程里。

## Goals / Non-Goals

**Goals:**
- 表结构一次定型，C–F 不再改表。
- 能交给数据库保证的完整性规则全部用约束表达，包括唯一、外键、检查。应用逻辑写错时，数据库会拒绝写入，不会留下脏数据。
- 题库内容放在代码里，类型和结构都经过校验，可以重复写入。
- `docker compose up` 和 Render 部署都不需要手动执行迁移。
- 测试数据库互相隔离，为 C、D 的写库测试打好基础。

**Non-Goals:**
- 判题、规范化、统计计算（C）；接口与事务逻辑（D）。
- 视频文件本身（I）。这里只写视频地址。
- 前后端共享类型包。D 再评估是否抽 `shared/`；本 change 的 zod 结构先放在 `server/`。

## Decisions

### D1. 表结构

ID 约定：
- 关卡和题目用**固定整数 ID**（1–4、1–12），由种子指定。这样种子可以按 ID 更新，测试和前端也能用稳定的题号。
- 学生、会话和各类记录用 `uuid`，默认值 `gen_random_uuid()`。

| 表 | 主要列 | 约束 |
|---|---|---|
| `stages` | `id` int PK, `position`, `name`, `building_name`, `intro` | `position` 唯一（**提交时检查**，见下） |
| `questions` | `id` int PK, `stage_id` FK, `position_in_stage` 1–3, `shape_type`, `prompt`, `figure` jsonb, `answer` numeric(10,2), `unit`, `explanation` jsonb, `video_url` 可空, `common_mistakes` jsonb, `knowledge_point` | `(stage_id, position_in_stage)` 唯一（**提交时检查**）；`position_in_stage` 在 1–3 之间；`answer >= 0` |
| `learners` | `id` uuid PK, `nickname` 可空, `created_at` | — |
| `practice_sessions` | `id` uuid PK, `learner_id` FK, `status`, `started_at`, `completed_at` 可空, `ended_early` 可空 | `status` 只能是 `in_progress` 或 `completed`；`status='completed'` 当且仅当 `completed_at` 非空；部分唯一索引 `(learner_id) WHERE status='in_progress'` |
| `session_questions` | `session_id` FK（级联删除）, `question_id` FK, `position`, `stage_id` | PK `(session_id, question_id)`；`(session_id, position)` 唯一 |
| `attempts` | `id` uuid PK, `session_id`, `question_id`, `client_attempt_id` uuid, `raw_input`, `normalized_value` numeric(10,2), `is_correct`, `attempt_no`, `matched_mistake` 可空, `created_at` | 复合 FK `(session_id, question_id)` → `session_questions`；`(session_id, client_attempt_id)` 唯一；`(session_id, question_id, attempt_no)` 唯一；`attempt_no >= 1` |
| `question_skips` | `id` uuid PK, `session_id`, `question_id`, `client_request_id` uuid, `created_at` | 复合 FK → 快照；`(session_id, client_request_id)` 唯一 |
| `learning_events` | `id` uuid PK, `session_id`, `question_id`, `type`, `client_event_id` uuid, `payload` jsonb 可空, `created_at` | 复合 FK → 快照；`type` 只能是三种事件之一；`(session_id, client_event_id)` 唯一 |

补充说明：
- **无效输入不入库**（大纲 §3.2："不计入尝试次数，后端返回提示即可"），所以 `attempts.normalized_value` 非空。若以后要分析学生的错误输入，再加表，不污染尝试序号。
- **幂等键在会话内唯一**，而不是全局唯一（大纲草案写的是全局唯一）。理由：D 查重时按 `(session_id, key)` 查找。全局唯一的话，别的会话恰好用了同一个键，会导致写入失败，甚至把别人的结果返回给当前会话。键由前端生成 UUID，碰撞概率可以忽略，但按会话划分边界更清楚。
- **快照只记录题号、顺序和关卡**，不复制题干和答案。大纲要求"题库之后修改不影响已有会话"，指的是题目组成和顺序。题干改错别字应该同时修正旧会话的回看内容。
- **级联删除**：`session_questions`、`attempts`、`question_skips`、`learning_events` 随会话删除，会话随学生删除。目的是方便测试清理和以后的数据清除，业务上不提供删除接口。
- 时间列一律用 `timestamptz`。
- **位置唯一约束改为提交时检查**（`DEFERRABLE INITIALLY DEFERRED`，评审发现）：种子按 ID 逐行 upsert。若唯一约束立即生效，交换两道题的顺序时，第一行更新就会撞上另一道题还没更新的旧位置，事务失败，服务启动失败。改为提交时检查后，事务中途允许暂时重复，提交时仍保证唯一。upsert 以主键判断冲突，不依赖这两个约束，不受影响。Drizzle 的 schema 写不出可延迟约束，所以用 `drizzle-kit generate --custom` 单独生成迁移 `0001_deferrable_positions.sql`，并在 `schema.ts` 中注释说明。

### D2. 迁移：drizzle-kit 生成 SQL，运行时由 drizzle migrator 执行
- `server/drizzle.config.ts` 指向 `src/db/schema.ts`，`npm run db:generate -w server` 把迁移生成到 `server/drizzle/`，**提交到仓库**。
- 部分唯一索引用 `uniqueIndex().on(...).where(sql\`status = 'in_progress'\`)` 表达，检查约束用 `check()`，复合外键用 `foreignKey()`。生成 SQL 后人工检查一遍，确认这三类约束都在。
- 运行时用 `drizzle-orm/node-postgres/migrator` 的 `migrate()`。执行记录写在 `drizzle.__drizzle_migrations`，已经执行过的迁移会跳过。
- 迁移只做向前兼容的变更（大纲 §7）。本 change 只有一个初始迁移。
- 备选是手写 SQL 迁移：可控性更高，但 schema 要维护两份（TS 类型和 SQL）。Drizzle 能直接生成，选它。

### D3. 启动流程：迁移 → 种子 → 监听
- `index.ts` 先调用 `prepareDatabase(databaseUrl, log)`，它依次执行迁移和种子，再 `buildApp` + `listen`。
- 并发保护：drizzle migrator 本身不加锁。`prepareDatabase` 在同一条连接上先 `pg_advisory_lock(<固定 key>)`，迁移和种子做完再释放。这样，部署时新旧实例重叠，或多个测试进程同时启动，都不会重复执行迁移。
- 失败处理：输出"数据库准备失败：<原因>"，退出码为 1。连接与查询超时沿用 A 的 2 秒设置，数据库不可达时几秒内退出，不会卡住。
- 为什么不"先启动、健康检查报 503"：表结构或题库不完整时，对外服务只会制造更难排查的 500。直接退出，平台日志里能看到明确的原因。Compose 已经等数据库 healthy 才启动应用，Render 会自动重启服务。
- 另提供 `npm run db:migrate -w server` 和 `npm run db:seed -w server`，用于手动执行和排障。

### D4. 题库内容放在代码里，zod 校验后 upsert
- `server/src/content/schema.ts`：
  - 用 zod 定义图形参数，按 `shape_type` 做 discriminated union：`parallelogram`、`triangle`、`right-triangle`、`trapezoid`、`house`（长方形加三角形）、`l-shape`。
  - 同时定义解析结构（`steps: string[]` 至少 3 项，`tip: string`）和常见错误结构（`{ answer: string, hint: string }[]` 至少 1 项）。
- `server/src/content/questions.ts`：4 关 12 题的数据，用 `satisfies` 获得类型检查。答案用**字符串**书写（如 `'6.3'`），避免在 JS 里经过浮点数。
- `seed(db)`：
  - 先用 zod 校验全部数据，有错误时报出题号，一行都不写。
  - 然后在一个事务里对 `stages` 和 `questions` 按 ID 执行 `INSERT ... ON CONFLICT (id) DO UPDATE`。
  - **题目 ID 永久有效，不删除**：已有快照会引用题目 ID。写入前检查库中是否有种子之外的题；如果有，报错"题目 ID 不能删除，替换题目请在原 ID 上修改内容"，不写入。
- 种子写库之前，先检查数据自身的一致性：ID 不重复、关卡顺序不重复、同一关内序号不重复、所属关卡存在、每关恰好 3 题。不能等数据库报唯一约束冲突，那时只有一个约束名，看不出是哪道题。
- 图形参数校验的是**结构**，不校验答案和参数是否自洽（例如底×高是否等于答案）。自洽性由单元测试按题检查：每道题按公式用图形参数重新计算，结果应等于答案。这样能抓住"改了参数忘了改答案"的错误。
- 第 4、10 题的视频地址填 `/videos/q04.mp4`、`/videos/q10.mp4`。在 I 提供文件之前，这两个地址会返回 404，符合 A 的托管规则，也不会被误当成页面。

### D5. numeric 的读写
- `answer` 与 `normalized_value` 用 `numeric(10,2)`。Drizzle 默认把 numeric 映射成 **string**，正好避开浮点数。C 的十进制比较直接用字符串。
- 读出来的值形如 `'6.30'`（scale 为 2）。规格只要求与 `6.3` 等值，测试按数值比较，不按字符串比较。

### D6. 测试隔离
- 新增 `server/test/global-setup.ts`（vitest `globalSetup`），在所有测试开始前执行一次：
  1. 连接 `TEST_DATABASE_URL`，执行 `DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`；
  2. 调用与生产相同的 `prepareDatabase`，即迁移加种子。
- `vitest.config.ts` 设置 `fileParallelism: false`，测试文件串行执行，避免文件之间互相清数据。目前文件少、总时长短，串行的代价可以接受。
- `test/helpers.ts` 新增 `resetPracticeData(pool)`：`TRUNCATE learners CASCADE`，只清练习数据，不动题库。写练习数据的测试文件在 `beforeEach` 中调用它。
- 防误删：global setup 在 drop 之前检查连接串中的库名必须以 `_test` 结尾，否则直接报错。
- 备选是每个测试文件建一个独立 schema 或独立库：隔离更彻底，但要改 Drizzle 的 search_path 和迁移逻辑，对 12 题的 demo 收益不大。

### D7. Dockerfile
- 运行镜像中复制 `server/drizzle/`，与 `dist/` 同级。migrator 的 `migrationsFolder` 按编译后文件的位置解析（`path.resolve(dirname, '../drizzle')`），开发（`src/`）和生产（`dist/`）用同一个相对路径。

## Risks / Trade-offs

- [启动强依赖数据库，数据库不可达时服务直接退出] → 这是有意的取舍（D3）。Compose 有 healthcheck 等待，Render 会自动重启。README 的常见故障加一条。
- [`TRUNCATE` / `DROP SCHEMA` 误伤开发库] → 测试只认 `TEST_DATABASE_URL`，global setup 检查库名必须以 `_test` 结尾。
- [种子在每次启动时执行，修改题库后会覆盖线上题目内容] → 这正是想要的（题库以代码为准），但会影响已有会话的回看内容。答案修改会影响已有会话的判题：作答记录里存的是当时的判定结果，不会被重新判定，统计以记录为准。
- [迁移只能向前] → 演示期间只有一个初始迁移；以后的变更遵守向前兼容原则。
- [测试文件串行执行，耗时增加] → 当前约 7 秒，影响可以忽略；C、D 的测试多了以后再评估。

## Migration Plan

这是第一个包含业务表的迁移，没有存量数据。回退方式：revert 这个 PR，再执行 `docker compose down -v` 重建本地数据库。线上环境（G）还没有部署。
