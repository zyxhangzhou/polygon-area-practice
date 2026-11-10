import { useEffect, useState } from 'react';

type Health = { status: string; db: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(async (res) => setHealth((await res.json()) as Health))
      .catch(() => setError('无法连接后端'));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>图形小镇 · 多边形面积练习</h1>
      <p>项目骨架已就绪，练习功能开发中。</p>
      <p data-testid="health">
        后端状态：{error ?? (health ? `${health.status}（数据库：${health.db}）` : '检查中…')}
      </p>
    </main>
  );
}
