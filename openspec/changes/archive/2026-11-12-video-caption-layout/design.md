# Design

## Context

- `VideoPanel` 使用 `<video controls>` 和 `<track kind="captions" default>`。浏览器把字幕叠加在画面底部；控制条出现时，字幕还会被推得更高。
- 两段视频的画面（1280×720）中，白色内容卡片延伸到 y = 680，图形底边在 y = 600 附近，标注在 y ≈ 634，右侧的提醒框到 y = 640。
- jsdom 不实现 `TextTrack` API，测试无法依赖 `video.textTracks`。

## Decisions

### D1 页面字幕：自己解析 VTT

- `VideoPanel` 读取 `/videos/qNN.vtt`，用一个小函数 `parseVtt()` 解析为 `{ start, end, text }[]`。只需支持本项目生成的格式：序号行、时间行、文字。
- 监听 `timeupdate` 和 `seeked`，按 `currentTime` 找到当前这句，显示在视频下方的 `<p className="video-caption" aria-live="off">` 中。不用 `aria-live`，避免读屏软件和旁白抢话。
- `<track>` 保留但去掉 `default`，平时不显示浏览器字幕；`fullscreenchange` 时，如果全屏的是这个视频，就把它的 `textTracks[0].mode` 设为 `showing`，退出全屏时设回 `hidden`。没有 `textTracks` API 的环境里跳过这一步。
- 字幕读取失败时不显示字幕行，视频照常播放。

**备选**：只用 CSS `::cue` 调整位置。不选：浏览器对字幕位置的控制有限，而且控制条出现时仍会把字幕推高。

### D2 视频画面的安全区

- 安全区为底部 120 px（1/6 高度）。白色内容卡片的下沿从 y = 680 改为 y = 590，所有内容都在 y ≤ 580 以内。
- **第 4 题**：比例从 40 改为 34 px/cm，底边从 y = 600 上移到 y = 520；右侧的算式与提醒整体上移、间距收紧。
- **第 10 题**：比例从 30 改为 25 px/cm，底边上移到 y = 525；三行算式与两条提醒同样上移。
- **检查**：`build.py` 生成后，取最后一帧（内容最多的一帧），断言 y ≥ 600 的区域只有底色，与底色的差不超过 8。

### D3 测试

- `parseVtt` 的单元测试：正常文件、带序号、空行与 Windows 换行。
- `VideoPanel` 的组件测试：
  - 模拟 VTT 请求，设置 `currentTime` 并触发 `timeupdate`，视频下方显示对应的句子；
  - `<track>` 没有 `default`；
  - 字幕读取失败时不显示字幕行，视频仍在。
- 浏览器实跑：播放与暂停时截图，确认没有遮挡；进入和退出全屏，确认字幕的切换。
