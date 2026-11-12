import type { CSSProperties, ReactNode } from 'react';

/**
 * 四座建筑的分层图形（design D1，照视觉稿移植）。viewBox 都是 0 0 240 200，地面在 y≈182。
 * 每座建筑分为：待建空地、三层、施工标志（随层数变化）、点亮时的灯光。
 */
export type BuildingKind = 'bakery' | 'camp' | 'bridge' | 'plaza';

export type BuildingArt = {
  /** 光晕的中心 */
  glow: { cx: number; cy: number };
  /** 不随阶段变化的背景（如小桥的河水） */
  ground?: ReactNode;
  plot: ReactNode;
  layers: [ReactNode, ReactNode, ReactNode];
  /** 施工标志，层数为 1 或 2 时显示 */
  scaffold: (stage: number) => ReactNode;
  /** 点亮时依次亮起的灯，每个元素一盏 */
  lights: ReactNode[];
};

/** 依次亮灯的序号，CSS 用它计算延迟 */
export const lightStyle = (i: number) => ({ '--i': i }) as CSSProperties;

const PLOT = '#7F98A6';
const WALL = '#F4E7D2';
const WALL_SIDE = '#E2CFB2';
const WINDOW = '#3F6175';
const WOOD = '#A97A57';
const CLAY = '#C66B43';
const CLAY_DARK = '#A95736';
const LIGHT = '#FFD98A';
const LIGHT_SOFT = '#FFE3A6';

const bakery: BuildingArt = {
  glow: { cx: 124, cy: 118 },
  plot: (
    <g fill="none" stroke={PLOT} strokeWidth={2} strokeDasharray="6 6">
      <path d="M52 182 L176 182 L196 166 L72 166 Z" />
      <line x1={52} y1={182} x2={52} y2={170} />
      <line x1={196} y1={166} x2={196} y2={154} />
    </g>
  ),
  layers: [
    <g key="1">
      <path d="M56 182 L188 182 L200 172 L68 172 Z" fill="#CBB89A" />
      <rect x={64} y={128} width={118} height={46} fill={WALL} />
      <path d="M182 128 L196 118 L196 164 L182 174 Z" fill={WALL_SIDE} />
      <rect x={74} y={140} width={26} height={22} rx={3} fill={WINDOW} />
      <path d="M110 174 L110 152 Q123 138 136 152 L136 174 Z" fill={WOOD} />
      <circle cx={131} cy={160} r={1.8} fill="#E7C98F" />
      <rect x={146} y={140} width={26} height={22} rx={3} fill={WINDOW} />
    </g>,
    <g key="2">
      <rect x={64} y={90} width={118} height={40} fill={WALL} />
      <path d="M182 90 L196 80 L196 120 L182 130 Z" fill={WALL_SIDE} />
      <rect x={74} y={100} width={24} height={20} rx={3} fill={WINDOW} />
      <rect x={148} y={100} width={24} height={20} rx={3} fill={WINDOW} />
      <path d="M106 118 L142 118 L146 104 L110 104 Z" fill={WINDOW} />
      <path
        d="M118 113 Q124 107 132 113"
        stroke="#E7C98F"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <line x1={64} y1={129} x2={182} y2={129} stroke={WALL_SIDE} strokeWidth={2} />
    </g>,
    <g key="3">
      <path d="M56 92 L188 92 L206 72 L74 72 Z" fill={CLAY} />
      <rect x={56} y={92} width={132} height={6} fill={CLAY_DARK} />
      <path d="M188 92 L206 72 L206 78 L188 98 Z" fill="#8F4A2E" />
      <rect x={160} y={52} width={13} height={24} fill={CLAY_DARK} />
      <rect x={157} y={48} width={19} height={6} rx={1} fill="#8F4A2E" />
      <path d="M100 138 L146 138 L152 128 L106 128 Z" fill="#E7C98F" />
      <path
        d="M106 138 L114 138 L120 128 L112 128 Z M122 138 L130 138 L136 128 L128 128 Z M138 138 L146 138 L152 128 L144 128 Z"
        fill={CLAY}
      />
    </g>,
  ],
  scaffold: (stage) => {
    const top = stage >= 2 ? 78 : 112;
    return (
      <g stroke={WOOD} strokeWidth={3} strokeLinecap="round">
        <line x1={204} y1={182} x2={204} y2={top} />
        <line x1={222} y1={178} x2={222} y2={top} />
        <line x1={204} y1={150} x2={222} y2={148} />
        {stage >= 2 && <line x1={204} y1={118} x2={222} y2={116} />}
        <path
          className="flag"
          d={`M222 ${top} L238 ${top + 7} L222 ${top + 14} Z`}
          fill={CLAY}
          stroke="none"
        />
      </g>
    );
  },
  lights: [
    <rect key="a" x={74} y={140} width={26} height={22} rx={3} fill={LIGHT} />,
    <rect key="b" x={74} y={100} width={24} height={20} rx={3} fill={LIGHT_SOFT} />,
    <rect key="c" x={148} y={100} width={24} height={20} rx={3} fill={LIGHT_SOFT} />,
    <rect key="d" x={146} y={140} width={26} height={22} rx={3} fill={LIGHT} />,
  ],
};

