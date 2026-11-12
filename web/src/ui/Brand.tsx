import { navigate } from '../router';

/** 页面左上角的标志：点击回首页 */
export function Brand({ sub }: { sub?: string }) {
  return (
    <button type="button" className="brand" onClick={() => navigate('/')} aria-label="图形小镇首页">
      <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
        <path d="M4 28 L12 10 L30 10 L22 28 Z" fill="#C66B43" />
        <path d="M12 10 L17 2 L22 10 Z" fill="#3F6175" />
      </svg>
      <span className="brand-name">图形小镇</span>
      {sub && <span className="brand-sub">{sub}</span>}
    </button>
  );
}
