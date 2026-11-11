# Spec Delta

## ADDED Requirements

### Requirement: 会话结束序号
会话结束时 SHALL 从作答、跳过、学习事件共用的序列中取一个值，记为结束序号 `completed_seq`。`completed` 的会话 MUST 有结束序号，`in_progress` 的会话 MUST 没有。统计"会话结束前发生的事"时以 `seq < completed_seq` 为准，不以 `created_at` 与结束时间比较。

#### Scenario: 已结束但缺少结束序号
- **WHEN** 写入状态为 `completed`、结束序号为空的会话
- **THEN** 写入因检查约束失败

#### Scenario: 结束后写入的记录
- **WHEN** 会话结束后写入一条学习事件
- **THEN** 该事件的 `seq` 大于会话的结束序号
