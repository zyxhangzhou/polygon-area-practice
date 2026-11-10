# Spec Delta

## Purpose

定义服务在启动、健康检查和请求追踪方面的可观测行为，让部署者能快速判断服务与数据库是否正常，并能按请求定位日志。

## ADDED Requirements

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

### Requirement: 请求追踪 ID
服务 SHALL 为每个 API 请求分配请求 ID，并通过响应头 `x-request-id` 返回；该请求产生的日志 MUST 带有同一 ID。请求自带 `x-request-id` 头时，服务 MUST 沿用该值。

#### Scenario: 服务生成请求 ID
- **WHEN** 请求 `GET /api/health` 且未携带 `x-request-id`
- **THEN** 响应头包含非空的 `x-request-id`

#### Scenario: 沿用调用方的请求 ID
- **WHEN** 请求 `GET /api/health` 并携带 `x-request-id: test-123`
- **THEN** 响应头 `x-request-id` 为 `test-123`
