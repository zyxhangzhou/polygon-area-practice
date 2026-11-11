# app-hosting Specification

## Purpose
定义同一个服务如何同时对外提供前端页面和 API，保证页面刷新、前端路由和错误路径的行为一致且可预期，缺失的资源能被如实报告。

## Requirements

### Requirement: 提供前端页面
在生产模式下，服务 SHALL 在同一端口上提供前端构建产物：请求 `/` MUST 返回前端入口 HTML，请求存在的静态资源（脚本、样式、图片、视频等）MUST 返回该资源本身。

#### Scenario: 访问首页
- **WHEN** 生产模式下请求 `GET /`
- **THEN** 返回 HTTP 200，内容类型为 HTML，内容为前端入口页面

#### Scenario: 访问存在的静态资源
- **WHEN** 生产模式下请求构建产物中存在的脚本文件
- **THEN** 返回 HTTP 200 和该文件内容，内容类型为 JavaScript

### Requirement: 前端路由刷新回退
只有"页面导航"请求 SHALL 回退到前端入口 HTML：GET 请求，路径不以 `/api/` 开头，路径最后一段不含文件扩展名，且 `Accept` 头包含 `text/html`。这样学生在任意前端页面刷新都能重新加载应用。

#### Scenario: 在前端页面刷新
- **WHEN** 生产模式下以 `Accept: text/html` 请求 `GET /practice/some-session-id`
- **THEN** 返回 HTTP 200，内容为前端入口 HTML

### Requirement: 缺失的静态资源返回 404
路径最后一段带文件扩展名、但不存在的请求（如丢失的脚本、图片、视频），服务 MUST 返回 HTTP 404，不得回退为前端入口 HTML，以免缺失资源被掩盖成 200。

#### Scenario: 请求不存在的脚本
- **WHEN** 生产模式下请求 `GET /assets/missing.js`
- **THEN** 返回 HTTP 404，响应体不是前端入口 HTML

#### Scenario: 请求不存在的视频
- **WHEN** 生产模式下以 `Accept: text/html` 请求 `GET /videos/missing.mp4`
- **THEN** 返回 HTTP 404，响应体不是前端入口 HTML

### Requirement: 未知 API 返回 JSON 404
对 `/api/` 开头但不存在的路由，服务 MUST 返回 HTTP 404 和 JSON 错误体（包含 `error` 字段），不得返回前端 HTML。

#### Scenario: 请求不存在的接口
- **WHEN** 以 `Accept: text/html` 请求 `GET /api/not-exist`
- **THEN** 返回 HTTP 404
- **AND** 响应体为 JSON，包含 `error` 字段
