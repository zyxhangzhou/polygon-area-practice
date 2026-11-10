# Spec Delta

## Purpose

定义同一个服务如何同时对外提供前端页面和 API，保证页面刷新、前端路由和错误路径的行为一致且可预期。

## ADDED Requirements

### Requirement: 提供前端页面
在生产模式下，服务 SHALL 在同一端口上提供前端构建产物：请求 `/` MUST 返回前端入口 HTML，请求存在的静态资源 MUST 返回该资源。

#### Scenario: 访问首页
- **WHEN** 生产模式下请求 `GET /`
- **THEN** 返回 HTTP 200，内容类型为 HTML，内容为前端入口页面

### Requirement: 前端路由刷新回退
对非 `/api/` 开头、且不对应任何静态文件的 GET 请求，服务 SHALL 返回前端入口 HTML，使学生在任意前端页面刷新时都能重新加载应用。

#### Scenario: 在前端页面刷新
- **WHEN** 生产模式下请求 `GET /practice/some-session-id`
- **THEN** 返回 HTTP 200，内容为前端入口 HTML

### Requirement: 未知 API 返回 JSON 404
对 `/api/` 开头但不存在的路由，服务 MUST 返回 HTTP 404 和 JSON 错误体（包含 `error` 字段），不得返回前端 HTML。

#### Scenario: 请求不存在的接口
- **WHEN** 请求 `GET /api/not-exist`
- **THEN** 返回 HTTP 404
- **AND** 响应体为 JSON，包含 `error` 字段
