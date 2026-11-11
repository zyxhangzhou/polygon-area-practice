# Spec Delta

## Purpose

规定如何从一次练习的题目快照、作答记录和跳过记录推导每道题的状态、关卡的点亮与解锁、当前该做的题，以及能否完成练习。会话状态接口与总结使用同一套规则。

## ADDED Requirements

### Requirement: 题目状态
每道题的状态 SHALL 只由该题的作答记录和跳过记录决定，先后顺序以写入序号 `seq` 为准；学习事件 MUST NOT 改变题目状态。规则依次为：
1. 有答对的作答 → `solved`；
2. 否则看作答和跳过中 `seq` 最大的一条：是跳过 → `skipped`，是错误作答 → `wrong`；
3. 既没有作答也没有跳过 → `unanswered`。

#### Scenario: 没有任何记录
- **WHEN** 某题没有作答和跳过
- **THEN** 状态为 `unanswered`；即使有打开解析的学习事件，状态仍为 `unanswered`

#### Scenario: 先跳过再答错
- **WHEN** 某题先跳过，之后提交了一次错误答案
- **THEN** 状态为 `wrong`

#### Scenario: 先答错再跳过
- **WHEN** 某题先答错，之后跳过
- **THEN** 状态为 `skipped`

#### Scenario: 跳过后回来答对
- **WHEN** 某题跳过后又答对
- **THEN** 状态为 `solved`

#### Scenario: 以 seq 为准
- **WHEN** 一条跳过记录的 `created_at` 晚于一条错误作答，但 `seq` 更小
- **THEN** 状态为 `wrong`

### Requirement: 关卡点亮与解锁
关卡 SHALL 在本关全部题目为 `solved` 时点亮。第 1 关始终解锁；之后的关卡在它之前每一关的每道题都**曾经**被答对或跳过时解锁。解锁一旦成立 MUST NOT 因为之后的作答而撤回。

#### Scenario: 全部答对才点亮
- **WHEN** 第 1 关两题 `solved`、一题 `skipped`
- **THEN** 第 1 关未点亮，第 2 关已解锁

#### Scenario: 解锁不撤回
- **WHEN** 第 1 关的一道题跳过后又答错（状态变为 `wrong`）
- **THEN** 第 2 关仍然解锁

#### Scenario: 未处理完不解锁
- **WHEN** 第 1 关有一道题仍为 `unanswered`
- **THEN** 第 2 关未解锁

### Requirement: 当前题
系统 SHALL 给出刷新后应回到的当前题：在已解锁的关卡中按快照顺序，取第一道 `unanswered` 或 `wrong` 的题；没有时取第一道 `skipped` 的题；全部 `solved` 时为空。

#### Scenario: 优先未完成的题
- **WHEN** 第 1 题 `skipped`，第 2 题 `solved`，第 3 题 `unanswered`
- **THEN** 当前题是第 3 题

#### Scenario: 只剩跳过的题
- **WHEN** 除第 5 题 `skipped` 外全部 `solved`
- **THEN** 当前题是第 5 题

### Requirement: 能否完成练习
当快照中每道题都是 `solved` 或 `skipped` 时，系统 SHALL 标记"可以完成练习"，并给出 `skipped` 的题数，用于结束前的提醒。是否允许提前结束由接口层决定，不受此标记限制。

#### Scenario: 还有跳过的题
- **WHEN** 10 题 `solved`、2 题 `skipped`
- **THEN** 可以完成练习，跳过题数为 2

#### Scenario: 还有未处理的题
- **WHEN** 有一题 `wrong`
- **THEN** 不能"完成练习"（仍可由接口层提前结束）
