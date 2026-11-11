import { useEffect, useState } from 'react';

/** 读取题目或解析：失败时（结果不确定）给出重试，不会一直停在"正在读取" */
export function useLoad<T>(load: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load().then((d) => {
      if (!active) return;
      setData(d);
      setFailed(d === null);
    });
    return () => {
      active = false;
    };
    // load 由调用方用 useCallback 固定，attempt 变化时重新读取
  }, [load, attempt]);
  const reload = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { data, failed, reload };
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="notice">
      <p>暂时没能读取{what}，请检查网络后重试</p>
      <button onClick={onRetry}>重新读取</button>
    </div>
  );
}
