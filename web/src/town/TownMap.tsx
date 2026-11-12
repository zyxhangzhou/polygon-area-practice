import type { SessionView } from '../api/types';
import { Building, buildingState, statusText, type BuildingStatus } from './Building';
import { KINDS_IN_ORDER } from './buildings';

/**
 * 还没有会话时的关卡与建筑名。不能从后端题库文件引入（那里有答案，会被打包进前端），
 * 测试检查它与题库一致。
 */
export const DEFAULT_STAGES = [
  { name: '平行四边形', buildingName: '面包店' },
  { name: '三角形', buildingName: '帐篷营地' },
  { name: '梯形', buildingName: '小桥' },
  { name: '组合图形', buildingName: '小镇广场' },
] as const;

type Spot = { name: string; buildingName: string; status: BuildingStatus; level: number };

function spotsOf(session: SessionView | null): Spot[] {
  if (!session) {
    // 没有会话：四块都是空地，第 1 关可以开始
    return DEFAULT_STAGES.map((s, i) => ({
      ...s,
      status: i === 0 ? 'building' : 'locked',
      level: 0,
    }));
  }
  return session.stages.map((s) => ({
    name: s.name,
    buildingName: s.buildingName,
    ...buildingState(s),
  }));
}

const LockIcon = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
    <rect
      x="1"
      y="6"
      width="10"
      height="7"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path d="M3.5 6 V4 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/** 首页的小镇地图（town-display）：四座建筑的状态都来自后端返回的会话 */
export function TownMap({ session }: { session: SessionView | null }) {
  const spots = spotsOf(session);
  return (
    <section className="town-map" aria-label="小镇地图">
      <svg
        className="town-bg"
        viewBox="0 0 1600 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="1600" height="800" fill="#EDE5D3" />
        <circle cx="1320" cy="150" r="58" fill="#F6D9A0" opacity="0.8" />
        <path d="M0 360 Q260 280 520 340 T1040 320 T1600 300 L1600 800 L0 800 Z" fill="#DCD3B9" />
        <path d="M0 470 Q300 400 620 450 T1240 430 T1600 420 L1600 800 L0 800 Z" fill="#CFD4B2" />
        <path d="M0 600 Q380 540 760 580 T1600 560 L1600 800 L0 800 Z" fill="#BFCBA4" />
        <path
          d="M160 690 C 360 600, 420 520, 600 520 S 900 600, 1040 520 S 1300 380, 1440 400"
          stroke="#F4ECDC"
          strokeWidth="34"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="#9DB08A">
          <circle cx="90" cy="560" r="26" />
          <circle cx="122" cy="572" r="20" />
          <circle cx="760" cy="430" r="22" />
          <circle cx="1530" cy="470" r="28" />
          <circle cx="1210" cy="610" r="24" />
        </g>
      </svg>
      {spots.map((spot, i) => (
        <div
          key={spot.buildingName}
          className="town-spot"
          data-guide={i === 0 ? 'plot' : undefined}
        >
          <Building
            kind={KINDS_IN_ORDER[i] ?? 'plaza'}
            name={spot.buildingName}
            status={spot.status}
            level={spot.level}
          />
          <span className={`town-tag ${spot.status}`}>
            {spot.status === 'locked' && <LockIcon />}
            {spot.buildingName} ·{' '}
            {!session && i === 0 ? '从这里开始' : statusText(spot.status, spot.level)}
          </span>
        </div>
      ))}
    </section>
  );
}
