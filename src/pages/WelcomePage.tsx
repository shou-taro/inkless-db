import { useEffect, useRef, useState } from 'react';
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
import { Upload, CheckCircle2, FileText } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useDb } from '@/lib/db/context';

export default function WelcomePage({
  onOpenGraph,
}: {
  onOpenGraph: () => void;
}) {
  const [sqlitePath, setSqlitePath] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { connect } = useDb();

  const formatBytes = (bytes?: number | null) => {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v = v / 1024;
      i++;
    }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  };

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

  const getBaseName = (p: string) => {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || p;
  };

  const handlePath = async (path: string) => {
    const ok = /\.(sqlite|db)$/i.test(path);
    if (!ok) {
      setSqlitePath('');
      setSelectedFile(null);
      setSelectedPath(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.error(
        <span>
          Unsupported file type.
          <br />
          Please select a .sqlite or .db file.
        </span>
      );
      return;
    }
    const name = getBaseName(path);
    setSqlitePath(name);
    setSelectedPath(path);
    setSelectedFile(null);
  };

  const onBrowseClick = async () => {
    // Try Tauri native dialog first; if not available (web/dev) fall back to browser picker
    try {
      const mod = await import('@tauri-apps/plugin-dialog');
      const selected = await mod.open({
        multiple: false,
        directory: false,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      });
      if (typeof selected === 'string') {
        await handlePath(selected);
        return;
      }
      if (Array.isArray(selected) && selected[0]) {
        await handlePath(selected[0] as string);
        return;
      }
      // User cancelled: do nothing
      return;
    } catch (e) {
      // Fallback: some environments block programmatic clicks on fully hidden inputs.
      // Using <label htmlFor> above should already work, but also try programmatic click.
      fileInputRef.current?.click();
    }
  };

  const handleFile = async (f: File) => {
    const name = f.name || '';
    const ok = /\.(sqlite|db)$/i.test(name);
    if (!ok) {
      setSqlitePath('');
      setSelectedFile(null);
      setSelectedPath(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.error(
        <span>
          Unsupported file type.
          <br />
          Please select a .sqlite or .db file.
        </span>
      );
      return;
    }
    setSqlitePath(name);
    setSelectedFile(f);
    setSelectedPath(null);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await handleFile(f);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => {
      const next = d + 1;
      if (next === 1) setIsDragging(true);
      return next;
    });
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => {
      const next = Math.max(0, d - 1);
      if (next === 0) setIsDragging(false);
      return next;
    });
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await handleFile(f);
  };

  return (
    <div className="flex h-screen flex-row items-center justify-center">
      <Toaster richColors position="top-center" closeButton />
      <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#d8b4fe] to-[#a78bfa] text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-60"
          style={{
            backgroundImage: [
              'radial-gradient(circle at 15% 20%, rgba(255,182,193,0.35), transparent 60%)',
              'radial-gradient(circle at 85% 25%, rgba(255,255,153,0.35), transparent 60%)',
              'radial-gradient(circle at 30% 80%, rgba(144,238,144,0.35), transparent 60%)',
              'radial-gradient(circle at 75% 75%, rgba(173,216,230,0.35), transparent 60%)',
              'radial-gradient(rgba(255,255,255,0.4) 2px, transparent 2px)',
            ].join(', '),
            backgroundSize:
              '100% 100%, 100% 100%, 100% 100%, 100% 100%, 20px 20px',
            backgroundPosition: '0 0',
          }}
        />
        <div className="relative z-10">
          <h1 className="mb-4 text-3xl font-bold">Welcome to Inkless DB</h1>
          <p className="text-sm italic text-muted-foreground">
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
                    <div
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      className={`h-52 overflow-hidden rounded border-2 border-dashed p-6 text-center transition ${isDragging || sqlitePath ? 'border-primary/70 bg-muted/60' : 'border-muted-foreground/25'}`}
                    >
                      {sqlitePath ? (
                        <div className="flex h-full flex-col items-center justify-center">
                          <div className="mb-3 flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm shadow-sm ring-1 ring-white/60">
                            <CheckCircle2
                              className="h-4 w-4 text-emerald-600"
                              aria-hidden="true"
                            />
                            <span className="font-medium text-foreground">
                              Ready to open
                            </span>
                          </div>

                          <div
                            className="group mx-auto flex max-w-full items-center gap-2 rounded-md bg-white/70 px-3 py-2 shadow-sm ring-1 ring-white/60"
                            aria-live="polite"
                            title={sqlitePath}
                          >
                            <FileText
                              className="h-4 w-4 opacity-70"
                              aria-hidden="true"
                            />
                            <span className="max-w-[420px] truncate font-medium text-foreground">
                              {sqlitePath}
                            </span>
                            {selectedFile && (
                              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] leading-none text-zinc-700 ring-1 ring-zinc-200">
                                {formatBytes(selectedFile.size)}
                              </span>
                            )}
                            {selectedPath && (
                              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] leading-none text-zinc-700 ring-1 ring-zinc-200">
                                from path
                              </span>
                            )}
                          </div>

                          <div className="mt-5 flex items-center gap-2">
                            <Button
                              asChild
                              type="button"
                              variant="secondary"
                              className="bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                            >
                              <label
                                htmlFor="sqlite-file-input"
                                onClick={onBrowseClick}
                              >
                                Choose another file
                              </label>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-[#a78bfa] text-[#7c3aed] hover:bg-[#a78bfa]/10 hover:text-[#7c3aed]"
                              onClick={() => {
                                setSqlitePath('');
                                setSelectedFile(null);
                                setSelectedPath(null);
                                if (fileInputRef.current)
                                  fileInputRef.current.value = '';
                              }}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mx-auto mb-0.5 flex h-10 w-10 items-center justify-center rounded">
                            <Upload
                              className="h-6 w-6 opacity-70"
                              aria-hidden="true"
                            />
                          </div>
                          <p className="text-sm font-medium">
                            No file selected
                          </p>
                          <p className="mt-6 py-0.5 text-xs text-muted-foreground">
                            Drag & drop a .sqlite / .db file, or
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-600/80">
                            You can also use the button below to pick a file.
                          </p>
                          <Button
                            asChild
                            type="button"
                            variant="secondary"
                            className="mt-3 bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                          >
                            <label
                              htmlFor="sqlite-file-input"
                              onClick={onBrowseClick}
                            >
                              Choose file
                            </label>
                          </Button>
                        </>
                      )}
                      <input
                        id="sqlite-file-input"
                        ref={fileInputRef}
                        type="file"
                        accept=".sqlite,.db"
                        className="hidden"
                        tabIndex={-1}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' || e.key === 'Delete') {
                            e.preventDefault();
                          }
                        }}
                        onChange={onFileChange}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
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
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#a78bfa] text-[#7c3aed] hover:bg-[#a78bfa]/10 hover:text-[#7c3aed] active:text-[#7c3aed]"
                    disabled
                  >
                    Test connection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                    disabled
                  >
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
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#a78bfa] text-[#7c3aed] hover:bg-[#a78bfa]/10 hover:text-[#7c3aed] active:text-[#7c3aed]"
                    disabled
                  >
                    Test connection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                    disabled
                  >
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
