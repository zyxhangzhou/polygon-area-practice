# Spec Delta

## Purpose

规定匿名学生与练习会话的接口行为：开始或继续练习、刷新后恢复进度、查看题目、结束练习和查看总结。进度只以后端为准，浏览器只保存学生和会话的标识。

## ADDED Requirements

### Requirement: 匿名学生
`POST /api/learners` SHALL 创建一个匿名学生并返回 `201` 与 `learnerId`（UUID）。不需要任何登录信息。

#### Scenario: 创建匿名学生
- **WHEN** 调用 `POST /api/learners`
- **THEN** 返回 `201` 和一个新的 `learnerId`

### Requirement: 开始或继续练习
`POST /api/sessions`（请求体 `{ learnerId }`）SHALL 在该学生已有进行中的会话时返回它（`200`），否则新建一个会话（`201`）。新会话 MUST 按关卡顺序、关内顺序复制题库中全部题目作为快照，顺序号从 1 开始连续编号。两个请求同时为同一学生开始练习时，MUST 返回同一个会话，不报错。学生不存在时 MUST 返回 `404 LEARNER_NOT_FOUND`。

#### Scenario: 新学生开始练习
- **WHEN** 一个没有会话的学生调用 `POST /api/sessions`
- **THEN** 返回 `201` 和会话状态，快照有 12 题，第 1 题是第 1 关第 1 题

#### Scenario: 继续练习
- **WHEN** 该学生再次调用 `POST /api/sessions`
- **THEN** 返回 `200` 和同一个会话，进度不变

#### Scenario: 并发开始
- **WHEN** 同一学生的 5 个 `POST /api/sessions` 同时到达
- **THEN** 全部成功，返回同一个会话 ID；库中该学生只有一个会话

#### Scenario: 再练一次
- **WHEN** 学生的上一个会话已结束，再调用 `POST /api/sessions`
- **THEN** 返回 `201` 和一个新会话；旧会话和它的记录仍然存在

#### Scenario: 学生不存在
- **WHEN** `learnerId` 不存在
- **THEN** 返回 `404 LEARNER_NOT_FOUND`

### Requirement: 会话状态与刷新恢复
`GET /api/sessions/:id` SHALL 返回会话的状态（进行中 / 已结束、是否提前结束）、每个关卡（名称、建筑名、简介、是否点亮、是否解锁、答对数）、每道题的状态、当前题、能否完成、跳过题数和统计（三类题数与两个比率）。这些内容 MUST 与 practice-progress、learning-summary 的规则一致，只由数据库中的记录计算，不依赖任何客户端状态。会话不存在或 ID 格式不对时 MUST 返回 `404 SESSION_NOT_FOUND`。

#### Scenario: 刷新后恢复
- **WHEN** 学生答对第 1 题、答错第 2 题后重新请求会话状态
- **THEN** 第 1 题为 `solved`，第 2 题为 `wrong`，当前题是第 2 题

#### Scenario: ID 格式不对
- **WHEN** 请求 `GET /api/sessions/not-a-uuid`
- **THEN** 返回 `404 SESSION_NOT_FOUND`，不是 `500`

### Requirement: 题目详情不含答案
`GET /api/sessions/:id/questions/:qid` SHALL 返回题干、图形参数、单位、所属关卡、顺序号、是否有视频解析和该题当前状态。响应 MUST NOT 包含答案、常见错误答案和解析内容。题目不在本会话快照中时 MUST 返回 `404 QUESTION_NOT_IN_SESSION`。

#### Scenario: 不泄露答案
- **WHEN** 请求第 4 题详情
- **THEN** 响应中没有答案 `30`、没有常见错误 `60`、没有解析步骤

### Requirement: 结束练习
`POST /api/sessions/:id/complete`（请求体 `{ endedEarly }`）SHALL 把会话置为已结束并记录结束时间。所有题都已答对或跳过时，学生可以直接结束；否则 MUST 在 `endedEarly` 为 `true`（学生已二次确认）时才允许结束，不然返回 `409 NOT_FINISHED`。库中记录的"是否提前结束"MUST 由后端按实际进度判定，不取客户端的值。对已结束的会话再次调用 MUST 返回 `200` 和当前状态，不报错。

#### Scenario: 做完后结束
- **WHEN** 12 题都已答对或跳过，调用结束
- **THEN** 会话变为已结束，`endedEarly` 为 `false`

#### Scenario: 没做完且未确认
- **WHEN** 还有未作答的题，`endedEarly` 为 `false`
- **THEN** 返回 `409 NOT_FINISHED`，会话仍在进行中

#### Scenario: 提前结束
- **WHEN** 还有未作答的题，`endedEarly` 为 `true`
- **THEN** 会话变为已结束，`endedEarly` 为 `true`

#### Scenario: 重复结束
- **WHEN** 对已结束的会话再次调用结束
- **THEN** 返回 `200`，结束时间不变

### Requirement: 学习总结
`GET /api/sessions/:id/summary` SHALL 返回 learning-summary 规定的每题分类、原因、行为事实和指标，并附上每题的题干与知识点，供总结页回看。总结与会话状态接口 MUST 使用同一份计算。会话结束后产生的学习事件 MUST NOT 计入总结。

#### Scenario: 总结与会话状态一致
- **WHEN** 同一时刻分别请求会话状态和总结
- **THEN** 两者的三类题数和两个比率相同

#### Scenario: 总题数包含未作答的题
- **WHEN** 学生只做了 2 题就提前结束
- **THEN** 总结的总题数为 12，未作答的 10 题归为"还没做对"，原因为 `unanswered`

#### Scenario: 结束后的学习事件不计入
- **WHEN** 会话结束后，学生打开某题图文解析并上报事件
- **THEN** 事件写入数据库，但总结中该题的行为事实不变

### Requirement: 统一错误格式
所有拒绝 SHALL 使用 `{ error: { code, message } }` 格式和固定的错误码；请求体格式不对时返回 `400 VALIDATION_ERROR`。`5xx` 不得返回内部细节。

#### Scenario: 请求体缺字段
- **WHEN** `POST /api/sessions` 不带 `learnerId`
- **THEN** 返回 `400`，`error.code` 为 `VALIDATION_ERROR`
