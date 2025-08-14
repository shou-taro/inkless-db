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
import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
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
import { useDb } from '@/lib/db/context';
import { formatBytes } from '@/lib/format';
import { getBaseName, isAcceptedFileName } from '@/lib/file-utils';
import Dropzone from '@/components/Dropzone';
import { invoke } from '@tauri-apps/api/core';

export default function WelcomePage({
  onOpenGraph,
}: {
  onOpenGraph: () => void;
}) {
  const [sqlitePath, setSqlitePath] = useState('');
  type DragState = { depth: number; dragging: boolean };
  type DragAction =
    | { type: 'enter' }
    | { type: 'leave' }
    | { type: 'drop' }
    | { type: 'reset' };
  const [drag, dispatchDrag] = useReducer(
    (state: DragState, action: DragAction): DragState => {
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
    },
    { depth: 0, dragging: false }
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openingRef = useRef(false);
  const { connect } = useDb();

  const resetSelection = useCallback(() => {
    setSqlitePath('');
    setSelectedFile(null);
    setSelectedPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    const stop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
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
      setSelectedFile(null);
    },
    [resetSelection, showUnsupportedToast]
  );

  const onBrowseClick = useCallback(async () => {
    if (openingRef.current) return; // prevent double-open from bubbling/labels
    openingRef.current = true;
    try {
      const selected =
        (await invoke<string | null>('open_sqlite_dialog')) ?? null;
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

  const noopOnFileChange = useCallback(async () => {
    // Desktop (Tauri) requires a filesystem path; avoid HTML file input.
    toast.error(
      'Please use “Choose…” to pick the database (desktop requires a file path).'
    );
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      const name = f.name || '';
      if (!isAcceptedFileName(name)) {
        resetSelection();
        showUnsupportedToast();
        return;
      }
      setSqlitePath(name);
      setSelectedFile(f);
      setSelectedPath(null);
    },
    [resetSelection, showUnsupportedToast]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dispatchDrag({ type: 'enter' });
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dispatchDrag({ type: 'leave' });
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dispatchDrag({ type: 'drop' });
      const f = e.dataTransfer.files?.[0];
      if (f) await handleFile(f);
    },
    [handleFile]
  );

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
          <h1 className="mb-4 text-3xl font-bold text-gray-900">
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
                      selectedFile={selectedFile}
                      selectedPath={selectedPath}
                      isDragging={drag.dragging}
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onBrowseClick={onBrowseClick}
                      resetSelection={resetSelection}
                      formatBytes={formatBytes}
                      onFileChange={noopOnFileChange}
                      fileInputRef={fileInputRef}
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
                          await connect({ kind: 'sqlite', path: selectedPath });
                          onOpenGraph();
                          return;
                        }
                        const f =
                          selectedFile ??
                          fileInputRef.current?.files?.[0] ??
                          null;
                        if (f) {
                          await connect({ kind: 'sqlite', file: f });
                          onOpenGraph();
                          return;
                        }
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
