# Tasks

## 1. 表结构与基础设施

- [ ] 1.1 `schema.ts` 给 `practice_sessions` 加 `completed_seq` 与检查约束；`npm run db:generate` 生成 `0002`，手工在加约束前补一句给已结束会话回填 `nextval`；验证 practice-records 测试新增"已结束缺少结束序号被拒"，迁移在已有数据的开发库上执行成功
- [ ] 1.2 `AppError` 与错误处理器：服务层抛出的 `AppError` 按原状态码和错误码返回；验证单元测试覆盖 `AppError` → 响应、普通错误仍为 `500` 通用文案
- [ ] 1.3 测试辅助 `test/practice-client.ts`：创建学生与会话、`answer` / `skip` / `event` / `complete` 简写，每个测试前 `resetPracticeData`

## 2. 学生与会话

- [ ] 2.1 `POST /api/learners`、`POST /api/sessions`（锁学生行，新建时写 12 题快照）、`GET /api/sessions/:id`（`SessionView`）；验证 `test/api-sessions.test.ts`：新建 201 / 继续 200 / 再练一次 201 且旧会话保留 / 学生不存在 404 / 5 个并发开始返回同一会话且库中只有一个 / 非 UUID 的 ID 返回 404 / 缺字段 400
- [ ] 2.2 `GET /api/sessions/:id/questions/:qid`；验证响应不含答案、常见错误和解析，快照外的题 404

## 3. 作答与跳过

- [ ] 3.1 `POST /attempts`：锁会话 → 幂等检查 → 写入限制 → 判题 → 写入 → 按 design D4 由记录推出结果；验证 `test/api-attempts.test.ts`：答对、常见错误提示、先错后对、点亮关卡、非法输入 400 且不占序号、已答对再提交 200 不写入、会话已结束 409、关卡未解锁 409、快照外的题 404
- [ ] 3.2 幂等与并发；验证：同键重复提交只一条且结果相同、同键不同内容 409、结束后重放返回首次结果、同题 5 个不同键并发序号恰为 1–5、同键 5 个并发只一条
- [ ] 3.3 `POST /questions/:qid/skip`；验证：跳过后下一关解锁、同键重复只一条、已答对返回 `alreadySolved`、结束后 409

## 4. 解析与学习事件

- [ ] 4.1 `GET /explanation` 与 `POST /events`；验证 `test/api-explanation.test.ts`：未作答 403、答错与跳过后可取、结束后可回看、第 4 题有视频地址、获取解析不产生记录、事件同键只一条、未知类型 400、解析不可获取时上报 403、`payload` 超过 1 KB 返回 400

## 5. 结束与总结

- [ ] 5.1 `POST /complete` 与 `GET /summary`；验证 `test/api-complete.test.ts`：做完后结束 `endedEarly` 为 false、未做完且未确认 409、提前结束、重复结束 200 且结束时间不变、总结与会话状态数字一致、提前结束时总题数 12 且未作答原因为 `unanswered`、结束后上报的事件写入但不计入总结

## 6. 端到端场景与文档

- [ ] 6.1 `test/api-flow.test.ts` 覆盖大纲 §6 的 9 个场景（正常流程做完 12 题后总结数字正确等），与上面重复的场景可以直接引用；验证全部通过
- [ ] 6.2 README 增加接口列表与错误码表；计划 Follow-ups 中 D 的条目标记完成；`npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/practice-session-api` 到 `main`（squash），在计划中将 D 打勾。
- 合并后在下一个 change 的分支上执行 `openspec archive practice-session-api`。
