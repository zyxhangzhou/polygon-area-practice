## MODIFIED Requirements

### Requirement: 解析的访问规则
`GET /api/sessions/:id/questions/:qid/explanation` SHALL 在该题状态为 `wrong`、`skipped` 或 `solved`，或会话已结束时返回解析：分步讲解、易错提醒、视频地址（没有视频时为空）。分步讲解和易错提醒的文字 MAY 包含重点标记（格式见 `question-bank` 的"解析中的重点标记"），由前端负责显示。其他情况 MUST 返回 `403 EXPLANATION_LOCKED`。获取解析 MUST NOT 产生任何学习记录。

#### Scenario: 未作答时被拒绝
- **WHEN** 第 1 题还没有作答和跳过，请求它的解析
- **THEN** 返回 `403 EXPLANATION_LOCKED`

#### Scenario: 答错或跳过后可获取
- **WHEN** 第 1 题答错后、第 2 题跳过后分别请求解析
- **THEN** 都返回解析内容

#### Scenario: 会话结束后可回看
- **WHEN** 会话已结束，请求一道未作答题的解析
- **THEN** 返回解析内容

#### Scenario: 获取不算看过
- **WHEN** 学生答错后获取了解析，但没有上报事件，然后答对
- **THEN** 该题仍按"先错后对"归为订正后做对，行为事实中没有打开图文解析

#### Scenario: 视频地址
- **WHEN** 获取第 4 题的解析
- **THEN** 响应中有视频地址；第 2 题（没有视频）的视频地址为空

#### Scenario: 带重点标记的文字
- **WHEN** 获取第 4 题的解析
- **THEN** 分步讲解中含有 `{c:底是 10 cm}` 这样的重点标记
