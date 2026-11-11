# explanation-access Specification

## Purpose
规定解析内容什么时候可以获取，以及学习行为（打开图文解析、播放视频、看完视频）如何上报。获取内容和记录行为分开：获取不代表看过，行为由前端在真实发生时上报。

## Requirements

### Requirement: 解析的访问规则
`GET /api/sessions/:id/questions/:qid/explanation` SHALL 在该题状态为 `wrong`、`skipped` 或 `solved`，或会话已结束时返回解析：分步讲解、易错提醒、视频地址（没有视频时为空）。其他情况 MUST 返回 `403 EXPLANATION_LOCKED`。获取解析 MUST NOT 产生任何学习记录。

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
- **THEN** 响应中有视频地址；第 1 题的视频地址为空

### Requirement: 学习行为上报
`POST /api/sessions/:id/events`（请求体 `{ questionId, type, clientEventId, payload? }`）SHALL 保存一条学习事件并返回 `201`；同一 `clientEventId` 重复上报 MUST 只保存一条，返回 `200`。事件类型 MUST 是 `explanation_text_opened`、`video_started`、`video_completed` 之一，否则返回 `400 VALIDATION_ERROR`。只有该题的解析可以获取时才接受上报，否则返回 `403 EXPLANATION_LOCKED`。`payload` 可选，MUST 是不超过 1 KB 的 JSON 对象。

#### Scenario: 先看解析再答对
- **WHEN** 学生答错第 1 题后上报 `explanation_text_opened`，然后答对
- **THEN** 总结中第 1 题为订正后做对，行为事实为打开过图文解析、发生在答对之前

#### Scenario: 跳过后看解析再第一次答对
- **WHEN** 学生跳过第 2 题，上报 `explanation_text_opened`，回来第一次就答对
- **THEN** 第 2 题归为订正后做对

#### Scenario: 重复上报
- **WHEN** 同一 `clientEventId` 上报两次
- **THEN** 只有一条事件记录

#### Scenario: 会话结束后上报
- **WHEN** 会话结束后上报事件
- **THEN** 返回 `201` 并保存，但不计入总结（见 practice-sessions）

#### Scenario: 解析不可获取时上报
- **WHEN** 第 1 题未作答时上报 `explanation_text_opened`
- **THEN** 返回 `403 EXPLANATION_LOCKED`，不写入
