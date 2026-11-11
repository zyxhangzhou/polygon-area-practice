import type { Figure as FigureParams } from '../../../server/src/content/schema';

/** 按题目参数绘制图形（design D9）。只标出题干给出的条件；所求的边标"?"，按默认比例画 */

const W = 320;
const H = 220;
const PAD = 36;

type Pt = [number, number];
type Label = { at: Pt; text: string; anchor?: 'start' | 'middle' | 'end' };
type Drawing = {
  /** 图形的自然尺寸（题目单位） */
  width: number;
  height: number;
  outline: Pt[];
  extra?: Pt[][];
  dashed?: [Pt, Pt][];
  labels: Label[];
  areaLabel?: string;
};

const fmt = (n: number, unit: string) => `${n} ${unit}`;

function draw(f: FigureParams): Drawing {
  const u = f.lengthUnit;
  switch (f.shape) {
    case 'parallelogram': {
      // 逆运算题：所求的边不在参数里，按默认比例画
      const base = f.base ?? (f.height ?? 1) * 1.6;
      const height = f.height ?? base * 0.55;
      const off = base * 0.3;
      return {
        width: base + off,
        height,
        outline: [
          [off, 0],
          [off + base, 0],
          [base, height],
          [0, height],
        ],
        dashed: [
          [
            [off, 0],
            [off, height],
          ],
        ],
        labels: [
          { at: [base / 2, height], text: f.unknown === 'base' ? '?' : fmt(base, u) },
          {
            at: [off, height / 2],
            text: f.unknown === 'height' ? '?' : fmt(height, u),
            anchor: 'start',
          },
        ],
        areaLabel: f.area === undefined ? undefined : `面积 ${f.area} ${u}²`,
      };
    }
    case 'triangle': {
      const apex = f.base * 0.35;
      return {
        width: f.base,
        height: f.height,
        outline: [
          [apex, 0],
          [f.base, f.height],
          [0, f.height],
        ],
        dashed: [
          [
            [apex, 0],
            [apex, f.height],
          ],
        ],
        labels: [
          { at: [f.base / 2, f.height], text: fmt(f.base, u) },
          { at: [apex, f.height / 2], text: fmt(f.height, u), anchor: 'start' },
        ],
      };
    }
    case 'right-triangle': {
      const m = Math.min(f.legA, f.legB) * 0.08;
      return {
        width: f.legA,
        height: f.legB,
        outline: [
          [0, 0],
          [f.legA, f.legB],
          [0, f.legB],
        ],
        extra: [
          [
            [0, f.legB - m],
            [m, f.legB - m],
            [m, f.legB],
          ],
        ],
        labels: [
          { at: [f.legA / 2, f.legB], text: fmt(f.legA, u) },
          { at: [0, f.legB / 2], text: fmt(f.legB, u), anchor: 'end' },
        ],
      };
    }
    case 'trapezoid': {
      const width = Math.max(f.top, f.bottom);
      const topX = (width - f.top) / 2;
      const bottomX = (width - f.bottom) / 2;
      const hx = Math.max(topX, bottomX) + Math.min(f.top, f.bottom) * 0.15;
      return {
        width,
        height: f.height,
        outline: [
          [topX, 0],
          [topX + f.top, 0],
          [bottomX + f.bottom, f.height],
          [bottomX, f.height],
        ],
        dashed: [
          [
            [hx, 0],
            [hx, f.height],
          ],
        ],
        labels: [
          { at: [width / 2, 0], text: fmt(f.top, u) },
          { at: [width / 2, f.height], text: fmt(f.bottom, u) },
          { at: [hx, f.height / 2], text: fmt(f.height, u), anchor: 'start' },
        ],
      };
    }
    case 'house': {
      const total = f.wallHeight + f.roofHeight;
      return {
        width: f.width,
        height: total,
        outline: [
          [0, f.roofHeight],
          [f.width / 2, 0],
          [f.width, f.roofHeight],
          [f.width, total],
          [0, total],
        ],
        dashed: [
          [
            [0, f.roofHeight],
            [f.width, f.roofHeight],
          ],
          [
            [f.width / 2, 0],
            [f.width / 2, f.roofHeight],
          ],
        ],
        labels: [
          { at: [f.width / 2, total], text: fmt(f.width, u) },
          {
            at: [f.width, f.roofHeight + f.wallHeight / 2],
            text: fmt(f.wallHeight, u),
            anchor: 'start',
          },
          { at: [f.width / 2, f.roofHeight / 2], text: fmt(f.roofHeight, u), anchor: 'start' },
        ],
      };
    }
    case 'l-shape': {
      const cx = f.width - f.cutWidth;
      return {
        width: f.width,
        height: f.height,
        outline: [
          [0, 0],
          [cx, 0],
          [cx, f.cutHeight],
          [f.width, f.cutHeight],
          [f.width, f.height],
          [0, f.height],
        ],
        labels: [
          { at: [f.width / 2, f.height], text: fmt(f.width, u) },
          { at: [0, f.height / 2], text: fmt(f.height, u), anchor: 'end' },
          { at: [cx + f.cutWidth / 2, f.cutHeight], text: fmt(f.cutWidth, u) },
          { at: [cx, f.cutHeight / 2], text: fmt(f.cutHeight, u), anchor: 'start' },
        ],
      };
    }
  }
}

export function Figure({ figure }: { figure: FigureParams }) {
  const d = draw(figure);
  const scale = Math.min((W - 2 * PAD) / d.width, (H - 2 * PAD) / d.height);
  const ox = (W - d.width * scale) / 2;
  const oy = (H - d.height * scale) / 2;
  const p = ([x, y]: Pt): Pt => [ox + x * scale, oy + y * scale];
  const points = (pts: Pt[]) => pts.map((pt) => p(pt).join(',')).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="题目图形"
      className="figure"
      data-shape={figure.shape}
    >
      <polygon points={points(d.outline)} className="figure-shape" />
      {d.extra?.map((pts, i) => (
        <polyline key={i} points={points(pts)} className="figure-line" />
      ))}
      {d.dashed?.map(([a, b], i) => {
        const [x1, y1] = p(a);
        const [x2, y2] = p(b);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="figure-dashed" />;
      })}
      {d.labels.map((l, i) => {
        const [x, y] = p(l.at);
        const anchor = l.anchor ?? 'middle';
        const dx = anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0;
        // 底边标注放在线下方，顶边标注放在线上方，其余垂直居中
        const dy = l.at[1] === d.height ? 18 : l.at[1] === 0 ? -8 : 5;
        return (
          <text key={i} x={x + dx} y={y + dy} textAnchor={anchor} className="figure-label">
            {l.text}
          </text>
        );
      })}
      {d.areaLabel && (
        <text x={W / 2} y={H / 2 + 5} textAnchor="middle" className="figure-area">
          {d.areaLabel}
        </text>
      )}
    </svg>
  );
}
