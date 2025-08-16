import { useEffect } from 'react';
import type { Event as TauriEvent } from '@tauri-apps/api/event';
import { getCurrentWindow, type DragDropEvent } from '@tauri-apps/api/window';

export type DragAction =
  | { type: 'enter' }
  | { type: 'leave' }
  | { type: 'drop' }
  | { type: 'reset' };

/**
 * Subscribe to Tauri v2 native drag & drop and update drag UI state.
 * Prevents browser navigation on file drops without stopping propagation.
 */
export function useNativeFileDrop(
  handlePath: (path: string) => Promise<void> | void,
  dispatchDrag: React.Dispatch<DragAction>
) {
  useEffect(() => {
    const preventNav = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventNav);
    window.addEventListener('drop', preventNav);

    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    appWindow
      .onDragDropEvent((event: TauriEvent<DragDropEvent>) => {
        const e = event.payload;
        if (e.type === 'enter' || e.type === 'over') {
          dispatchDrag({ type: 'enter' });
        } else if (e.type === 'drop') {
          const first = Array.isArray(e.paths) ? e.paths[0] : undefined;
          if (first) handlePath(first);
          dispatchDrag({ type: 'drop' });
        } else if (e.type === 'leave') {
          dispatchDrag({ type: 'reset' });
        }
      })
      .then((un) => {
        unlisten = un;
      });

    return () => {
      window.removeEventListener('dragover', preventNav);
      window.removeEventListener('drop', preventNav);
      if (unlisten) unlisten();
    };
  }, [handlePath, dispatchDrag]);
}
