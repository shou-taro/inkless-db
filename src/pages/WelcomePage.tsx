import { useRef, useState } from 'react';
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
import { Upload } from 'lucide-react';
import { Toaster, toast } from 'sonner';

export default function WelcomePage() {
  const [sqlitePath, setSqlitePath] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFile = (f: File) => {
    const name = f.name || '';
    const ok = /\.(sqlite|db)$/i.test(name);
    if (!ok) {
      // reset and show toast error
      setSqlitePath('');
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
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
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
          <p className="text-muted-foreground text-lg italic">
            Manage your databases without writing queries.
          </p>
        </div>
      </div>
      <div className="bg-background h-full flex-1 overflow-y-auto p-6">
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
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      className={`h-52 overflow-hidden rounded border-2 border-dashed p-6 text-center transition ${isDragging ? 'border-primary bg-muted' : 'border-muted-foreground/25'}`}
                    >
                      {sqlitePath ? (
                        <div className="flex h-full flex-col items-center justify-center">
                          <p
                            className="text-muted-foreground mt-1 text-xs"
                            aria-live="polite"
                          >
                            Selected:{' '}
                            <span className="text-foreground font-medium">
                              {sqlitePath}
                            </span>
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            className="mt-6 bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                            onClick={onBrowseClick}
                          >
                            Choose another file
                          </Button>
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
                          <p className="text-muted-foreground mt-6 py-0.5 text-xs">
                            Drag & drop a .sqlite / .db file, or
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            className="mt-3 bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                            onClick={onBrowseClick}
                          >
                            Choose file
                          </Button>
                        </>
                      )}
                      <input
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
                    variant="outline"
                    className="border-[#a78bfa] text-[#7c3aed] hover:bg-[#a78bfa]/10 hover:text-[#7c3aed] active:text-[#7c3aed]"
                    disabled={!sqlitePath}
                    onClick={() => {
                      setSqlitePath('');
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                  >
                    Clear selection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[#a78bfa] text-white hover:bg-[#8b5cf6]"
                    disabled={!sqlitePath}
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
