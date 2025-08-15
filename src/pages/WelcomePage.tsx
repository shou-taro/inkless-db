/**
 * WelcomePage
 * -----------
 * This is the landing screen that greets the user and provides entry points
 * for opening or connecting to different types of databases.
 *
 * Features
 * --------
 * - SQLite: Provides a drag‑and‑drop enabled Dropzone, as well as a manual
 *   browse option, for selecting `.sqlite` or `.db` files. Uses helper
 *   utilities to validate file types and extract file names.
 * - PostgreSQL & MySQL: Presently placeholders with form fields for
 *   connection parameters (host, port, database, user, password), ready
 *   for future integration.
 *
 * Implementation notes
 * --------------------
 * - Styling uses shadcn/ui components with custom variants (`brand` and
 *   `brandOutline`) defined via class‑variance‑authority, ensuring a
 *   consistent look and feel.
 * - Drag state is managed via a reducer to handle nested drag events without
 *   leaving the UI stuck in a "dragging" state.
 * - File name and extension checks are centralised in `@/lib/fileUtils` for
 *   re‑use and easier testing.
 * - A global effect intercepts `dragover` and `drop` events on the window to
 *   prevent the browser from navigating away when a file is dropped outside
 *   the intended target.
 */
// --- Drag state utilities (kept outside the component to avoid re-creation) ---
type DragState = { depth: number; dragging: boolean };
type DragAction = { type: 'enter' } | { type: 'leave' } | { type: 'drop' } | { type: 'reset' };

