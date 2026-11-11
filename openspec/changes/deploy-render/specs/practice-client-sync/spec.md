# Spec Delta

## MODIFIED Requirements

### Requirement: 错误码处理
前端 SHALL 对后端的错误码做如下处理：
- `SESSION_NOT_FOUND`：清除保存的会话，回到首页；
- `LEARNER_NOT_FOUND`：清除保存的学生和会话，回到首页；
- `SESSION_COMPLETED`：转到总结页；
- `STAGE_LOCKED`、`QUESTION_NOT_IN_SESSION`：重新获取会话状态，转到当前题；
- `NOT_FINISHED`：重新获取会话状态，留在当前页；
- `INVALID_ANSWER`：在输入框旁显示后端的提示；
- `RATE_LIMITED`：请求没有被处理。作答、跳过、结束练习 MUST 保留下来，显示后端的提示和"再提交一次"，重试时沿用同一个幂等键和相同内容（与"结果不确定"的重试相同）；学习事件直接放弃；
- 其他错误码：显示后端的提示。

#### Scenario: 关卡未解锁
- **WHEN** 提交作答，后端返回 `409 STAGE_LOCKED`
- **THEN** 页面重新获取进度，转到当前题

#### Scenario: 提交过于频繁
- **WHEN** 提交作答，后端返回 `429 RATE_LIMITED`
- **THEN** 输入的答案保留，显示后端的提示和"再提交一次"
- **AND** 稍后点"再提交一次"，用同一个幂等键提交，得到判题结果
