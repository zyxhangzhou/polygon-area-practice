# Tasks

## 1. 表结构与迁移

- [x] 1.1 安装 `drizzle-kit`（dev），新增 `server/drizzle.config.ts` 与脚本 `db:generate` / `db:migrate` / `db:seed`；验证 `npm run db:generate -w server` 可执行
- [x] 1.2 在 `server/src/db/schema.ts` 按 design D1 定义 8 张表及全部约束（部分唯一索引、检查约束、复合外键、会话内幂等键唯一、尝试序号唯一、级联删除）；生成初始迁移到 `server/drizzle/`；验证人工检查生成的 SQL 中包含 `WHERE status = 'in_progress'` 的唯一索引、3 个检查约束类别与 3 个指向 `session_questions` 的复合外键
- [x] 1.3 实现 `prepareDatabase(databaseUrl, log)`：同一连接上 `pg_advisory_lock` → `migrate()` → `seed()` → 释放锁；`migrationsFolder` 按编译后位置解析；验证对已迁移的库再执行一次不报错、不重复执行

## 2. 题库内容

- [x] 2.1 `server/src/content/schema.ts`：zod 定义 6 种图形参数（discriminated union）、解析结构（≥3 步 + 易错提醒）、常见错误结构（≥1 条）
- [x] 2.2 `server/src/content/questions.ts`：4 关（名称、建筑名、简介）与 12 题完整内容（题干、图形参数、答案字符串、单位、3 步左右解析、易错提醒、常见错误答案与提示、知识点），第 4、10 题带视频地址
- [x] 2.3 实现 `seed(db)`：先 zod 校验全部数据（出错报题号、不写入），再在事务中按 ID upsert 关卡与题目；验证单元测试：结构不合法的种子数据被拒绝且库不变

## 3. 启动流程

- [x] 3.1 `index.ts` 改为 迁移 → 种子 → 监听，失败时输出"数据库准备失败"并以退出码 1 退出；验证集成测试（真实进程）：`DATABASE_URL` 指向不可达地址时非零退出且输出包含"数据库准备失败"
- [x] 3.2 Dockerfile 运行镜像复制 `server/drizzle/`；验证 `docker compose down -v && docker compose up --build` 后 `/api/health` 为 200，`psql` 查询 `questions` 为 12 行；再次 `docker compose restart app` 后仍为 12 行

## 4. 测试隔离

- [x] 4.1 新增 `test/global-setup.ts`（库名必须以 `_test` 结尾 → 重建 `public` 与 `drizzle` schema → `prepareDatabase`），`vitest.config.ts` 设置 `globalSetup` 与 `fileParallelism: false`；`helpers.ts` 新增 `resetPracticeData(pool)`；验证 A 的 34 个测试仍全部通过，且库名不以 `_test` 结尾时 global setup 报错

## 5. 规格测试

- [x] 5.1 question-bank 测试：4 关 12 题与关内序号；12 题答案与单位与大纲一致（按数值比较）；第 5 题答案无浮点误差；每题 ≥3 步解析且易错提醒非空；第 4、10 题有视频地址；第 4 题常见错误含 `60`；种子执行两次仍 12 题；改题干后重新执行种子恢复原内容
- [x] 5.2 题目自洽性单元测试：按图形参数用公式重新计算每道题，结果等于答案（第 3 题按逆运算、第 12 题乘以单产）
- [x] 5.3 practice-records 测试（直接写库）：第二个 `in_progress` 会话被拒、已完成会话不占名额；`completed` 缺结束时间被拒；快照题目重复被拒；快照外的题写作答被拒；同会话重复 `client_attempt_id` 在 `ON CONFLICT DO NOTHING` 下只有一行、不同会话可重复；尝试序号重复被拒；未知事件类型被拒
- [x] 5.4 service-operations 测试：对空库执行 `prepareDatabase` 后有 12 题；重复执行不报错且迁移记录数不变

## 6. 文档与 CI

- [x] 6.1 README：数据库命令（`db:generate` / `db:migrate` / `db:seed`）、"启动时自动迁移与种子"说明、常见故障新增"启动即退出：数据库准备失败"；`npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## 7. 评审修复：种子调整顺序

- [x] 7.1 用 `drizzle-kit generate --custom` 生成 `0001_deferrable_positions.sql`，把 `questions_stage_position_uq` 与 `stages_position_unique` 改为 `DEFERRABLE INITIALLY DEFERRED`；`schema.ts` 加注释说明
- [x] 7.2 `validateSeed` 增加一致性检查（ID、关卡顺序、关内序号不重复，所属关卡存在，每关 3 题）；`seed` 写入前检查库中是否有种子之外的题目
- [x] 7.3 测试：关内交换顺序、交换关卡顺序后重新执行种子成功；种子内序号重复被拒并指出题号；库中有种子之外的题被拒且提示 ID 不能删除；以上失败时题库不变；验证撤掉 7.1 后"交换顺序"测试失败

## 8. 评审修复（子代理审 PR #2）

- [x] 8.1 表结构：作答、跳过、学习事件加共用序列的 `seq`；`attempts` 加部分唯一索引 `(session_id, question_id) WHERE is_correct`；重新生成 `0000_init`、重建 `0001`
- [x] 8.2 第 3 题图形参数改为 `{ base, area, unknown: 'height' }`，zod 规则保证 `unknown` 指向的边不存在；自洽性测试改为用面积 ÷ 底计算
- [x] 8.3 `prepareDatabase`：`lock_timeout` 默认 30 秒（可传参）、`statement_timeout` 60 秒；错误描述展开到最内层的数据库错误，不打印 SQL 参数；种子的孤儿检查覆盖关卡
- [x] 8.4 测试：在全新空库上并发执行 `prepareDatabase`；持锁时超时退出；跳过/学习事件的幂等键与快照外键；快照顺序号唯一；每题最多一条答对记录；`seq` 跨表递增与并发事务顺序；已有练习记录时重新执行种子；真实进程在空库上启动后健康检查 200、重启后仍 12 题；错误描述展开 cause；图形参数不含所求边
- [x] 8.5 题目措辞（第 1、2 题提示，第 2、3 关简介"完全一样"，第 11 题"去掉了"）；README 补镜像内执行迁移的命令；计划 Follow-ups 记录留给 C、D 的注意事项

## Workflow follow-up

- 开 PR 合并 `change/data-model-question-bank` 到 `main`（squash），在 `mydoc/plans/polygon-area-demo/` 中将 B 打勾。
- 合并后执行 `openspec archive data-model-question-bank`。
