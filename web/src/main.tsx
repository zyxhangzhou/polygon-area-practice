import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 标题字体自托管（design D7）：切片与页面同源，不依赖外部字体服务
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-serif-sc/700.css';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