const camp: BuildingArt = {
  glow: { cx: 118, cy: 130 },
  plot: (
    <g fill="none" stroke={PLOT} strokeWidth={2} strokeDasharray="6 6">
      <path d="M40 182 L200 182 L184 168 L56 168 Z" />
    </g>
  ),
  layers: [
    <g key="1">
      <path d="M36 184 L204 184 L190 172 L50 172 Z" fill="#CFC3A4" />
      <g stroke={WOOD} strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M62 178 L116 82 L170 178" />
        <line x1={116} y1={82} x2={116} y2={62} />
      </g>
    </g>,
    <g key="2">
      <path d="M62 178 L116 82 L170 178 Z" fill="#7E9C83" />
      <path d="M116 82 L170 178 L116 178 Z" fill="#6A8770" />
      <path d="M100 178 L116 146 L132 178 Z" fill="#3F5446" />
      <path d="M116 146 L132 178 L124 178 Z" fill="#2F4136" />
      <line
        x1={80}
        y1={146}
        x2={94}
        y2={120}
        stroke="#9DB6A1"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>,
    <g key="3">
      <path d="M156 178 L190 118 L224 178 Z" fill={CLAY} />
      <path d="M190 118 L224 178 L190 178 Z" fill={CLAY_DARK} />
      <path d="M182 178 L190 160 L198 178 Z" fill="#6E3420" />
      <path d="M116 62 L146 70 L116 78 Z" fill="#E7C98F" className="flag" />
      <path d="M22 178 L40 146 L58 178 Z" fill="#E7C98F" />
      <path d="M40 146 L58 178 L40 178 Z" fill="#D4B377" />
    </g>,
  ],
  scaffold: () => (
    <g>
      <line x1={116} y1={62} x2={116} y2={82} stroke={WOOD} strokeWidth={3} strokeLinecap="round" />
      <path className="flag" d="M116 62 L132 67 L116 72 Z" fill={CLAY} />
    </g>
  ),
  lights: [
    <path key="a" d="M100 178 L116 146 L132 178 Z" fill={LIGHT} />,
    <path key="b" d="M182 178 L190 160 L198 178 Z" fill={LIGHT_SOFT} />,
    <g key="c">
      <path d="M86 184 L94 170 L102 184 Z" fill="#F0B33F" />
      <path d="M90 184 L94 176 L98 184 Z" fill="#FFF1C9" />
    </g>,
    <g key="d">
      <path d="M58 98 Q116 110 176 96" stroke="#E7C98F" strokeWidth={1.5} fill="none" />
      <circle cx={72} cy={101} r={3} fill={LIGHT} />
      <circle cx={96} cy={105} r={3} fill={LIGHT} />
      <circle cx={138} cy={104} r={3} fill={LIGHT} />
      <circle cx={162} cy={99} r={3} fill={LIGHT} />
    </g>,
  ],
};

