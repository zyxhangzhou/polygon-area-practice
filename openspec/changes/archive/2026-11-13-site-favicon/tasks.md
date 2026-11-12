# Tasks

## 1. 图标

- [x] 1.1 `scripts/build_icons.py`：按 design D1、D2 生成 `web/public/favicon.svg`、`favicon.ico`（16/32/48）、`apple-touch-icon.png`（180）
- [x] 1.2 `web/index.html`：声明 3 个图标和 `theme-color`

## 2. 测试

- [x] 2.1 托管测试：`/favicon.ico`、`/favicon.svg`、`/apple-touch-icon.png` 返回 200 和正确的类型，不回退为 HTML
- [x] 2.2 静态检查：`web/index.html` 声明了 3 个图标，且 `web/public/` 中有对应文件；ICO 包含 16、32、48 三个尺寸

## 3. 验证与文档

- [x] 3.1 `npm test`、lint、format、typecheck、build 全部通过
- [x] 3.2 浏览器实跑：标签页显示图标（浅色与深色主题），截图存入 `docs/screenshots/n/`
- [x] 3.3 更新 `docs/verification.md`、`docs/ai-log-notes.md`、`docs/delivery.md`；在 README 中说明图标的生成方式
