/**
 * Dropzone component for selecting SQLite database files (.sqlite / .db).
 * Supports drag-and-drop as well as manual file selection.
 *
 * Notes for contributors (en-GB):
 * - This component is intentionally "dumb": all state & handlers are passed down from the parent.
 * - Styling uses shadcn/ui Button variants (`brand`, `brandOutline`) backed by Tailwind tokens.
 * - Accessibility: exposes ARIA roles/labels and a live region; announces changes politely.
 *
 * Props allow for complete control of drag state, file handling, and UI behaviour.
 */
import React, { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, FileText } from 'lucide-react';
import { fileSize } from '@/lib/tauri';

/**
 * Props accepted by the Dropzone component.
 *
 * All handlers and state are passed down from the parent to allow integration
 * with specific application logic, including database connection handling.
 */
export type DropzoneProps = {
  sqlitePath: string;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowseClick: () => void;
  resetSelection: () => void;
  formatBytes: (bytes?: number | null) => string;
};

/**
 * Renders the Dropzone interface for selecting database files.
 * Displays different content depending on whether a file has been selected.
 * Includes accessibility features such as ARIA labels and live regions.
 */
export default function Dropzone({
  sqlitePath,
  isDragging,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onBrowseClick,
  resetSelection,
  formatBytes,
}: DropzoneProps) {
  // Generate a unique, stable id for the hidden input to avoid collisions when multiple Dropzones exist.
  const autoId = useId();
  const descId = `dropzone-desc-${autoId}`;

  // When using the desktop app, resolve the file size from the OS path.
  const [pathSize, setPathSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sqlitePath) {
        setPathSize(null);
        return;
      }
      try {
        const size = await fileSize(sqlitePath);
        if (!cancelled && typeof size === 'number') {
          setPathSize(size);
        } else if (!cancelled) {
          setPathSize(null);
        }
      } catch {
        if (!cancelled) setPathSize(NaN);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sqlitePath]);

  return (
    // Do NOT bind `onDrop` here. Let Tauri deliver `tauri://file-drop` with real file-system paths.
    // Binding a DOM drop handler can interfere with OS-level file drop events.
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      role="region"
      aria-label="SQLite file dropzone"
      aria-describedby={descId}
      aria-busy={isDragging}
      className={`h-52 overflow-hidden rounded border-2 border-dashed p-6 text-center transition ${
        isDragging || sqlitePath
          ? 'border-primary/70 bg-muted/60'
          : 'border-muted-foreground/25'
      }`}
    >
      {/* Conditionally render the 'file selected' state or the 'no file selected' state */}
      {sqlitePath ? (
        <div className="flex h-full flex-col items-center justify-center">
          {/* Status badge indicating readiness to open the database */}
          <div className="mb-3 flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm shadow-sm ring-1 ring-white/60">
            <CheckCircle2
              className="h-4 w-4 text-emerald-600"
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">Ready to open</span>
          </div>

          {/* Display selected file name, size (if available), and source type (file or path) */}
          <div
            className="group mx-auto flex max-w-full items-center gap-2 rounded-md bg-white/70 px-3 py-2 shadow-sm ring-1 ring-white/60"
            aria-live="polite"
            title={sqlitePath}
          >
            <FileText className="h-4 w-4 opacity-70" aria-hidden="true" />
            <span className="max-w-[420px] truncate font-medium text-foreground">
              {sqlitePath.split(/[/\\]/).pop()}
            </span>
            <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] leading-none text-zinc-700 ring-1 ring-zinc-200">
              {pathSize === null
                ? '…'
                : typeof pathSize === 'number' && !isNaN(pathSize)
                  ? formatBytes(pathSize)
                  : 'Unknown'}
            </span>
          </div>

          {/* NOTE (en‑GB): Do not use a <label htmlFor=...> here, as it would also trigger the hidden
              <input type="file"> and cause two file pickers (native + OS dialog). We exclusively
              call onBrowseClick() to open the OS picker on desktop. */}
          <div className="mt-5 flex items-center gap-2">
            <Button
              type="button"
              variant="brand"
              onClick={(e) => {
                // Desktop flow: open the OS picker only; do not trigger the hidden input.
                e.preventDefault();
                e.stopPropagation();
                onBrowseClick();
              }}
              aria-label="Choose another file"
            >
              Choose another file
            </Button>
            <Button
              type="button"
              variant="brandOutline"
              onClick={resetSelection}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Placeholder icon shown when no file is selected */}
          <div className="mx-auto mb-0.5 flex h-10 w-10 items-center justify-center rounded">
            <Upload className="h-6 w-6 opacity-70" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium" aria-live="polite">
            No file selected
          </p>
          {/* Explanatory text is referenced by aria-describedby on the region */}
          <p id={descId} className="mt-6 py-0.5 text-xs text-muted-foreground">
            Drag &amp; drop a .sqlite / .db file, or use the button below.
          </p>

          {/* NOTE (en‑GB): Do not use a <label htmlFor=...> here, as it would also trigger the hidden
              <input type="file"> and cause two file pickers (native + OS dialog). We exclusively
              call onBrowseClick() to open the OS picker on desktop. */}
          <Button
            type="button"
            variant="brand"
            className="mt-3"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBrowseClick();
            }}
            aria-label="Choose file"
          >
            Choose file
          </Button>
        </>
      )}
    </div>
  );
  // End of Dropzone. Further customisation (variants, icons, layout) should be performed via props and tokens rather than hard‑coded classes.
}
