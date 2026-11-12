import { useId, useState } from 'react';
import { BUILDINGS, lightStyle, type BuildingKind } from './buildings';
import './town.css';

export type BuildingStatus = 'locked' | 'building' | 'lit';

/** 建筑状态的文字说明（town-display：读屏软件与页面标签共用） */
export function statusText(status: BuildingStatus, stage: number, total = 3) {
  if (status === 'locked') return '未解锁';
  if (status === 'lit') return '已点亮';
  return `施工中 ${stage}/${total}`;
}

/** 由后端返回的关卡进度得到建筑的状态与层数 */
export function buildingState(stage: { unlocked: boolean; lit: boolean; solvedCount: number }) {
  const status: BuildingStatus = stage.lit ? 'lit' : stage.unlocked ? 'building' : 'locked';
  return { status, level: stage.lit ? 3 : Math.min(stage.solvedCount, 3) };
}

/**
 * 一座建筑（design D1、D2）。层数与是否点亮完全由参数决定；
 * 只有在组件存续期间层数增加或刚点亮时才加动画 class，首次挂载（进入页面、刷新）直接显示。
 */
export function Building({
  kind,
  name,
  status,
  level,
  className,
}: {
  kind: BuildingKind;
  name: string;
  status: BuildingStatus;
  level: number;
  className?: string;
}) {
  const art = BUILDINGS[kind];
  const lit = status === 'lit';
  const stage = lit ? 3 : status === 'locked' ? 0 : level;

  // 记住上一次的层数与点亮状态，在渲染中比较（React 推荐的"随 props 调整 state"写法）
  const [prev, setPrev] = useState({ stage, lit });
  const [anim, setAnim] = useState<{ from: number; lighting: boolean } | null>(null);
  if (prev.stage !== stage || prev.lit !== lit) {
    setPrev({ stage, lit });
    setAnim({
      from: stage > prev.stage ? prev.stage : stage,
      lighting: lit && !prev.lit,
    });
  }

  const glowId = `glow-${useId().replace(/:/g, '')}`;
  const label = `${name}：${statusText(status, stage)}`;
  const entering = (i: number) => anim !== null && i >= anim.from;
  const lighting = anim?.lighting ?? false;

  return (
    <svg
      viewBox="0 0 240 200"
      role="img"
      aria-label={label}
      className={`building-art ${status} ${className ?? ''}`}
      data-kind={kind}
      data-stage={stage}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD98A" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#FFD98A" stopOpacity={0} />
        </radialGradient>
      </defs>
      {lit && (
        <circle
          data-layer="glow"
          className={lighting ? 'glow lighting' : 'glow'}
          cx={art.glow.cx}
          cy={art.glow.cy}
          r={112}
          fill={`url(#${glowId})`}
        />
      )}
      <ellipse cx={122} cy={184} rx={98} ry={7} fill="#26303A" opacity={0.09} />
      {art.ground}
      {stage === 0 && <g data-layer="plot">{art.plot}</g>}
      {art.layers.map((layer, i) =>
        i < stage ? (
          <g
            key={i}
            data-layer={`layer${i + 1}`}
            className={entering(i) ? 'layer entering' : 'layer'}
            style={lightStyle(anim ? i - anim.from : 0)}
          >
            {layer}
          </g>
        ) : null,
      )}
      {status === 'building' && stage > 0 && stage < 3 && (
        <g data-layer="scaffold" className="scaffold">
          {art.scaffold(stage)}
        </g>
      )}
      {lit && (
        <g data-layer="lights" className={lighting ? 'lights lighting' : 'lights'}>
          {art.lights.map((light, i) => (
            <g key={i} className="light" style={lightStyle(i)}>
              {light}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
