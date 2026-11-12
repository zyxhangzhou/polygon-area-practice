"""生成第 4、10 题的视频讲解（video-explanations，design D1、D2）。

用法：
    python video/build.py            # 两段都生成
    python video/build.py q04        # 只生成一段

步骤：逐句 TTS（edge-tts，晓晓）→ 读出每句时长 → Pillow 逐帧绘制（2 倍尺寸后缩小，抗锯齿）
→ ffmpeg 合成 H.264 + AAC → 写 WebVTT 字幕和封面。输出到 web/public/videos/。
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "web" / "public" / "videos"
QUESTIONS_TS = ROOT / "server" / "src" / "content" / "questions.ts"

W, H, FPS, SS = 1280, 720, 30, 2  # 输出尺寸、帧率、超采样倍数
VOICE, RATE = "zh-CN-XiaoxiaoNeural", "-5%"
PAUSE = 0.6  # 每句旁白后的停顿（秒）
MAX_BYTES = 5 * 1024 * 1024
SAFE_TOP = 600  # 底部安全区（y ≥ 600，1/6 高度）只留底色，给播放控制条和全屏字幕

# 图形小镇的色板
PAPER = (247, 242, 233)
CARD = (255, 253, 248)
INK = (38, 48, 58)
INK2 = (74, 85, 97)
MUTED = (107, 116, 128)
MIST = (63, 97, 117)
MIST_SOFT = (231, 238, 241)
CLAY = (198, 107, 67)
CLAY_TEXT = (168, 85, 50)
CLAY_SOFT = (243, 227, 217)
GOLD = (240, 179, 63)
GOLD_LINE = (217, 154, 34)
GOLD_SOFT = (250, 236, 205)
LINE = (230, 220, 206)

FONT_SANS = CACHE / "NotoSansCJKsc-Regular.otf"
FONT_SANS_BOLD = CACHE / "NotoSansCJKsc-Bold.otf"
FONT_SERIF = CACHE / "NotoSerifCJKsc-Bold.otf"

Pt = tuple[float, float]


# ---------------------------------------------------------------- 绘图工具


def ease(p: float) -> float:
    """缓入缓出"""
    p = max(0.0, min(1.0, p))
    return 4 * p**3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def phase(p: float, start: float, end: float) -> float:
    """把本分镜的进度 p 映射到 [start, end] 区间内的 0–1"""
    if end <= start:
        return 1.0 if p >= end else 0.0
    return ease((p - start) / (end - start))


def mix(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def lerp(a: Pt, b: Pt, t: float) -> Pt:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def rotate(pt: Pt, c: Pt, deg: float) -> Pt:
    r = math.radians(deg)
    x, y = pt[0] - c[0], pt[1] - c[1]
    return (c[0] + x * math.cos(r) - y * math.sin(r), c[1] + x * math.sin(r) + y * math.cos(r))


_fonts: dict[tuple[Path, int], ImageFont.FreeTypeFont] = {}


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    key = (path, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(str(path), size * SS)
    return _fonts[key]


class Canvas:
    """逻辑坐标 1280×720；内部按 SS 倍绘制。透明度通过与底色混合实现"""

    def __init__(self) -> None:
        self.img = Image.new("RGB", (W * SS, H * SS), PAPER)
        self.d = ImageDraw.Draw(self.img)

    def _p(self, pts: list[Pt]) -> list[tuple[float, float]]:
        return [(x * SS, y * SS) for x, y in pts]

    def polygon(self, pts, fill=None, outline=None, width=3):
        self.d.polygon(self._p(pts), fill=fill)
        if outline:
            self.d.line(self._p(pts + [pts[0]]), fill=outline, width=width * SS, joint="curve")

    def stroke_path(self, pts: list[Pt], color, width=3, progress=1.0, closed=True):
        """按长度画出路径的前 progress 部分（描边动画）"""
        seq = pts + ([pts[0]] if closed else [])
        lengths = [math.dist(a, b) for a, b in zip(seq, seq[1:])]
        remain = sum(lengths) * progress
        out = [seq[0]]
        for (a, b), seg in zip(zip(seq, seq[1:]), lengths):
            if remain <= 0:
                break
            t = min(1.0, remain / seg) if seg else 1.0
            out.append(lerp(a, b, t))
            remain -= seg
        if len(out) > 1:
            self.d.line(self._p(out), fill=color, width=width * SS, joint="curve")

    def dashed(self, a: Pt, b: Pt, color, width=2, dash=10, gap=8, progress=1.0):
        total = math.dist(a, b) * progress
        pos = 0.0
        while pos < total:
            s = lerp(a, b, pos / math.dist(a, b))
            e = lerp(a, b, min(pos + dash, total) / math.dist(a, b))
            self.d.line(self._p([s, e]), fill=color, width=width * SS)
            pos += dash + gap

    def text(self, xy: Pt, s: str, size=28, color=INK, path=FONT_SANS, anchor="la"):
        self.d.text((xy[0] * SS, xy[1] * SS), s, font=font(path, size), fill=color, anchor=anchor)

    def round_rect(self, box, fill, radius=20, outline=None, width=2):
        x0, y0, x1, y1 = box
        self.d.rounded_rectangle(
            (x0 * SS, y0 * SS, x1 * SS, y1 * SS),
            radius=radius * SS,
            fill=fill,
            outline=outline,
            width=width * SS if outline else 0,
        )

    def right_angle(self, corner: Pt, m: float, dx: int, dy: int, color, width=2):
        x, y = corner
        self.d.line(
            self._p([(x + dx * m, y), (x + dx * m, y + dy * m), (x, y + dy * m)]),
            fill=color,
            width=width * SS,
        )

    def frame(self) -> bytes:
        return self.img.resize((W, H), Image.LANCZOS).tobytes()


# ---------------------------------------------------------------- 视频结构


@dataclass
class Shot:
    """一个分镜：一句旁白 + 绘制函数 draw(canvas, p)，p 为本分镜进度 0–1。
    draw 必须画出完整画面（包括之前分镜留下的内容），不依赖前面的分镜"""

    say: str
    draw: Callable[[Canvas, float], None]


@dataclass
class Video:
    key: str
    title: str
    subtitle: str
    shots: list[Shot]
    background: Callable[[Canvas], None]
    poster_shot: int = 0  # 封面取这个分镜结束时的画面（不出现答案）


def frame_chrome(c: Canvas, title: str, subtitle: str) -> None:
    """每一帧都有的标题、卡片和右下角标志"""
    c.text((64, 52), title, size=34, path=FONT_SERIF)
    c.text((64, 102), subtitle, size=20, color=MUTED)
    c.round_rect((48, 150, 1232, 590), CARD, radius=28)
    # 右上角的小镇标志：平行四边形 + 三角形
    c.polygon([(1150, 82), (1166, 52), (1210, 52), (1194, 82)], fill=CLAY)
    c.polygon([(1166, 52), (1173, 40), (1180, 52)], fill=MIST)
    c.text((1140, 70), "图形小镇", size=18, color=INK2, anchor="rm")


def formula_line(c: Canvas, y: float, label: str, expr: str, t: float, color=INK) -> None:
    """右侧算式：淡入 + 轻微上移"""
    if t <= 0:
        return
    dy = (1 - t) * 14
    c.text((720, y + dy), label, size=22, color=mix(CARD, MUTED, t))
    c.text((720, y + 34 + dy), expr, size=34, color=mix(CARD, color, t), path=FONT_SANS_BOLD)


def callout(c: Canvas, box, text: str, t: float, fill, color) -> None:
    if t <= 0:
        return
    c.round_rect(box, mix(CARD, fill, t), radius=18)
    c.text((box[0] + 24, (box[1] + box[3]) / 2), text, size=24, color=mix(fill, color, t), anchor="lm")


# ---------------------------------------------------------------- 第 4 题：三角形


def q04(params: dict) -> tuple[Video, float]:
    base, height = params["base"], params["height"]
    para = base * height
    area = para / 2
    # 复制出的三角形绕斜边中点旋转半圈：顶点扫过的范围约为 oy - 10.4s 到 oy + 1.4s，要在卡片内、安全区上方
    s = 34  # 每厘米的像素
    ox, oy = 110, 490  # 底边左端
    apex_x = ox + base * s * 0.35
    A, B, C = (apex_x, oy - height * s), (ox + base * s, oy), (ox, oy)
    M = lerp(A, B, 0.5)
    tri = [A, B, C]

    def n(x: float) -> str:
        return f"{x:g}"

    def triangle(c: Canvas, p: float):
        c.polygon(tri, fill=mix(CARD, MIST_SOFT, phase(p, 0.3, 0.7)))
        c.stroke_path(tri, MIST, width=3, progress=phase(p, 0, 0.5))

    def labels(c: Canvas, t: float = 1.0):
        """底、高的标注最后画，不被填充盖住"""
        if t <= 0:
            return
        c.dashed(A, (A[0], oy), mix(CARD, CLAY, t), width=2)
        c.right_angle((A[0], oy), 14, 1, -1, mix(CARD, CLAY, t))
        c.text(((ox + B[0]) / 2, oy + 34), f"底 {n(base)} cm", size=26, color=mix(CARD, INK, t), anchor="mm")
        c.text((A[0] + 12, (A[1] + oy) / 2 + 20), f"高 {n(height)} cm", size=26, color=mix(CARD, CLAY_TEXT, t), anchor="lm")

    def copy_points(deg: float) -> list[Pt]:
        return [rotate(pt, M, deg) for pt in tri]

    def copy(c: Canvas, deg: float, alpha: float, fade_to: float = 1.0):
        pts = copy_points(deg)
        fill = mix(CARD, GOLD_SOFT, alpha * fade_to)
        c.polygon(pts, fill=fill, outline=mix(CARD, GOLD_LINE, alpha * fade_to), width=3)

    def redraw_original(c: Canvas):
        c.polygon(tri, outline=MIST, width=3)

    shots = [
        Shot(
            f"这是营地里的一顶帐篷，正面是一个三角形。底是{n(base)}厘米，高是{n(height)}厘米。",
            lambda c, p: (triangle(c, p), labels(c, phase(p, 0.45, 0.8))),
        ),
        Shot(
            "三角形的面积怎么算呢？我们先复制一个完全一样的三角形。",
            lambda c, p: (triangle(c, 1), copy(c, 0, phase(p, 0.3, 0.8)), redraw_original(c), labels(c)),
        ),
        Shot(
            "把它旋转半圈，拼到旁边，就拼成了一个平行四边形。",
            lambda c, p: (triangle(c, 1), copy(c, 180 * phase(p, 0.1, 0.85), 1), redraw_original(c), labels(c)),
        ),
        Shot(
            f"平行四边形的面积是底乘高，{n(base)}乘{n(height)}，等于{n(para)}平方厘米。",
            lambda c, p: (
                triangle(c, 1),
                copy(c, 180, 1),
                redraw_original(c),
                labels(c),
                formula_line(c, 180, "平行四边形的面积 = 底 × 高", f"{n(base)} × {n(height)} = {n(para)} cm²", phase(p, 0.1, 0.5)),
            ),
        ),
        Shot(
            f"可是我们要的只是其中一个三角形，它正好是平行四边形的一半。所以{n(para)}除以2，等于{n(area)}平方厘米。",
            lambda c, p: (
                triangle(c, 1),
                copy(c, 180, 1, fade_to=1 - 0.75 * phase(p, 0.1, 0.4)),
                c.polygon(tri, fill=mix(MIST_SOFT, (205, 222, 230), phase(p, 0.1, 0.4)), outline=MIST, width=4),
                labels(c),
                formula_line(c, 180, "平行四边形的面积 = 底 × 高", f"{n(base)} × {n(height)} = {n(para)} cm²", 1),
                formula_line(c, 285, "三角形是它的一半", f"{n(para)} ÷ 2 = {n(area)} cm²", phase(p, 0.45, 0.8), color=MIST),
            ),
        ),
        Shot(
            f"注意：{n(para)}是平行四边形的面积，别忘了除以2。",
            lambda c, p: (
                triangle(c, 1),
                copy(c, 180, 1, fade_to=0.25),
                c.polygon(tri, fill=(205, 222, 230), outline=MIST, width=4),
                labels(c),
                formula_line(c, 180, "平行四边形的面积 = 底 × 高", f"{n(base)} × {n(height)} = {n(para)} cm²", 1),
                formula_line(c, 285, "三角形是它的一半", f"{n(para)} ÷ 2 = {n(area)} cm²", 1, color=MIST),
                callout(c, (720, 395, 1190, 452), f"易错：{n(para)} 是平行四边形，别忘了 ÷ 2", phase(p, 0.1, 0.4), CLAY_SOFT, CLAY_TEXT),
            ),
        ),
        Shot(
            "记住：三角形的面积，等于底乘高，再除以2。",
            lambda c, p: (
                triangle(c, 1),
                copy(c, 180, 1, fade_to=0.25),
                c.polygon(tri, fill=(205, 222, 230), outline=MIST, width=4),
                labels(c),
                formula_line(c, 180, "平行四边形的面积 = 底 × 高", f"{n(base)} × {n(height)} = {n(para)} cm²", 1),
                formula_line(c, 285, "三角形是它的一半", f"{n(para)} ÷ 2 = {n(area)} cm²", 1, color=MIST),
                callout(c, (720, 395, 1190, 452), f"易错：{n(para)} 是平行四边形，别忘了 ÷ 2", 1, CLAY_SOFT, CLAY_TEXT),
                callout(c, (720, 470, 1190, 530), "三角形面积 = 底 × 高 ÷ 2", phase(p, 0.1, 0.4), GOLD_SOFT, INK),
            ),
        ),
    ]
    return Video(
        "q04",
        "第 4 题 · 三角形的面积",
        "两个一样的三角形，能拼成一个平行四边形",
        shots,
        lambda c: frame_chrome(c, "第 4 题 · 三角形的面积", "两个一样的三角形，能拼成一个平行四边形"),
        poster_shot=2,
    ), area


# ---------------------------------------------------------------- 第 10 题：小房子


def q10(params: dict) -> tuple[Video, float]:
    width, wall, roof = params["width"], params["wallHeight"], params["roofHeight"]
    rect_area = width * wall
    tri_area = width * roof / 2
    total = rect_area + tri_area
    s = 25
    ox, oy = 190, 525
    x1 = ox + width * s
    eave = oy - wall * s
    apex = (ox + width * s / 2, eave - roof * s)
    rect = [(ox, eave), (x1, eave), (x1, oy), (ox, oy)]

    def n(x: float) -> str:
        return f"{x:g}"

    def roof_pts(lift: float) -> list[Pt]:
        return [(ox, eave - lift), (apex[0], apex[1] - lift), (x1, eave - lift)]

    def house(c: Canvas, p: float = 1, lift: float = 0, tint: float = 0, labels: float = 1):
        c.polygon(rect, fill=mix(MIST_SOFT, (205, 222, 230), tint))
        c.polygon(roof_pts(lift), fill=mix(MIST_SOFT, CLAY_SOFT, tint))
        outline = [(ox, eave), apex, (x1, eave), (x1, oy), (ox, oy)]
        if lift == 0:
            c.stroke_path(outline, MIST, width=3, progress=p)
        else:
            c.polygon(rect, outline=MIST, width=3)
            c.polygon(roof_pts(lift), outline=CLAY, width=3)
        t = labels
        if t > 0:
            c.text(((ox + x1) / 2, oy + 34), f"长 {n(width)} cm", size=26, color=mix(CARD, INK, t), anchor="mm")
            c.text((x1 + 14, (eave + oy) / 2), f"宽 {n(wall)} cm", size=26, color=mix(CARD, INK, t), anchor="lm")
            ry = (apex[1] + eave) / 2 - lift
            c.dashed((apex[0], apex[1] - lift), (apex[0], eave - lift), mix(CARD, CLAY, t), width=2)
            # 放在屋顶右侧，不压在斜边上
            c.text((x1 + 14, ry), f"高 {n(roof)} cm", size=24, color=mix(CARD, CLAY_TEXT, t), anchor="lm")

    def split_line(c: Canvas, t: float):
        if t > 0:
            c.dashed((ox - 20, eave), (x1 + 20, eave), GOLD_LINE, width=3, progress=t)

    L1 = (f"长方形：长 × 宽 = {n(width)} × {n(wall)}", f"= {n(rect_area)} cm²")
    L2 = (f"三角形：底 × 高 ÷ 2 = {n(width)} × {n(roof)} ÷ 2", f"= {n(tri_area)} cm²")
    L3 = ("合起来", f"{n(rect_area)} + {n(tri_area)} = {n(total)} cm²")

    def formulas(c: Canvas, a: float, b: float, d: float):
        formula_line(c, 170, L1[0], L1[1], a)
        formula_line(c, 265, L2[0], L2[1], b, color=CLAY_TEXT)
        formula_line(c, 360, L3[0], L3[1], d, color=MIST)

    lift = 34
    shots = [
        Shot(
            f"广场上有一个小房子造型：下面是长{n(width)}厘米、宽{n(wall)}厘米的长方形，上面是底{n(width)}厘米、高{n(roof)}厘米的三角形屋顶。",
            lambda c, p: house(c, p=phase(p, 0, 0.5), labels=phase(p, 0.45, 0.8)),
        ),
        Shot(
            "这种组合图形，可以沿着这条虚线，分成两部分。",
            lambda c, p: (house(c), split_line(c, phase(p, 0.2, 0.8))),
        ),
        Shot(
            "把屋顶往上提一点，就看得更清楚了：一个长方形，一个三角形。",
            lambda c, p: house(c, lift=lift * phase(p, 0.1, 0.6), tint=phase(p, 0.3, 0.8)),
        ),
        Shot(
            f"长方形的面积：长乘宽，{n(width)}乘{n(wall)}，等于{n(rect_area)}平方厘米。",
            lambda c, p: (house(c, lift=lift, tint=1), formulas(c, phase(p, 0.1, 0.5), 0, 0)),
        ),
        Shot(
            f"三角形的面积：底是{n(width)}，高是{n(roof)}，{n(width)}乘{n(roof)}再除以2，等于{n(tri_area)}平方厘米。",
            lambda c, p: (house(c, lift=lift, tint=1), formulas(c, 1, phase(p, 0.1, 0.5), 0)),
        ),
        Shot(
            f"合起来：{n(rect_area)}加{n(tri_area)}，等于{n(total)}平方厘米。",
            lambda c, p: (house(c, lift=lift * (1 - phase(p, 0.1, 0.5)), tint=1), formulas(c, 1, 1, phase(p, 0.3, 0.7))),
        ),
        Shot(
            f"注意：如果算成{n(rect_area + width * roof)}，是三角形忘了除以2；如果算成{n(rect_area)}，是把屋顶漏掉了。",
            lambda c, p: (
                house(c, tint=1),
                formulas(c, 1, 1, 1),
                callout(c, (720, 465, 1190, 512), f"{n(rect_area + width * roof)}：三角形忘了 ÷ 2", phase(p, 0.05, 0.3), CLAY_SOFT, CLAY_TEXT),
                callout(c, (720, 525, 1190, 572), f"{n(rect_area)}：漏掉了屋顶", phase(p, 0.5, 0.75), CLAY_SOFT, CLAY_TEXT),
            ),
        ),
    ]
    return Video(
        "q10",
        "第 10 题 · 组合图形：分割法",
        "复杂的图形，分成会算的图形，再相加",
        shots,
        lambda c: frame_chrome(c, "第 10 题 · 组合图形：分割法", "复杂的图形，分成会算的图形，再相加"),
        poster_shot=2,
    ), total


# ---------------------------------------------------------------- 题库数据


def question(qid: int) -> tuple[dict, str]:
    """从题库源码中取出题目的图形参数和答案（题库是唯一来源，视频中的数字由它算出）"""
    src = QUESTIONS_TS.read_text(encoding="utf-8")
    # 关卡 STAGES 也有 id，只取带图形参数的那一块
    blocks = [m.group(1) for m in re.finditer(rf"\n    id: {qid},\n(.*?)\n  }},", src, re.S)]
    body = next((b for b in blocks if "figure:" in b), None)
    if body is None:
        raise SystemExit(f"题库中找不到第 {qid} 题")
    fig = re.search(r"figure: \{([^}]*)\}", body).group(1)
    params = {k: float(v) for k, v in re.findall(r"(\w+): ([\d.]+)", fig)}
    answer = re.search(r"answer: '([\d.]+)'", body).group(1)
    return params, answer


# ---------------------------------------------------------------- 生成


def unsafe_pixels(rgb: bytes) -> int:
    """底部安全区（y ≥ SAFE_TOP）中与底色相差超过 8 的像素数"""
    row = W * 3
    count = 0
    for y in range(SAFE_TOP, H, 4):
        line = rgb[y * row:(y + 1) * row]
        for x in range(0, W, 4):
            r, g, b = line[x * 3], line[x * 3 + 1], line[x * 3 + 2]
            if max(abs(r - PAPER[0]), abs(g - PAPER[1]), abs(b - PAPER[2])) > 8:
                count += 1
    return count


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def duration(path: Path) -> float:
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


async def speak(text: str, out: Path) -> None:
    import edge_tts

    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(out))


def vtt_time(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def build(video: Video) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        # 1. 旁白：逐句合成，末尾补停顿，读出时长
        durations, wavs = [], []
        for i, shot in enumerate(video.shots):
            mp3, wav = tmpd / f"{i}.mp3", tmpd / f"{i}.wav"
            asyncio.run(speak(shot.say, mp3))
            run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af", f"apad=pad_dur={PAUSE}", "-ar", "24000", "-ac", "1", str(wav)])
            durations.append(duration(wav))
            wavs.append(wav)
        concat = tmpd / "list.txt"
        concat.write_text("".join(f"file '{w}'\n" for w in wavs))
        audio = tmpd / "audio.wav"
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), str(audio)])

        # 2. 画面：按每句的时长逐帧绘制，管道交给 ffmpeg
        starts = [sum(durations[:i]) for i in range(len(durations))]
        total = sum(durations)
        frames = math.ceil(total * FPS)
        mp4 = OUT / f"{video.key}.mp4"
        enc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
             "-i", str(audio),
             "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-tune", "animation",
             "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(mp4)],
            stdin=subprocess.PIPE,
        )
        poster = None
        safe_violations = 0
        poster_frame = min(frames - 1, int((starts[video.poster_shot] + durations[video.poster_shot] - 0.1) * FPS))
        for f in range(frames):
            t = f / FPS
            k = max(i for i, s0 in enumerate(starts) if s0 <= t)
            c = Canvas()
            video.background(c)
            # 每个分镜都画出完整画面（包括之前分镜留下的内容），所以只画当前分镜
            video.shots[k].draw(c, min(1.0, (t - starts[k]) / max(durations[k] - PAUSE, 0.1)))
            data = c.frame()
            enc.stdin.write(data)
            if f % FPS == 0 or f == frames - 1:  # 每秒抽一帧检查安全区
                safe_violations += unsafe_pixels(data)
            if f == poster_frame:
                poster = Image.frombytes("RGB", (W, H), data)
        enc.stdin.close()
        if enc.wait() != 0:
            raise SystemExit("ffmpeg 编码失败")
        if poster is None:
            raise SystemExit("视频太短，没有封面帧")
        poster.save(OUT / f"{video.key}.jpg", quality=82)

    # 3. 字幕：每句一条，首尾相接
    lines = ["WEBVTT", ""]
    for i, shot in enumerate(video.shots):
        lines += [str(i + 1), f"{vtt_time(starts[i])} --> {vtt_time(starts[i] + durations[i])}", shot.say, ""]
    (OUT / f"{video.key}.vtt").write_text("\n".join(lines), encoding="utf-8")

    assert safe_violations == 0, f"{video.key}：底部安全区内有 {safe_violations} 个像素不是底色"
    real = duration(mp4)
    size = mp4.stat().st_size
    report = {
        "video": video.key,
        "shots": len(video.shots),
        "cues": len(video.shots),
        "subtitleEnd": round(total, 2),
        "videoDuration": round(real, 2),
        "bytes": size,
        "safeAreaClean": safe_violations == 0,
    }
    assert abs(real - total) < 1.0, f"视频时长 {real} 与字幕 {total} 相差超过 1 秒"
    assert size < MAX_BYTES, f"{mp4.name} 有 {size} 字节，超过 5 MB"
    return report


def main(argv: list[str]) -> None:
    for f in (FONT_SANS, FONT_SANS_BOLD, FONT_SERIF):
        if not f.exists():
            raise SystemExit(f"缺少字体 {f.name}，见 video/README.md 的下载步骤")
    wanted = argv or ["q04", "q10"]
    makers = {"q04": (4, q04), "q10": (10, q10)}
    reports = []
    for key in wanted:
        qid, make = makers[key]
        params, answer = question(qid)
        video, result = make(params)
        # 视频里算出的结果必须等于题库答案
        assert f"{result:g}" == answer, f"第 {qid} 题：视频算出 {result:g}，题库答案是 {answer}"
        reports.append(build(video))
        print(json.dumps(reports[-1], ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
