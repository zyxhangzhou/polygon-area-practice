import { useEffect, useState } from 'react';
import { request } from '../api/api';
import type { SessionView } from '../api/types';
import { Bear } from '../companion/Bear';
import { Guide } from '../onboarding/Guide';
import { useStore } from '../practice/context';
import { OFFLINE_MESSAGE, startPractice } from '../practice/start';
import { navigate } from '../router';
import { storage } from '../storage';
import { TownMap } from '../town/TownMap';
import { Brand } from '../ui/Brand';

type HomeState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'in_progress'; solved: number; view: SessionView }
  | { kind: 'completed'; view: SessionView }
  | { kind: 'offline' };

/** 圆圆的欢迎语：按后端返回的进度说出下一步（只描述事实） */
function welcome(state: HomeState): { title: string; text: string } {
  if (state.kind === 'in_progress') {
    const lit = state.view.stages.filter((s) => s.lit).map((s) => s.buildingName);
    const next = state.view.stages.find((s) => s.unlocked && !s.lit);
    const parts = [`已经做对 ${state.solved} 道题，接着来吧。`];
    if (lit.length > 0) parts.push(`${lit.join('、')}已经点亮了。`);
    if (next) {
      parts.push(
        `${next.buildingName}还差 ${next.total - next.solvedCount} 道${next.name}的题就能点亮。`,
      );
    }
    return { title: '欢迎回来，建造师。', text: parts.join('') };
  }
  if (state.kind === 'completed') {
    return { title: '上一次练习已经结束了。', text: '可以看看总结和小镇，也可以再练一次。' };
  }
  return {
    title: '欢迎来到图形小镇',
    text: '每做对一道题，建筑就盖高一层；一关三道题都做对，它就会亮起灯来。',
  };
}

/**
 * 首页（design D7）：按保存的会话决定按钮。打开页面只读取，不创建学生或会话；
 * 创建学生的接口不是幂等的，放在 effect 里会因 StrictMode 建出两个。
 */
export function HomePage() {
  const store = useStore();
  // 没有保存会话时直接显示"开始练习"，不必等请求
  const [state, setState] = useState<HomeState>(() =>
    storage.getSessionId() ? { kind: 'loading' } : { kind: 'none' },
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // 第一次来、还没有学生时自动出现引导（onboarding-guide）
  const [guideOpen, setGuideOpen] = useState(
    () => !storage.getLearnerId() && !storage.getGuideSeen(),
  );

  function closeGuide() {
    storage.setGuideSeen();
    setGuideOpen(false);
    // 关闭后焦点回到主按钮
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-guide="start"] button.primary')?.focus(),
    );
  }

  useEffect(() => {
    let active = true;
    const sessionId = storage.getSessionId();
    if (!sessionId) return;
    void request<SessionView>('GET', `/api/sessions/${sessionId}`).then((res) => {
      if (!active) return;
      if (res.kind === 'ok') {
        store.useSession(sessionId, res.data);
        setState(
          res.data.session.status === 'completed'
            ? { kind: 'completed', view: res.data }
            : {
                kind: 'in_progress',
                solved: res.data.questions.filter((q) => q.status === 'solved').length,
                view: res.data,
              },
        );
      } else if (res.kind === 'rejected' && res.code === 'SESSION_NOT_FOUND') {
        // 会话已失效：清除，重新开始。其他拒绝（如请求过多）不清除，免得丢掉学生的记录
        storage.setSessionId(null);
        setState({ kind: 'none' });
      } else {
        setState({ kind: 'offline' });
      }
    });
    return () => {
      active = false;
    };
  }, [store, reload]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    const res = await startPractice(store);
    setStarting(false);
    if (!res.ok) setError(res.message);
  }

  const view = state.kind === 'in_progress' || state.kind === 'completed' ? state.view : null;
  const words = welcome(state);
  const total = view?.questions.length ?? 12;

  return (
    <main className="page home">
      <div className="topbar">
        <Brand sub="多边形面积练习" />
        <div className="actions">
          <button type="button" className="link" onClick={() => setGuideOpen(true)}>
            玩法介绍
          </button>
          {storage.getLearnerId() && state.kind !== 'loading' && state.kind !== 'offline' && (
            <button type="button" onClick={() => navigate('/history')}>
              练习记录
            </button>
          )}
        </div>
      </div>

      <div data-guide="map">
        {/* 读到会话前后是两张地图：读到进度不是"本次操作"，不能触发建造动画 */}
        <TownMap key={view ? view.session.id : 'empty'} session={view} />
      </div>

      <div className="home-panels">
        <section className="card welcome" aria-label="圆圆的话" data-guide="welcome">
          <div className="companion">
            <div className="companion-avatar">
              <Bear mood="idle" />
            </div>
            <div className="companion-words">
              <h1 className="companion-title">{words.title}</h1>
              <p className="companion-text">{words.text}</p>
            </div>
          </div>
        </section>

        <section className="start-card" aria-label="开始练习" data-guide="start">
          {state.kind === 'loading' && <p>正在读取进度…</p>}
          {state.kind === 'offline' && (
            <div role="alert" className="notice">
              <p>{OFFLINE_MESSAGE}</p>
              <button
                onClick={() => {
                  setState({ kind: 'loading' });
                  setReload((n) => n + 1);
                }}
              >
                重新连接
              </button>
            </div>
          )}
          {state.kind === 'none' && (
            <>
              <div className="count">
                <span>4 个关卡</span>
                <strong>12 道题</strong>
              </div>
              <button className="primary" disabled={starting} onClick={() => void start()}>
                开始练习
              </button>
            </>
          )}
          {state.kind === 'in_progress' && (
            <>
              <div className="count">
                <span>已做对</span>
                <strong>
                  {state.solved} / {total}
                </strong>
              </div>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${(state.solved / total) * 100}%` }} />
              </div>
              <button className="primary" onClick={() => navigate('/practice')}>
                继续练习
              </button>
            </>
          )}
          {state.kind === 'completed' && (
            <div className="actions">
              <button className="primary" disabled={starting} onClick={() => void start()}>
                再练一次
              </button>
              <button onClick={() => navigate('/summary')}>查看总结</button>
            </div>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </section>
      </div>

      {guideOpen && <Guide onClose={closeGuide} />}
    </main>
  );
}
