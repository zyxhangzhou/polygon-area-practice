import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/api';
import type { HistoryResponse } from '../api/types';
import { LoadFailed, useLoad } from '../practice/load';
import { navigate } from '../router';
import { Brand } from '../ui/Brand';
import { storage } from '../storage';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

/** 练习记录：这个学生最近的练习，已结束的可以查看总结（大纲 §2.4"旧会话及总结保留可查"） */
export function HistoryPage() {
  const [learnerId] = useState(() => storage.getLearnerId());

  const load = useCallback(async (): Promise<HistoryResponse | null> => {
    if (!learnerId) return null;
    const res = await request<HistoryResponse>('GET', `/api/learners/${learnerId}/sessions`);
    if (res.kind === 'ok') return res.data;
    if (res.kind === 'rejected' && res.code === 'LEARNER_NOT_FOUND') {
      storage.clearAll();
      navigate('/', { replace: true });
    }
    return null;
  }, [learnerId]);
  const { data, failed, reload } = useLoad<HistoryResponse>(load);

  useEffect(() => {
    if (!learnerId) navigate('/', { replace: true });
  }, [learnerId]);

  if (failed && learnerId) {
    return (
      <main className="page history">
        <LoadFailed what="练习记录" onRetry={reload} />
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page history">
        <p>正在读取练习记录…</p>
      </main>
    );
  }

  const total = data.sessions.length;
  return (
    <main className="page history">
      <div className="topbar">
        <Brand sub="练习记录" />
      </div>
      <h1>练习记录</h1>
      {total === 0 ? (
        <p className="empty">还没有练习记录。</p>
      ) : (
        <ol className="history-list">
          {data.sessions.map((s, i) => (
            <li key={s.id} className="history-item">
              <span className="history-title">
                第 {total - i} 次 · {formatTime(s.startedAt)}
              </span>
              {s.status === 'completed' ? (
                <>
                  <span>
                    {s.endedEarly ? '提前结束' : '已完成'} · 首次正确率 {s.rates.firstTry}% ·
                    最终完成率 {s.rates.completion}%
                  </span>
                  <button onClick={() => navigate(`/summary/${s.id}`)}>查看总结</button>
                </>
              ) : (
                <>
                  <span>进行中 · 已做对 {s.counts.firstTry + s.counts.corrected} 题</span>
                  <button className="primary" onClick={() => navigate('/practice')}>
                    继续练习
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="actions">
        <button onClick={() => navigate('/')}>回到首页</button>
      </div>
    </main>
  );
}
