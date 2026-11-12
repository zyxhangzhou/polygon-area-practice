export type Cue = { start: number; end: number; text: string };

const TIME = /^(\d{2,}):(\d{2}):(\d{2}(?:\.\d+)?)\s+-->\s+(\d{2,}):(\d{2}):(\d{2}(?:\.\d+)?)/;

const seconds = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s);

/**
 * 解析本项目生成的 WebVTT 字幕（video/build.py）：每条为可选的序号行、时间行、文字。
 * 只支持"时:分:秒.毫秒"的时间格式，文字可以有多行。
 */
export function parseVtt(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => TIME.test(l));
    if (i < 0) continue;
    const m = TIME.exec(lines[i]!)!;
    const text = lines
      .slice(i + 1)
      .join('\n')
      .trim();
    if (!text) continue;
    cues.push({ start: seconds(m[1]!, m[2]!, m[3]!), end: seconds(m[4]!, m[5]!, m[6]!), text });
  }
  return cues;
}

/** 某个时刻正在显示的那一句；不在任何一句的时间内时为 null */
export function cueAt(cues: Cue[], time: number): Cue | null {
  return cues.find((c) => time >= c.start && time < c.end) ?? null;
}
