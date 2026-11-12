# Tasks

## 1. 页面字幕

- [x] 1.1 `parseVtt()` 与 `VideoPanel` 的视频下方字幕、全屏切换（D1）；验证：单元测试与组件测试覆盖 D3 列出的场景；原有的视频测试全部通过

## 2. 视频重新排版

- [x] 2.1 `build.py` 两段视频的版式上移，并增加安全区检查（D2）；验证：重新生成两段视频，安全区检查通过，抽帧人工检查
- [x] 2.2 更新 `docs/video-assets.md` 中的说明

## 3. 验证

- [x] 3.1 浏览器实跑：第 4 题第 13 秒附近播放与暂停时截图，没有遮挡；全屏时显示浏览器字幕，退出后恢复；记入 `docs/verification.md`
- [x] 3.2 `npm run lint`、`format:check`、`typecheck`、`build`、`test` 全部通过，推送后 CI 两个 job 通过

## Workflow follow-up

- 开 PR 合并 `change/video-caption-layout` 到 `main`（squash），在计划中将 K 打勾；合并后线上确认新视频与字幕。
- 合并后执行 `openspec archive video-caption-layout`。
