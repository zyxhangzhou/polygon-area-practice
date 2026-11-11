# Spec Delta

## ADDED Requirements

### Requirement: 学生的练习记录
`GET /api/learners/:id/sessions` SHALL 返回这个学生最近的练习（最多 20 次，开始时间最近的在前）。每次包括：会话 ID、状态、是否提前结束、开始与结束时间、三类题数和两个比率。数字 MUST 与该会话的学习总结一致。学生不存在或 ID 格式不对时 MUST 返回 `404 LEARNER_NOT_FOUND`。学生 ID 与会话 ID 一样是访问凭证。

#### Scenario: 再练一次之后
- **WHEN** 学生结束一次练习后又开始了一次
- **THEN** 返回两次练习，进行中的在前；已结束那次的数字与它的总结接口一致

#### Scenario: 只看自己的
- **WHEN** 另一个学生也有练习
- **THEN** 返回结果中没有另一个学生的练习

#### Scenario: 超过 20 次
- **WHEN** 学生有 25 次练习
- **THEN** 只返回最近的 20 次
