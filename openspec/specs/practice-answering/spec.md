# practice-answering Specification

## Purpose
规定提交作答与跳过的接口行为：后端判题并保存记录，重复提交只记一次并返回首次结果，并发时序号不错乱，已结束的会话和未解锁的关卡拒绝写入。

## Requirements

### Requirement: 提交作答
`POST /api/sessions/:id/attempts`（请求体 `{ questionId, clientAttemptId, answer }`）SHALL 按 answer-grading 判题，保存一条作答记录（原始输入、规范值、是否正确、第几次、匹配到的常见错误），并返回 `201`、判题结果和最新的会话状态。判题结果 MUST 包含：是否正确、第几次作答、该题分类（答对时为一次做对或订正后做对）、匹配到的常见错误提示（如有）、本次作答是否让所在关卡点亮。

#### Scenario: 答对
- **WHEN** 第 1 题第一次就提交正确答案
- **THEN** 返回 `201`，结果为正确、第 1 次、分类为一次做对；会话状态中第 1 题为 `solved`

#### Scenario: 常见错误
- **WHEN** 第 4 题提交 `60`
- **THEN** 结果为错误，带有第 4 题"忘了除以 2"的提示；第 4 题状态为 `wrong`

#### Scenario: 先错后对
- **WHEN** 某题先答错再答对
- **THEN** 第二次结果为正确、第 2 次、分类为订正后做对；首次正确率不计入这道题

#### Scenario: 点亮关卡
- **WHEN** 第 1 关第 3 道题答对，且前两题已答对
- **THEN** 结果标记本次作答点亮了关卡；会话状态中第 1 关为已点亮

### Requirement: 不合法输入不计次
答案不合法时 SHALL 返回 `400 INVALID_ANSWER`，带有 answer-grading 的原因代码和提示，MUST NOT 写入作答记录，MUST NOT 占用作答序号。

#### Scenario: 非法输入后再作答
- **WHEN** 先提交 `abc`，再提交一个错误的数
- **THEN** 第一次返回 `400 INVALID_ANSWER`；第二次的作答序号为 1

### Requirement: 幂等重放
同一会话内重复提交同一个 `clientAttemptId` SHALL 只保存一条记录，并返回 `200`、首次的判题结果（`replayed: true`）和当前的会话状态。同一个 `clientAttemptId` 带着不同的题目或答案时 MUST 返回 `409 IDEMPOTENCY_CONFLICT`。会话结束前已保存的作答，在会话结束后重放 MUST 仍返回首次结果，而不是 `409 SESSION_COMPLETED`。

#### Scenario: 重复提交
- **WHEN** 同一 `clientAttemptId` 提交两次
- **THEN** 库中只有一条记录；第二次返回 `200`、`replayed: true`，结果与第一次相同；统计不变

#### Scenario: 键相同内容不同
- **WHEN** 用同一 `clientAttemptId` 提交了不同的答案
- **THEN** 返回 `409 IDEMPOTENCY_CONFLICT`，不写入

#### Scenario: 结束后重放
- **WHEN** 一次作答已保存但响应丢失，会话随后结束，客户端再重试该作答
- **THEN** 返回首次结果

#### Scenario: 先错后对之后重放第一次
- **WHEN** 第 1 题先答错、再答对，然后客户端重放第一次作答的请求
- **THEN** 返回 `200`、`replayed: true`；`result` 为错误、第 1 次；`session` 中第 1 题为 `solved`；作答记录和统计不变

### Requirement: 并发下的作答序号
同一会话的写入 SHALL 串行执行：作答序号在同一题内从 1 连续递增、不重复，`seq` 的先后与处理顺序一致。

#### Scenario: 并发提交不同答案
- **WHEN** 同一题的 5 个不同 `clientAttemptId` 的错误答案同时提交
- **THEN** 全部成功，作答序号恰好是 1–5

#### Scenario: 并发重复提交
- **WHEN** 同一 `clientAttemptId` 的 5 个请求同时到达
- **THEN** 库中只有一条记录，5 个响应的判题结果相同

### Requirement: 已答对的题
已答对的题再提交作答 SHALL 返回 `200` 和 `alreadySolved: true`，MUST NOT 写入记录、MUST NOT 改变分类和统计。

#### Scenario: 答对后再提交
- **WHEN** 第 1 题已答对，再提交一个错误答案
- **THEN** 返回 `200`、`alreadySolved: true`；作答记录仍只有一条

### Requirement: 跳过
`POST /api/sessions/:id/questions/:qid/skip`（请求体 `{ clientRequestId }`）SHALL 保存一条跳过记录并返回 `201` 和最新的会话状态；同一 `clientRequestId` 重复提交 MUST 只保存一条，返回 `200`。已答对的题跳过时 MUST 返回 `200`、`alreadySolved: true`，不写入。

#### Scenario: 跳过后进入下一关
- **WHEN** 第 1 关答对两题、跳过一题
- **THEN** 第 1 关未点亮，第 2 关已解锁

#### Scenario: 重复跳过请求
- **WHEN** 同一 `clientRequestId` 跳过两次
- **THEN** 只有一条跳过记录

### Requirement: 写入限制
作答和跳过 SHALL 按以下顺序检查，命中即拒绝且不写入：
1. 会话不存在 → `404 SESSION_NOT_FOUND`；
2. 幂等键已存在 → 按"幂等重放"处理；
3. 会话已结束 → `409 SESSION_COMPLETED`；
4. 题目不在快照中 → `404 QUESTION_NOT_IN_SESSION`；
5. 题目所在关卡未解锁 → `409 STAGE_LOCKED`；
6. 已答对 → `200`、`alreadySolved: true`。

#### Scenario: 会话已结束
- **WHEN** 会话结束后提交新的作答或跳过
- **THEN** 返回 `409 SESSION_COMPLETED`，不写入

#### Scenario: 关卡未解锁
- **WHEN** 第 1 关还有未处理的题时，提交第 4 题的作答
- **THEN** 返回 `409 STAGE_LOCKED`，不写入
