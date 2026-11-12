import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** 网站图标（site-favicon）：入口页面声明的图标都存在，ICO 含 16、32、48 三个尺寸 */
const WEB = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('网站图标', () => {
  it('入口页面声明 ICO、SVG 和 Apple 触摸图标', () => {
    const href = (sel: string) => doc.querySelector(sel)?.getAttribute('href');
    expect(href('link[rel="icon"][sizes="any"]')).toBe('/favicon.ico');
    expect(href('link[rel="icon"][type="image/svg+xml"]')).toBe('/favicon.svg');
    expect(href('link[rel="apple-touch-icon"]')).toBe('/apple-touch-icon.png');
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f7f2e9');
  });

  it('声明的图标文件都在 public 中', () => {
    const hrefs = [...doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(
      (l) => l.getAttribute('href')!,
    );
    expect(hrefs).toHaveLength(3);
    for (const h of hrefs) expect(fs.existsSync(path.join(WEB, 'public', h))).toBe(true);
  });

  it('favicon.ico 含 16、32、48 三个尺寸', () => {
    const ico = fs.readFileSync(path.join(WEB, 'public', 'favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1); // 类型 1 = 图标
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16]).sort((a, b) => a! - b!);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('apple-touch-icon.png 是 180×180 的 PNG', () => {
    const png = fs.readFileSync(path.join(WEB, 'public', 'apple-touch-icon.png'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
