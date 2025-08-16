/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useNativeFileDrop, type DragAction } from '../useNativeFileDrop';

// ---- Mock Tauri window API ----
type DragDropPayload =
  | { type: 'enter'; paths: string[]; position?: unknown }
  | { type: 'over'; position: unknown }
  | { type: 'drop'; paths: string[] }
  | { type: 'leave' };

let savedCb: ((event: { payload: DragDropPayload }) => void) | null = null;
const unlisten = vi.fn();

vi.mock('@tauri-apps/api/window', () => {
  return {
    getCurrentWindow: () => ({
      onDragDropEvent: (cb: typeof savedCb) => {
        savedCb = cb;
        return Promise.resolve(unlisten);
      },
    }),
  };
});

// Dummy module to satisfy type-only imports
vi.mock('@tauri-apps/api/event', () => ({}));

// ---- Spy on window.add/removeEventListener ----
const addSpy = vi.spyOn(window, 'addEventListener');
const removeSpy = vi.spyOn(window, 'removeEventListener');

function TestHarness({
  handlePath,
  dispatchDrag,
}: {
  handlePath: (p: string) => void;
  dispatchDrag: React.Dispatch<DragAction>;
}) {
  useNativeFileDrop(handlePath, dispatchDrag);
  return <div>ok</div>;
}

describe('useNativeFileDrop', () => {
  beforeEach(() => {
    savedCb = null;
    unlisten.mockClear();
    addSpy.mockClear();
    removeSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('subscribes to window drag events and tauri on mount', async () => {
    const handlePath = vi.fn();
    const dispatch = vi.fn();

    render(<TestHarness handlePath={handlePath} dispatchDrag={dispatch} />);

    // A listener is attached to suppress window dragover/drop navigation
    expect(addSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('drop', expect.any(Function));

    // Tauri onDragDropEvent has been subscribed
    expect(savedCb).toBeTypeOf('function');

    // enter → dispatch enter
    savedCb!({ payload: { type: 'enter', paths: ['/tmp/a.sqlite'] } as any });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'enter' });

    // over → dispatch enter (keep UI in drag state)
    savedCb!({ payload: { type: 'over', position: { x: 1, y: 2 } } as any });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'enter' });

    // drop → handlePath + dispatch drop
    savedCb!({ payload: { type: 'drop', paths: ['/tmp/a.sqlite'] } as any });
    expect(handlePath).toHaveBeenCalledWith('/tmp/a.sqlite');
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'drop' });

    // leave → dispatch reset
    savedCb!({ payload: { type: 'leave' } as any });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'reset' });
  });

  it('cleans up listeners on unmount', async () => {
    const handlePath = vi.fn();
    const dispatch = vi.fn();
    const { unmount } = render(
      <TestHarness handlePath={handlePath} dispatchDrag={dispatch} />
    );

    // Allow the Promise returned by onDragDropEvent to resolve
    await Promise.resolve();
    await Promise.resolve();

    unmount();

    // Remove window listeners
    expect(removeSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function));
    // Call tauri-side unlisten
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
