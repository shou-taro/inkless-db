import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type ColumnRow = {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  defaultValue: string;
};

type FKRow = {
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL';
  onUpdate: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL';
};

const SQLITE_TYPES = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];

export function TableCreateDialog({
  open,
  onOpenChange,
  onCreated,
  existingTables = [],
  driver = 'sqlite',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (tableName: string) => void;
  existingTables?: string[];
  driver?: 'sqlite' | 'postgres' | 'mysql';
}) {
  const [tableName, setTableName] = React.useState('new_table');
  const [cols, setCols] = React.useState<ColumnRow[]>([
    {
      name: 'id',
      type: 'INTEGER',
      pk: true,
      notNull: true,
      unique: false,
      defaultValue: '',
    },
  ]);
  const [fks, setFks] = React.useState<FKRow[]>([]);

  const typeOptions = SQLITE_TYPES; // TODO: driver に応じて切替

  const errors = React.useMemo(() => {
    const e: string[] = [];
    if (!tableName.trim()) e.push('Table name is required.');
    if (existingTables.includes(tableName))
      e.push(`Table "${tableName}" already exists.`);
    const names = cols.map((c) => c.name.trim());
    if (names.some((n) => !n)) e.push('Column name cannot be empty.');
    const dup = names.filter((n, i) => n && names.indexOf(n) !== i);
    if (dup.length)
      e.push(`Duplicate columns: ${[...new Set(dup)].join(', ')}`);
    return e;
  }, [tableName, cols, existingTables]);

  const createSQL = React.useMemo(() => {
    if (errors.length) return '-- fix errors to preview SQL';
    const defs = cols.map((c) => {
      const parts = [`"${c.name}"`, c.type];
      if (c.pk) parts.push('PRIMARY KEY');
      if (c.notNull) parts.push('NOT NULL');
      if (c.unique) parts.push('UNIQUE');
      if (c.defaultValue)
        parts.push(
          `DEFAULT ${needsQuotes(c.type) ? `'${c.defaultValue}'` : c.defaultValue}`
        );
      return parts.join(' ');
    });
    const fkClauses = fks
      .filter((f) => f.column && f.refTable && f.refColumn)
      .map(
        (f) =>
          `FOREIGN KEY ("${f.column}") REFERENCES "${f.refTable}"("${f.refColumn}") ON DELETE ${f.onDelete} ON UPDATE ${f.onUpdate}`
      );
    const body = [...defs, ...fkClauses].join(',\n  ');
    return `CREATE TABLE "${tableName}" (\n  ${body}\n);`;
  }, [cols, fks, tableName, errors]);

  const onSubmit = async () => {
    if (errors.length) {
      toast.error(
        <span>
          Cannot create table.
          <br />
          {errors[0]}
        </span>
      );
      return;
    }
    try {
      // TODO: Tauri invoke('create_table', { sql: createSQL })
      console.log(createSQL);
      toast.success(`Created "${tableName}"`);
      onCreated?.(tableName);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(
        <span>
          Failed to create table.
          <br />
          {String(err?.message || err)}
        </span>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="text-violet-700">
            Create new table
          </DialogTitle>
          <DialogDescription>
            Define table name, columns, and optional relations.
          </DialogDescription>
        </DialogHeader>

        {/* Table name & driver */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label htmlFor="table-name">Table name</Label>
            <Input
              id="table-name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
          </div>
          <div>
            <Label>Driver</Label>
            <Input value={driver} readOnly />
          </div>
        </div>

        {/* Columns */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-700">Columns</div>
            <Button variant="secondary" onClick={addCol}>
              + Add column
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-center">PK</th>
                  <th className="px-3 py-2 text-center">Not null</th>
                  <th className="px-3 py-2 text-center">Unique</th>
                  <th className="px-3 py-2">Default</th>
                  <th className="w-20 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cols.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1">
                      <Input
                        value={c.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1">
                      <Select
                        value={c.type}
                        onValueChange={(v) => update(i, { type: v })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {typeOptions.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1 text-center">
                      <Checkbox
                        checked={c.pk}
                        onCheckedChange={(v) => update(i, { pk: Boolean(v) })}
                      />
                    </td>
                    <td className="px-3 py-1 text-center">
                      <Checkbox
                        checked={c.notNull}
                        onCheckedChange={(v) =>
                          update(i, { notNull: Boolean(v) })
                        }
                      />
                    </td>
                    <td className="px-3 py-1 text-center">
                      <Checkbox
                        checked={c.unique}
                        onCheckedChange={(v) =>
                          update(i, { unique: Boolean(v) })
                        }
                      />
                    </td>
                    <td className="px-3 py-1">
                      <Input
                        placeholder={needsQuotes(c.type) ? `'text'` : `0`}
                        value={c.defaultValue}
                        onChange={(e) =>
                          update(i, { defaultValue: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-1 text-right">
                      <Button variant="outline" onClick={() => removeCol(i)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Foreign keys (optional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-700">
              Relations (optional)
            </div>
            <Button variant="secondary" onClick={addFk}>
              + Add relation
            </Button>
          </div>

          {fks.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-zinc-500">
              No relations.
            </div>
          ) : (
            <div className="space-y-2">
              {fks.map((f, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-3">
                    <Label>Column</Label>
                    <Select
                      value={f.column}
                      onValueChange={(v) => updateFk(i, { column: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="(select column)" />
                      </SelectTrigger>
                      <SelectContent>
                        {cols.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label>Reference table</Label>
                    <Input
                      value={f.refTable}
                      onChange={(e) =>
                        updateFk(i, { refTable: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Reference column</Label>
                    <Input
                      value={f.refColumn}
                      onChange={(e) =>
                        updateFk(i, { refColumn: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>ON DELETE</Label>
                    <Select
                      value={f.onDelete}
                      onValueChange={(v) => updateFk(i, { onDelete: v as any })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'].map(
                          (v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>ON UPDATE</Label>
                    <Select
                      value={f.onUpdate}
                      onValueChange={(v) => updateFk(i, { onUpdate: v as any })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'].map(
                          (v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 text-right">
                    <Button variant="outline" onClick={() => removeFk(i)}>
                      Remove relation
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SQL preview */}
        <div>
          <Label>SQL preview</Label>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
            {createSQL}
          </pre>
          {errors.length > 0 && (
            <p className="mt-2 text-xs text-rose-600">• {errors[0]}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function addCol() {
    setCols((a) => [
      ...a,
      {
        name: '',
        type: typeOptions[0],
        pk: false,
        notNull: false,
        unique: false,
        defaultValue: '',
      },
    ]);
  }
  function removeCol(i: number) {
    setCols((a) => a.filter((_, idx) => idx !== i));
  }
  function addFk() {
    setFks((a) => [
      ...a,
      {
        column: '',
        refTable: '',
        refColumn: 'id',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    ]);
  }
  function removeFk(i: number) {
    setFks((a) => a.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<ColumnRow>) {
    setCols((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function updateFk(i: number, patch: Partial<FKRow>) {
    setFks((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
}

function needsQuotes(type: string) {
  return /TEXT|CHAR|CLOB|DATE|TIME|DATETIME/i.test(type);
}
