import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Page numbers to show: first, last, and two either side of the current page. */
function pageList(page: number, total: number): Array<number | '…'> {
  const out: Array<number | '…'> = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  pageSizes: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}

export default function Pager({ page, pageSize, total, noun, pageSizes, onPageChange, onPageSizeChange, className }: PagerProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const btn = 'h-7 min-w-7 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default';

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400', className)}>
      <div className="flex items-center gap-2">
        <span>{from}–{to} of {total} {noun}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-7 w-auto gap-1 text-[11px] font-semibold rounded-md border-slate-200 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{s} per page</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={cn(btn, 'hover:bg-slate-100 dark:hover:bg-slate-800')} disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {pageList(page, totalPages).map((p, i) => p === '…' ? (
            <span key={`gap-${i}`} className="px-1">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(btn, p === page ? 'bg-charcoal text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300')}
            >
              {p}
            </button>
          ))}
          <button type="button" className={cn(btn, 'hover:bg-slate-100 dark:hover:bg-slate-800')} disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
