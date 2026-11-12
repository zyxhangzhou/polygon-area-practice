# Proposal

## Why

用户反馈：浏览器标签页上网站的图标是空白的。现在 `web/index.html` 没有声明图标，浏览器默认请求 `/favicon.ico` 时，线上返回 404（`text/plain`）。标签页、书签和手机桌面快捷方式都只显示默认图标，和页面左上角的"图形小镇"标志对不上。

## What Changes

- **新增网站图标**：用页面左上角的标志（陶土色平行四边形加蓝灰色三角形屋顶）做图标，放在米色圆角方块上。浅色和深色的标签栏上都能看清。
- 提供 3 个文件，放在 `web/public/`，构建时原样复制到站点根目录：
  - `favicon.svg`：现代浏览器使用，任意尺寸都清晰；
  - `favicon.ico`（16、32、48 三个尺寸）：旧浏览器和直接请求 `/favicon.ico` 时使用；
  - `apple-touch-icon.png`（180×180，不带圆角和透明，由系统裁圆角）：iOS 添加到主屏幕时使用。
- `web/index.html` 声明这 3 个图标，另加 `theme-color`（米色 `#f7f2e9`），让手机浏览器的地址栏与页面背景一致。
- 新增生成脚本 `scripts/build_icons.py`（Pillow），图形坐标只写一处，3 个文件由它生成，以后改图标只改一处。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities
- `app-hosting`：新增"网站图标"要求：入口页面声明图标；`/favicon.ico`、`/favicon.svg`、`/apple-touch-icon.png` 返回对应的图片。

## Impact

- 新增：`web/public/favicon.svg`、`favicon.ico`、`apple-touch-icon.png`；`scripts/build_icons.py`。
- 修改：`web/index.html`；测试：托管测试（图标的类型）、入口页面声明图标的检查。
- 服务端代码不变：`@fastify/static` 已经托管 `web/dist` 下的所有文件。
- 接口、数据库、统计都不受影响。
