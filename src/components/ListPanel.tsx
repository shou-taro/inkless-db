import type { ReactNode } from 'react';

type ListPanelProps = {
  title: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function ListPanel({
  title,
  right,
  className,
  children,
}: ListPanelProps) {
  return (
    <div
      className={`mt-2 overflow-hidden rounded-lg border border-dashed border-zinc-200 bg-zinc-50 ${className ?? ''}`}
    >
      <div className="flex items-center justify-between bg-zinc-100/60 px-2.5 py-1.5 text-xs font-semibold text-zinc-700">
        <span>{title}</span>
        {right ? <span className="ml-2">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}
