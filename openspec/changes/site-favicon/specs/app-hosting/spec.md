## ADDED Requirements

### Requirement: 网站图标

站点 SHALL 提供与页面标志一致的网站图标：入口页面 SHALL 声明 SVG 图标、ICO 图标和 Apple 触摸图标；`/favicon.svg`、`/favicon.ico`、`/apple-touch-icon.png` SHALL 返回对应的图片，不得返回 404 或入口 HTML。

#### Scenario: 浏览器读取入口页面中的图标

- **WHEN** 浏览器打开任何前端页面
- **THEN** 入口 HTML 中有 `rel="icon"` 指向 `/favicon.svg`（`image/svg+xml`）和 `/favicon.ico`，以及 `rel="apple-touch-icon"` 指向 `/apple-touch-icon.png`

#### Scenario: 直接请求 favicon.ico

- **WHEN** 客户端请求 `GET /favicon.ico`
- **THEN** 返回 200，内容类型是 ICO 图片，内容包含 16、32、48 像素三个尺寸

#### Scenario: 请求 SVG 图标和 Apple 触摸图标

- **WHEN** 客户端请求 `GET /favicon.svg` 或 `GET /apple-touch-icon.png`
- **THEN** 分别返回 200 和 `image/svg+xml`、`image/png`
