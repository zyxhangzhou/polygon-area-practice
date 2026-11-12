/**
 * 解析中的重点标记（explanation-highlights D1、D4）：`{c:条件}`、`{f:公式和算式}`、`{k:关键}`。
 * 前端 web/src/practice/highlight.ts 有一份相同规则的实现，负责显示；这里负责种子写入前的校验。
 */
export const HIGHLIGHT_KINDS = ['c', 'f', 'k'] as const;
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];
export type Segment = { kind: HighlightKind | null; text: string };

export const MAX_MARKS_PER_TEXT = 3;

const MARK = /^\{([a-z]):([^{}]*)\}/;

/** 拆成"普通文字 / 标记"片段；格式不合法时返回错误说明 */
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
    if (!m)
      return {
        error: `第 ${i + 1} 个字符开始的标记格式不对（应为 {c:…}、{f:…} 或 {k:…}，不能嵌套）`,
      };
    const kind = m[1]!;
    if (!(HIGHLIGHT_KINDS as readonly string[]).includes(kind))
      return { error: `未知的标记类型"${kind}"` };
    if (m[2]!.trim() === '') return { error: '标记内的文字为空' };
    if (plain) segments.push({ kind: null, text: plain });
    plain = '';
    segments.push({ kind: kind as HighlightKind, text: m[2]! });
    i += m[0].length;
  }
  if (plain) segments.push({ kind: null, text: plain });
  return { segments };
}

/** 去掉标记，只留文字（用于日志或其他不显示底色的地方） */
export function stripHighlights(text: string): string {
  const r = parseHighlights(text);
  return 'error' in r ? text.replace(/[{}]/g, '') : r.segments.map((s) => s.text).join('');
}
