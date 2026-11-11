# Spec Delta

## Purpose

定义练习数据（匿名学生、练习会话、题目快照、作答、跳过、学习事件）在存储层的完整性保证。即使应用逻辑出错或并发请求同时到达，数据库也不会出现重复或互相矛盾的记录。

## ADDED Requirements

### Requirement: 每个学生最多一个进行中的练习
数据库 SHALL 保证同一个学生同时最多只有一个状态为 `in_progress` 的练习会话；已完成的会话数量不受限制。

#### Scenario: 第二个进行中的会话被拒绝
- **WHEN** 某学生已有一个 `in_progress` 会话，再为他写入另一个 `in_progress` 会话
- **THEN** 写入因唯一约束失败

#### Scenario: 已完成的会话不占名额
- **WHEN** 某学生已有两个 `completed` 会话，再为他写入一个 `in_progress` 会话
- **THEN** 写入成功

### Requirement: 会话状态一致
会话状态 MUST 只能是 `in_progress` 或 `completed`。`completed` 的会话 MUST 有结束时间，`in_progress` 的会话 MUST 没有结束时间。

#### Scenario: 已完成但缺少结束时间
- **WHEN** 写入状态为 `completed`、结束时间为空的会话
- **THEN** 写入因检查约束失败

### Requirement: 题目快照
每个会话 SHALL 有自己的题目快照，记录本次包含哪些题、顺序和所属关卡。同一会话内题目不重复，顺序号不重复。

#### Scenario: 快照中题目重复
- **WHEN** 向同一会话的快照写入同一道题两次
- **THEN** 第二次写入失败

### Requirement: 记录只能指向快照中的题
作答、跳过、学习事件 MUST 指向本会话快照中存在的题；指向不在快照中的题的写入 MUST 失败。

#### Scenario: 为快照外的题写入作答
- **WHEN** 会话快照只含第 1–3 题，写入一条第 5 题的作答
- **THEN** 写入因外键约束失败

### Requirement: 幂等键在会话内唯一
作答的 `client_attempt_id`、跳过的 `client_request_id`、学习事件的 `client_event_id` SHALL 在同一会话内唯一。重复写入 MUST 被数据库拒绝，或在 `ON CONFLICT DO NOTHING` 下不产生新行；不同会话之间允许相同的键。

#### Scenario: 同一会话重复的作答幂等键
- **WHEN** 在同一会话中用相同 `client_attempt_id` 写入两条作答，第二条使用 `ON CONFLICT DO NOTHING`
- **THEN** 库中只有一条该键的作答

#### Scenario: 不同会话可用相同的键
- **WHEN** 两个不同会话各写入一条 `client_attempt_id` 相同的作答
- **THEN** 两条都写入成功

### Requirement: 尝试序号唯一
同一会话同一题的作答序号（`attempt_no`）SHALL 唯一，防止并发写入产生两个"第 1 次"。

#### Scenario: 序号重复
- **WHEN** 同一会话同一题写入两条 `attempt_no = 1` 的作答
- **THEN** 第二条写入失败

### Requirement: 学习事件类型合法
学习事件类型 MUST 是 `explanation_text_opened`、`video_started`、`video_completed` 之一。

#### Scenario: 未知事件类型
- **WHEN** 写入类型为 `explanation_viewed` 的学习事件
- **THEN** 写入因检查约束失败
