/**
 * 解析中的重点标记（explanation-highlights D1、D4）：`{c:条件}`、`{f:公式和算式}`、`{k:关键}`。
 * 规则与后端 server/src/content/highlight.ts 相同（种子写入前已校验）；这里遇到不合法的标记时，
 * 把整段当作普通文字并去掉花括号，页面不出错。
 */
export type HighlightKind = 'c' | 'f' | 'k';
export type Segment = { kind: HighlightKind | null; text: string };

const MARK = /^\{([cfk]):([^{}]*)\}/;

export function parseHighlights(text: string): { segments: Segment[] } | { error: string } {
  const segments: Segment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '}') return { error: `第 ${i + 1} 个字符的"}"没有配对` };
    if (ch !== '{') {
      plain += ch;
      i += 1;
      continue;
    }
    const m = MARK.exec(text.slice(i));
    if (!m) return { error: `第 ${i + 1} 个字符开始的标记格式不对` };
    if (m[2]!.trim() === '') return { error: '标记内的文字为空' };
    if (plain) segments.push({ kind: null, text: plain });
    plain = '';
    segments.push({ kind: m[1] as HighlightKind, text: m[2]! });
    i += m[0].length;
  }
  if (plain) segments.push({ kind: null, text: plain });
  return { segments };
}

/** 用于显示：不合法时退回为一段去掉花括号的普通文字 */
export function toSegments(text: string): Segment[] {
  const r = parseHighlights(text);
  return 'error' in r ? [{ kind: null, text: text.replace(/[{}]/g, '') }] : r.segments;
}

/** 把"看图找条件：……"拆成小标题和正文；小标题在第一个"："之前，且不含标记 */
export function splitStepLabel(step: string): { label: string | null; body: string } {
  const at = step.indexOf('：');
  if (at <= 0 || at > 8 || step.slice(0, at).includes('{')) return { label: null, body: step };
  return { label: step.slice(0, at), body: step.slice(at + 1) };
}
