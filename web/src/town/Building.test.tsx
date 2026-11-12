import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Building, buildingState, statusText, type BuildingStatus } from './Building';
import { KINDS_IN_ORDER } from './buildings';

const layers = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-layer]')].map((g) => g.getAttribute('data-layer'));
const entering = (c: HTMLElement) =>
  [...c.querySelectorAll('.entering')].map((g) => g.getAttribute('data-layer'));

function draw(status: BuildingStatus, level: number, kind = KINDS_IN_ORDER[0]!) {
  return render(<Building kind={kind} name="面包店" status={status} level={level} />);
}

describe('建筑阶段', () => {
  it.each(KINDS_IN_ORDER)('%s：各阶段显示对应的图层', (kind) => {
    expect(layers(draw('locked', 0, kind).container)).toEqual(['plot']);
    expect(layers(draw('building', 0, kind).container)).toEqual(['plot']);
    expect(layers(draw('building', 1, kind).container)).toEqual(['layer1', 'scaffold']);
    expect(layers(draw('building', 2, kind).container)).toEqual(['layer1', 'layer2', 'scaffold']);
    expect(layers(draw('lit', 3, kind).container)).toEqual([
      'glow',
      'layer1',
      'layer2',
      'layer3',
      'lights',
    ]);
  });

  it('文字说明：施工中 n/3、已点亮、未解锁', () => {
    expect(draw('building', 2).getByRole('img', { name: '面包店：施工中 2/3' })).toBeTruthy();
    expect(draw('lit', 3).getByRole('img', { name: '面包店：已点亮' })).toBeTruthy();
    expect(draw('locked', 0).getByRole('img', { name: '面包店：未解锁' })).toBeTruthy();
  });

  it('由后端进度得到状态：订正后做对也计入，点亮即 3 层', () => {
    expect(buildingState({ unlocked: false, lit: false, solvedCount: 0 })).toEqual({
      status: 'locked',
      level: 0,
    });
    expect(buildingState({ unlocked: true, lit: false, solvedCount: 1 })).toEqual({
      status: 'building',
      level: 1,
    });
    expect(buildingState({ unlocked: true, lit: true, solvedCount: 3 })).toEqual({
      status: 'lit',
      level: 3,
    });
    expect(statusText('building', 1)).toBe('施工中 1/3');
  });
});

describe('动画只为当下的变化播放', () => {
  it('首次挂载（进入页面、刷新）不加动画 class', () => {
    const { container } = draw('lit', 3);
    expect(entering(container)).toEqual([]);
    expect(container.querySelector('.lighting')).toBeNull();
  });

  it('层数增加时，只有新出现的层带 entering', () => {
    const { container, rerender } = draw('building', 1);
    rerender(<Building kind="bakery" name="面包店" status="building" level={2} />);
    expect(entering(container)).toEqual(['layer2']);
  });

  it('点亮时最后一层落下，灯光与光晕带 lighting', () => {
    const { container, rerender } = draw('building', 2);
    rerender(<Building kind="bakery" name="面包店" status="lit" level={3} />);
    expect(entering(container)).toEqual(['layer3']);
    expect(container.querySelector('[data-layer="lights"]')).toHaveClass('lighting');
    expect(container.querySelector('[data-layer="glow"]')).toHaveClass('lighting');
  });

  it('重新挂载后不再有动画 class', () => {
    const first = draw('building', 2);
    first.rerender(<Building kind="bakery" name="面包店" status="lit" level={3} />);
    first.unmount();
    const { container } = draw('lit', 3);
    expect(entering(container)).toEqual([]);
    expect(container.querySelector('.lighting')).toBeNull();
  });

  it('其他原因的重新渲染（状态不变）不会触发动画', () => {
    const { container, rerender } = draw('building', 1);
    rerender(<Building kind="bakery" name="面包店" status="building" level={1} className="x" />);
    expect(entering(container)).toEqual([]);
  });
});
