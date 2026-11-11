# service-operations Specification

## Purpose
定义服务在启动、健康检查和请求追踪方面的可观测行为，让部署者能快速判断服务与数据库是否正常，并能按请求定位日志。

## Requirements

### Requirement: 启动配置校验
服务 SHALL 在启动时校验必需的环境变量（至少包括数据库连接串）。配置缺失或格式不合法时，服务 MUST 以非零退出码退出，并输出指明具体缺失或错误配置项的信息，不得带着错误配置继续运行。

#### Scenario: 缺少数据库连接串
- **WHEN** 未设置 `DATABASE_URL` 就启动服务
- **THEN** 进程以非零退出码退出
- **AND** 输出中包含 `DATABASE_URL`

#### Scenario: 端口配置不合法
- **WHEN** `PORT` 设置为非数字（如 `abc`）后启动服务
- **THEN** 进程以非零退出码退出
- **AND** 输出中包含 `PORT`

### Requirement: 健康检查反映数据库连通性
服务 SHALL 提供 `GET /api/health`。数据库可达时 MUST 返回 HTTP 200，响应体包含 `status: "ok"` 与 `db: "ok"`；数据库不可达时 MUST 返回 HTTP 503，响应体包含 `status: "error"` 与 `db: "unreachable"`。健康检查 MUST 在有限时间（不超过 3 秒）内返回，不得因数据库无响应而挂起。

#### Scenario: 数据库正常
- **WHEN** 数据库可达时请求 `GET /api/health`
- **THEN** 返回 HTTP 200
- **AND** 响应体为 `{"status":"ok","db":"ok"}`

#### Scenario: 数据库不可达
- **WHEN** 数据库不可达时请求 `GET /api/health`
- **THEN** 在 3 秒内返回 HTTP 503
- **AND** 响应体包含 `"status":"error"` 与 `"db":"unreachable"`

#### Scenario: 数据库能建立连接但不响应
- **WHEN** 数据库地址能建立 TCP 连接，但之后不返回任何数据，此时请求 `GET /api/health`
- **THEN** 在 3 秒内返回 HTTP 503

#### Scenario: 数据库短暂卡住后恢复
- **WHEN** 数据库在有请求进行时停止响应，导致健康检查返回 503，之后数据库恢复
- **THEN** 后续的 `GET /api/health` 在数秒内恢复为 HTTP 200，无需重启服务

### Requirement: 请求追踪 ID
服务 SHALL 为每个 API 请求分配请求 ID，并通过响应头 `x-request-id` 返回；该请求产生的日志 MUST 带有同一 ID。请求自带格式合法的 `x-request-id` 头（1–64 个字母、数字、`.`、`_`、`-`）时，服务 MUST 沿用该值；格式不合法时 MUST 忽略它并生成新 ID。

#### Scenario: 服务生成请求 ID
- **WHEN** 请求 `GET /api/health` 且未携带 `x-request-id`
- **THEN** 响应头包含非空的 `x-request-id`

#### Scenario: 沿用调用方的请求 ID
- **WHEN** 请求 `GET /api/health` 并携带 `x-request-id: test-123`
- **THEN** 响应头 `x-request-id` 为 `test-123`

#### Scenario: 日志带同一请求 ID
- **WHEN** 请求 `GET /api/health`
- **THEN** 该请求产生的日志中的 `reqId` 与响应头 `x-request-id` 相同

#### Scenario: 不合法的请求 ID 被替换
- **WHEN** 请求携带长度超过 64 或含其他字符的 `x-request-id`
- **THEN** 响应头 `x-request-id` 是服务新生成的 ID，不是传入的值

### Requirement: 统一错误响应格式
`/api/` 下的所有错误响应 SHALL 使用同一格式 `{"error":{"code":"...","message":"..."}}`，包括框架自身产生的错误（如请求体解析失败）。HTTP 5xx 错误 MUST NOT 在响应中暴露内部错误信息，只返回通用提示；完整错误 MUST 记录在日志中。

#### Scenario: 请求体 JSON 格式错误
- **WHEN** 向接受 JSON 的接口发送 `Content-Type: application/json` 且内容不是合法 JSON 的请求
- **THEN** 返回 HTTP 400
- **AND** 响应体形如 `{"error":{"code":"BAD_REQUEST","message":"..."}}`

#### Scenario: 服务器内部错误不泄露细节
- **WHEN** 处理请求时抛出未预期的异常（错误信息为 `secret internal detail`）
- **THEN** 返回 HTTP 500
- **AND** 响应体为 `{"error":{"code":"INTERNAL_ERROR","message":"服务器内部错误"}}`，不包含 `secret internal detail`
- **AND** 日志中记录了该异常及请求 ID
