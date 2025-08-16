import { useReducer } from 'react';

export type DragState = { depth: number; dragging: boolean };
export type DragAction =
  | { type: 'enter' }
  | { type: 'leave' }
  | { type: 'drop' }
  | { type: 'reset' };

export function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'enter': {
      const depth = state.depth + 1;
      return { depth, dragging: true };
    }
    case 'leave': {
      const depth = Math.max(0, state.depth - 1);
      return { depth, dragging: depth > 0 };
    }
    case 'drop':
    case 'reset':
      return { depth: 0, dragging: false };
    default:
      return state;
  }
}

/** Convenience hook that returns [state, dispatch]. */
export function useDragState() {
  return useReducer(dragReducer, { depth: 0, dragging: false });
}