const bridge: BuildingArt = {
  glow: { cx: 120, cy: 104 },
  ground: (
    <g>
      <path d="M0 150 L240 150 L240 186 L0 186 Z" fill="#A9BFCB" />
      <path d="M0 150 L240 150 L240 156 L0 156 Z" fill="#93AEBC" />
      <g stroke="#E3ECF0" strokeWidth={2} strokeLinecap="round" opacity={0.8}>
        <line x1={30} y1={166} x2={52} y2={166} />
        <line x1={150} y1={174} x2={178} y2={174} />
        <line x1={196} y1={162} x2={214} y2={162} />
      </g>
      <path d="M0 140 L34 140 L48 186 L0 186 Z" fill="#B5C79A" />
      <path d="M240 140 L206 140 L192 186 L240 186 Z" fill="#B5C79A" />
    </g>
  ),
  plot: (
    <g fill="none" stroke="#5F7A88" strokeWidth={2} strokeDasharray="6 6">
      <path d="M34 128 L206 128 L190 142 L50 142 Z" />
    </g>
  ),
  layers: [
    <g key="1">
      <path d="M72 186 L80 140 L100 140 L108 186 Z" fill="#B7A68A" />
      <path d="M132 186 L140 140 L160 140 L168 186 Z" fill="#B7A68A" />
      <path d="M100 140 L108 186 L102 186 L96 140 Z" fill="#9E8D72" />
      <path d="M160 140 L168 186 L162 186 L156 140 Z" fill="#9E8D72" />
    </g>,
    <g key="2">
      <path d="M30 124 L210 124 L194 142 L46 142 Z" fill={CLAY} />
      <path d="M46 142 L194 142 L194 147 L46 147 Z" fill={CLAY_DARK} />
      <path d="M108 147 Q120 132 132 147 Z" fill="#93AEBC" />
    </g>,
    <g key="3">
      <g stroke={WINDOW} strokeWidth={2.5} strokeLinecap="round">
        <line x1={38} y1={124} x2={38} y2={104} />
        <line x1={202} y1={124} x2={202} y2={104} />
        <line x1={38} y1={108} x2={202} y2={108} />
        {[62, 86, 110, 130, 154, 178].map((x) => (
          <line key={x} x1={x} y1={124} x2={x} y2={108} />
        ))}
      </g>
      <line x1={38} y1={104} x2={38} y2={80} stroke="#26303A" strokeWidth={2.5} />
      <line x1={202} y1={104} x2={202} y2={80} stroke="#26303A" strokeWidth={2.5} />
      <path d="M31 80 L45 80 L42 70 L34 70 Z" fill="#26303A" />
      <path d="M195 80 L209 80 L206 70 L198 70 Z" fill="#26303A" />
      <rect x={34} y={80} width={8} height={8} fill="#5F7A88" />
      <rect x={198} y={80} width={8} height={8} fill="#5F7A88" />
    </g>,
  ],
  scaffold: (stage) => {
    const top = stage >= 2 ? 70 : 96;
    return (
      <g stroke={WOOD} strokeWidth={3} strokeLinecap="round">
        <line x1={120} y1={150} x2={120} y2={top} />
        <line x1={120} y1={top} x2={168} y2={top} />
        <line className="hook" x1={160} y1={top} x2={160} y2={top + 22} strokeWidth={1.5} />
      </g>
    );
  },
  lights: [
    <g key="a">
      <rect x={34} y={80} width={8} height={8} fill={LIGHT} />
      <circle cx={38} cy={84} r={10} fill={LIGHT} opacity={0.45} />
      <rect x={34} y={160} width={8} height={18} rx={4} fill={LIGHT} opacity={0.5} />
    </g>,
    <g key="b">
      <rect x={198} y={80} width={8} height={8} fill={LIGHT} />
      <circle cx={202} cy={84} r={10} fill={LIGHT} opacity={0.45} />
      <rect x={198} y={160} width={8} height={18} rx={4} fill={LIGHT} opacity={0.5} />
    </g>,
  ],
};

