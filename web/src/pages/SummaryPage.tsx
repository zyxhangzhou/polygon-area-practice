import { navigate } from '../router';

/** 总结页占位：F 会替换成真正的学习总结 */
export function SummaryPage() {
  return (
    <main className="page summary">
      <h1>练习已结束</h1>
      <p>学习总结页正在建设中。</p>
      <button onClick={() => navigate('/')}>回到首页</button>
    </main>
  );
}
