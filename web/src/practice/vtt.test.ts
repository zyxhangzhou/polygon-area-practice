import { describe, expect, it } from 'vitest';
import { cueAt, parseVtt } from './vtt';

describe('parseVtt', () => {
  it('解析序号、时间与文字；跳过文件头', () => {
    const cues = parseVtt(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:08.088\n第一句。\n\n2\n00:00:08.088 --> 00:01:02.500\n第二句，\n换行也算。\n',
    );
    expect(cues).toEqual([
      { start: 0, end: 8.088, text: '第一句。' },
      { start: 8.088, end: 62.5, text: '第二句，\n换行也算。' },
    ]);
  });

  it('没有序号、Windows 换行、多余空行都能解析', () => {
    const cues = parseVtt('WEBVTT\r\n\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n一句\r\n');
    expect(cues).toEqual([{ start: 1, end: 2, text: '一句' }]);
  });

  it('没有文字或时间格式不对的块被忽略', () => {
    expect(parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n\n1\nabc --> def\n文字')).toEqual([]);
  });
});

describe('cueAt', () => {
  const cues = parseVtt(
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nA\n\n00:00:02.000 --> 00:00:04.000\nB',
  );
  it('按时间找到当前这句；边界属于后一句；超出范围为 null', () => {
    expect(cueAt(cues, 0)?.text).toBe('A');
    expect(cueAt(cues, 2)?.text).toBe('B');
    expect(cueAt(cues, 4)).toBeNull();
  });
});