const plaza: BuildingArt = {
  glow: { cx: 120, cy: 100 },
  ground: <path d="M16 184 L224 184 L206 166 L34 166 Z" fill="#E6DCCB" />,
  plot: (
    <g fill="none" stroke={PLOT} strokeWidth={2} strokeDasharray="6 6">
      <rect x={98} y={96} width={44} height={70} />
    </g>
  ),
  layers: [
    <g key="1">
      <path d="M28 182 L72 182 L72 170 L48 170 L48 158 L28 158 Z" fill="#7E9C83" />
      <circle cx={36} cy={164} r={3} fill="#E58F74" />
      <circle cx={44} cy={172} r={3} fill="#F0B33F" />
      <circle cx={60} cy={176} r={3} fill="#E58F74" />
      <path d="M158 182 L206 182 L216 166 L168 166 Z" fill="#B98A63" />
      <g stroke="#7E9C83" strokeWidth={3} strokeLinecap="round">
        <line x1={172} y1={176} x2={176} y2={170} />
        <line x1={186} y1={176} x2={190} y2={170} />
        <line x1={200} y1={176} x2={204} y2={170} />
      </g>
      <rect x={94} y={160} width={52} height={8} fill="#CBB89A" />
    </g>,
    <g key="2">
      <rect x={100} y={92} width={40} height={70} fill={WALL} />
      <rect x={140} y={92} width={8} height={70} fill={WALL_SIDE} />
      <path d="M112 162 L112 144 Q120 134 128 144 L128 162 Z" fill={WINDOW} />
      <rect x={112} y={112} width={16} height={16} rx={2} fill={WINDOW} />
    </g>,
    <g key="3">
      <path d="M94 94 L120 50 L146 94 Z" fill={WINDOW} />
      <path d="M120 50 L146 94 L154 94 L124 48 Z" fill="#2C4757" />
      <rect x={92} y={92} width={58} height={5} fill="#2C4757" />
      <circle cx={120} cy={80} r={9} fill="#FFFDF8" stroke="#E7C98F" strokeWidth={2} />
      <path
        d="M120 74 L120 80 L124 82"
        stroke="#26303A"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <line x1={120} y1={50} x2={120} y2={36} stroke="#26303A" strokeWidth={2} />
      <path className="flag" d="M120 36 L134 40 L120 44 Z" fill={CLAY} />
    </g>,
  ],
  scaffold: (stage) => {
    const top = stage >= 2 ? 86 : 120;
    return (
      <g stroke={WOOD} strokeWidth={3} strokeLinecap="round">
        <line x1={156} y1={166} x2={156} y2={top} />
        <line x1={172} y1={166} x2={172} y2={top} />
        <line x1={156} y1={140} x2={172} y2={140} />
        {stage >= 2 && <line x1={156} y1={114} x2={172} y2={114} />}
      </g>
    );
  },
  lights: [
    <g key="a">
      <circle cx={120} cy={80} r={9} fill={LIGHT_SOFT} stroke="#E7C98F" strokeWidth={2} />
      <path
        d="M120 74 L120 80 L124 82"
        stroke="#26303A"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    </g>,
    <rect key="b" x={112} y={112} width={16} height={16} rx={2} fill={LIGHT} />,
    <g key="c">
      <path d="M20 118 Q60 132 100 112" stroke="#E7C98F" strokeWidth={1.5} fill="none" />
      <circle cx={38} cy={124} r={3} fill={LIGHT} />
      <circle cx={62} cy={126} r={3} fill={LIGHT} />
      <circle cx={84} cy={120} r={3} fill={LIGHT} />
    </g>,
    <g key="d">
      <path d="M140 112 Q180 132 220 118" stroke="#E7C98F" strokeWidth={1.5} fill="none" />
      <circle cx={156} cy={120} r={3} fill={LIGHT} />
      <circle cx={178} cy={126} r={3} fill={LIGHT} />
      <circle cx={202} cy={124} r={3} fill={LIGHT} />
    </g>,
  ],
};

export const BUILDINGS: Record<BuildingKind, BuildingArt> = { bakery, camp, bridge, plaza };

/** 关卡顺序对应的建筑 */
export const KINDS_IN_ORDER: BuildingKind[] = ['bakery', 'camp', 'bridge', 'plaza'];
