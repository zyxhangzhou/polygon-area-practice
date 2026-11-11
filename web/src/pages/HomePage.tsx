import { useEffect, useState } from 'react';
import { request } from '../api/api';
import type { SessionView } from '../api/types';
import { useStore } from '../practice/context';
import { OFFLINE_MESSAGE, startPractice } from '../practice/start';
import { navigate } from '../router';
import { storage } from '../storage';

type HomeState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'in_progress'; solved: number }
  | { kind: 'completed' }
  | { kind: 'offline' };

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
            ? { kind: 'completed' }
            : {
                kind: 'in_progress',
                solved: res.data.questions.filter((q) => q.status === 'solved').length,
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

  return (
    <main className="page home">
      <h1>图形小镇 · 多边形面积练习</h1>
      <p className="intro">4 个关卡、12 道题：平行四边形、三角形、梯形和组合图形。</p>
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
        <button className="primary" disabled={starting} onClick={() => void start()}>
          开始练习
        </button>
      )}
      {state.kind === 'in_progress' && (
        <>
          <p>已经做对 {state.solved} 道题，接着来吧！</p>
          <button className="primary" onClick={() => navigate('/practice')}>
            继续练习
          </button>
        </>
      )}
      {state.kind === 'completed' && (
        <>
          <p>上一次练习已经结束了。</p>
          <button className="primary" disabled={starting} onClick={() => void start()}>
            再练一次
          </button>
          <button onClick={() => navigate('/summary')}>查看总结</button>
        </>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </main>
  );
}
