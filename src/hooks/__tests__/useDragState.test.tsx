import { describe, it, expect } from 'vitest';
import { dragReducer, type DragState, type DragAction } from '../useDragState';

function reduce(
  seq: DragAction[],
  init: DragState = { depth: 0, dragging: false }
) {
  return seq.reduce(dragReducer, init);
}

describe('useDragState / dragReducer', () => {
  it('enter increments depth and sets dragging', () => {
    const s = reduce([{ type: 'enter' }]);
    expect(s).toEqual({ depth: 1, dragging: true });
  });

  it('nested enter/leave keeps non-negative depth', () => {
    const s = reduce([{ type: 'enter' }, { type: 'enter' }, { type: 'leave' }]);
    expect(s).toEqual({ depth: 1, dragging: true });
  });

  it('leave at depth 0 stays 0 and not dragging', () => {
    const s = reduce([{ type: 'leave' }]);
    expect(s).toEqual({ depth: 0, dragging: false });
  });

  it('drop resets depth and dragging', () => {
    const s = reduce([{ type: 'enter' }, { type: 'drop' }]);
    expect(s).toEqual({ depth: 0, dragging: false });
  });

  it('reset also clears state', () => {
    const s = reduce([{ type: 'enter' }, { type: 'reset' }]);
    expect(s).toEqual({ depth: 0, dragging: false });
  });
});