function dragReducer(state: DragState, action: DragAction): DragState {
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

// Normalises DOM drag events
const stopEvent = (e: Event | React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

import { useEffect, useState, useCallback, useReducer, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Toaster, toast } from 'sonner';
import { formatBytes } from '@/lib/format';
import { getBaseName, isAcceptedFileName } from '@/lib/file-utils';
import Dropzone from '@/components/Dropzone';
import { useConnection } from '@/store/connection';
import { openSqliteDialog, openConnection } from '@/lib/db/tauri';
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { join, tempDir } from '@tauri-apps/api/path';

export default function WelcomePage({
  onOpenGraph,
}: {
  onOpenGraph: () => void;
}) {
  const [sqlitePath, setSqlitePath] = useState('');
  const [drag, dispatchDrag] = useReducer(dragReducer, { depth: 0, dragging: false });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const openingRef = useRef(false);
  const { setConnection } = useConnection();

  const resetSelection = useCallback(() => {
    setSqlitePath('');
    setSelectedPath(null);
  }, []);

  const showUnsupportedToast = useCallback(
    () =>
      toast.error(
        <span>
          Unsupported file type.
          <br />
          Please select a .sqlite or .db file.
        </span>
      ),
    []
  );

  // Prevent the browser from hijacking file drops (helps avoid accidental navigation).
  useEffect(() => {
    window.addEventListener('dragover', stopEvent);
    window.addEventListener('drop', stopEvent);
    return () => {
      window.removeEventListener('dragover', stopEvent);
      window.removeEventListener('drop', stopEvent);
    };
  }, []);

  const handlePath = useCallback(
    async (path: string) => {
      if (!isAcceptedFileName(path)) {
        resetSelection();
        showUnsupportedToast();
        return;
      }
      const name = getBaseName(path);
      setSqlitePath(name);
      setSelectedPath(path);
    },
    [resetSelection, showUnsupportedToast]
  );

  const onBrowseClick = useCallback(async () => {
    if (openingRef.current) return; // prevent double-open from bubbling/labels
    openingRef.current = true;
    try {
      const selected = await openSqliteDialog();
      if (typeof selected === 'string' && selected.length > 0) {
        await handlePath(selected);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to open the OS file picker.');
    } finally {
      // small delay to ignore duplicate events from the same user action
      setTimeout(() => {
        openingRef.current = false;
      }, 300);
    }
  }, [handlePath]);

  const ensureDir = useCallback(async (folder: string) => {
    if (!(await exists(folder))) {
      await mkdir(folder, { recursive: true });
    }
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      try {
        if (!isAcceptedFileName(f.name)) {
          resetSelection();
          showUnsupportedToast();
          return;
        }
        const buf = new Uint8Array(await f.arrayBuffer());
        const tmp = await tempDir();
        const folder = await join(tmp, 'inkless-db');
        await ensureDir(folder);
        const target = await join(folder, `${Date.now()}-${f.name}`);
        await writeFile(target, buf);
        setSqlitePath(getBaseName(f.name));
        setSelectedPath(target);
      } catch (e) {
        console.error(e);
        resetSelection();
        toast.error('Failed to process the dropped file. Please use Browse instead.');
      }
    },
    [resetSelection, showUnsupportedToast, ensureDir]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    dispatchDrag({ type: 'enter' });
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    dispatchDrag({ type: 'leave' });
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    dispatchDrag({ type: 'drop' });
    const list = e.dataTransfer?.files;
    const f = list && list.length > 0 ? list[0] : undefined;
    if (f) await handleFile(f);
  }, [handleFile]);

  return (
    <div className="flex h-screen flex-row items-center justify-center">
      <Toaster richColors position="top-center" closeButton />
      <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-violet-50 via-fuchsia-200 to-violet-400 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-60"
          style={{
            backgroundImage: [
              'radial-gradient(circle at 15% 20%, rgba(199, 210, 254, 0.35), transparent 60%)', // indigo-200
              'radial-gradient(circle at 85% 25%, rgba(233, 213, 255, 0.35), transparent 60%)', // purple-200
              'radial-gradient(circle at 30% 80%, rgba(250, 232, 255, 0.30), transparent 60%)', // fuchsia-100
              'radial-gradient(circle at 75% 75%, rgba(219, 234, 254, 0.30), transparent 60%)', // sky-100 (cool balance)
              'radial-gradient(rgba(255,255,255,0.35) 2px, transparent 2px)',
            ].join(', '),
            backgroundSize:
              '100% 100%, 100% 100%, 100% 100%, 100% 100%, 20px 20px',
            backgroundPosition: '0 0',
          }}
        />
        <div className="relative z-10">
          <h1 className="mb-4 bg-gradient-to-r from-violet-800 via-fuchsia-600 to-violet-700 bg-clip-text text-3xl font-bold text-transparent drop-shadow-sm">
            Welcome to Inkless DB
          </h1>
          <p className="text-sm italic text-gray-700">
            Manage your databases without writing queries.
          </p>
        </div>
      </div>
      <div className="h-full flex-1 overflow-y-auto bg-background p-6">
        <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center">
          <Tabs defaultValue="sqlite" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sqlite">SQLite</TabsTrigger>
              <TabsTrigger value="postgres">PostgreSQL</TabsTrigger>
              <TabsTrigger value="mysql">MySQL</TabsTrigger>
            </TabsList>

            <TabsContent value="sqlite" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Open a SQLite database</CardTitle>
                  <CardDescription>
                    Use a file path to your .sqlite / .db file.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <Dropzone
                      sqlitePath={sqlitePath}
                      isDragging={drag.dragging}
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onBrowseClick={onBrowseClick}
                      resetSelection={resetSelection}
                      formatBytes={formatBytes}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="brand"
                    disabled={!sqlitePath}
                    onClick={async () => {
                      try {
                        if (selectedPath) {
                          const connId = await openConnection('Sqlite', selectedPath);
                          setConnection(connId, 'Sqlite');
                          onOpenGraph();
                          return;
                        }
                        toast.error('Please select a SQLite file via Browse.');
                      } catch (e) {
                        toast.error('Failed to open the database.');
                      }
                    }}
                  >
                    Open
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="postgres" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Connect to PostgreSQL</CardTitle>
                  <CardDescription>
                    Enter your database credentials to connect.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="pg-host">Host</Label>
                    <Input id="pg-host" placeholder="localhost" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pg-port">Port</Label>
                      <Input id="pg-port" type="number" placeholder="5432" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pg-db">Database</Label>
                      <Input id="pg-db" placeholder="my_database" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pg-user">User</Label>
                      <Input id="pg-user" placeholder="postgres" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pg-password">Password</Label>
                      <Input
                        id="pg-password"
                        type="password"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button type="button" variant="brandOutline" disabled>
                    Test connection
                  </Button>
                  <Button type="button" variant="brand" disabled>
                    Connect
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="mysql" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Connect to MySQL</CardTitle>
                  <CardDescription>
                    Provide host, port, and credentials.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="my-host">Host</Label>
                    <Input id="my-host" placeholder="localhost" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="my-port">Port</Label>
                      <Input id="my-port" type="number" placeholder="3306" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="my-db">Database</Label>
                      <Input id="my-db" placeholder="my_database" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="my-user">User</Label>
                      <Input id="my-user" placeholder="root" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="my-password">Password</Label>
                      <Input
                        id="my-password"
                        type="password"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button type="button" variant="brandOutline" disabled>
                    Test connection
                  </Button>
                  <Button type="button" variant="brand" disabled>
                    Connect
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
