"""生成网站图标（site-favicon）：与页面左上角的标志同一图形，放在米色圆角方块上。

输出到 web/public/：favicon.svg、favicon.ico（16/32/48）、apple-touch-icon.png（180）。
运行：python scripts/build_icons.py（需要 Pillow，可用 video/ 的虚拟环境）。
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "public"

PAPER = "#F7F2E9"
EDGE = "#E6DCCE"
CLAY = "#C66B43"
MIST = "#3F6175"

# 32×32 网格中的图形，与 Brand.tsx 的标志相同（平移后放大到占满约 80%）
BODY = [(3, 29), (11, 11), (29, 11), (21, 29)]
ROOF = [(11, 11), (16, 3), (21, 11)]
RADIUS = 7


def svg() -> str:
    pts = lambda p: " ".join(f"{x},{y}" for x, y in p)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<rect x="0.5" y="0.5" width="31" height="31" rx="{RADIUS}" fill="{PAPER}" stroke="{EDGE}"/>'
        f'<polygon points="{pts(BODY)}" fill="{CLAY}"/>'
        f'<polygon points="{pts(ROOF)}" fill="{MIST}"/>'
        "</svg>\n"
    )


def raster(size: int, rounded: bool = True) -> Image.Image:
    """按 8 倍超采样绘制后缩小，边缘平滑。apple-touch-icon 不要圆角（系统会自己裁）。"""
    ss = 8
    big = size * ss
    k = big / 32
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=RADIUS * k, fill=PAPER, outline=EDGE, width=max(1, round(k)))
    else:
        d.rectangle([0, 0, big, big], fill=PAPER)
    d.polygon([(x * k, y * k) for x, y in BODY], fill=CLAY)
    d.polygon([(x * k, y * k) for x, y in ROOF], fill=MIST)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(svg(), encoding="utf-8")
    # 每个尺寸单独绘制，小尺寸更清晰
    icons = [raster(n) for n in (16, 32, 48)]
    icons[-1].save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=icons[:-1])
    raster(180, rounded=False).save(OUT / "apple-touch-icon.png", optimize=True)
    for f in ["favicon.svg", "favicon.ico", "apple-touch-icon.png"]:
        print(f, (OUT / f).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
