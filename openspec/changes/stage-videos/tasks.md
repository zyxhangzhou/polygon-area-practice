# Tasks

## 1. 生成视频

- [x] 1.1 `video/build.py` 新增 `q01()`：按 design D2 的 7 个镜头绘制，数字从题库读取并断言面积等于 40
- [x] 1.2 `video/build.py` 新增 `q07()`：按 design D3 的 8 个镜头绘制，数字从题库读取并断言面积等于 30
- [x] 1.3 生成 `q01`、`q07` 的 mp4、vtt、jpg；安全区检查通过，每段小于 5 MB；逐镜头抽帧检查标注不重叠、不越界、用词与题干一致

## 2. 题库与测试

- [x] 2.1 `questions.ts`：第 1、7 题加上 `videoUrl`
- [x] 2.2 `question-bank.test.ts`：带视频的题至少包含 1、4、7、10，且每关至少一题
- [x] 2.3 `api-explanation.test.ts`、前端测试中"没有视频的题"改用第 2 题；新增第 1 题返回视频地址的断言
- [x] 2.4 `npm test`、lint、format、typecheck、build 全部通过

## 3. 验证与文档

- [x] 3.1 浏览器实跑：第 1 题答错后看视频，第 7 题跳过后看视频；字幕在视频下方，控制条不挡画面；截图存入 `docs/screenshots/l/`
- [x] 3.2 更新 README、`docs/video-assets.md`、`docs/delivery.md`、`docs/verification.md`、`docs/demo-script.md`
