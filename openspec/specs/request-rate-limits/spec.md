# request-rate-limits Specification

## Purpose
规定服务对公网开放后，如何限制单个客户端的请求频率：限多少、怎样识别客户端、超出时怎样响应、哪些请求不受限制。目的是防止脚本刷接口拖垮免费实例，同时不影响学生正常练习。

## Requirements

### Requirement: API 请求频率上限
服务 SHALL 对 `/api/` 下的请求按客户端 IP 计数：每个 IP 每分钟最多 300 次。`GET /api/health` 和非 `/api/` 的请求（页面与静态资源）MUST NOT 计入，也不受限制。正常完成一次 12 题练习所需的请求数远低于这个上限。

#### Scenario: 正常练习不受影响
- **WHEN** 同一个 IP 在一分钟内发出 300 次 API 请求
- **THEN** 这些请求都正常处理

#### Scenario: 超过上限
- **WHEN** 同一个 IP 在一分钟内发出第 301 次 API 请求
- **THEN** 返回 HTTP 429

#### Scenario: 健康检查不受限制
- **WHEN** 某个 IP 的 API 请求已超出上限，再请求 `GET /api/health`
- **THEN** 健康检查照常返回结果，不返回 429

#### Scenario: 不同 IP 分别计数
- **WHEN** 一个 IP 已超出上限
- **THEN** 另一个 IP 的请求照常处理

### Requirement: 创建学生的上限
`POST /api/learners` SHALL 另有更严格的上限：每个 IP 每小时最多 60 次，以防止脚本批量创建匿名学生。同一教室共用一个出口 IP 时，60 次足够一个班级各自开始练习。

#### Scenario: 批量创建学生
- **WHEN** 同一个 IP 在一小时内第 61 次创建学生
- **THEN** 返回 HTTP 429，不创建学生

### Requirement: 超限响应
超出上限时，服务 SHALL 返回 HTTP 429，响应体使用统一的错误格式 `{"error":{"code":"RATE_LIMITED","message":"..."}}`，并带 `Retry-After` 头，说明多少秒后可以重试。message MUST 是面向学生的中文提示。被限制的请求 MUST NOT 被处理，例如作答不会被记录。

#### Scenario: 被限制的作答
- **WHEN** 已超出上限的 IP 提交作答
- **THEN** 返回 `429 RATE_LIMITED` 和 `Retry-After`
- **AND** 这次作答没有写入数据库

### Requirement: 识别客户端 IP
服务部署在反向代理后面时，SHALL 只信任配置的代理层数，从 `X-Forwarded-For` 中取得客户端 IP。没有配置时 MUST 使用 TCP 连接的对端地址，忽略 `X-Forwarded-For`。客户端 MUST NOT 能通过自己添加的 `X-Forwarded-For` 换一个 IP 来绕过限制。

#### Scenario: 未配置代理
- **WHEN** 没有配置代理层数，客户端每次请求都带不同的 `X-Forwarded-For`
- **THEN** 这些请求仍按同一个连接地址计数

#### Scenario: 配置了一层代理
- **WHEN** 代理层数配置为 1，请求的 `X-Forwarded-For` 为 `伪造地址, 真实客户端地址`
- **THEN** 按真实客户端地址计数
