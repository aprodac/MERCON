import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, FileText, Lock, MoreHorizontal,
  Plus, RotateCcw, Trash2, ExternalLink, Truck, User as UserIcon, Building2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDocDate, resolveFileUrl } from '@/lib/documents';
import { ROW_STATE_STYLE, VERIFICATION_STYLE, relativeExpiry, daysUntilPurge, type RowState } from '@/lib/documentLibrary';
import type { DocStatus } from '@/services/documentService';

export interface DocTableRow {
  /** Document id, or `missing:<ownerId>:<typeId>` for a mandatory slot with nothing uploaded. */
  key: string;
  docId: string | null;
  typeId: string | null;
  typeName: string;
  number: string | null;
  ownerType: string;
  ownerId: string;
  ownerName: string;
  ownerSub: string | null;
  expiry: string | null;
  days: number | null;
  state: RowState;
  verification: DocStatus | null;
  uploadedAt: string | null;
  deletedAt?: string | null;
  fileUrl?: string | null;
  isConfidential?: boolean;
  /** Older copies exist (renewed before). */
  versionCount?: number;
}

type SortKey = 'document' | 'owner' | 'expiry' | 'uploaded';

const PAGE_SIZE = 20;

const OWNER_ICON: Record<string, React.ElementType> = { Vehicle: Truck, Driver: UserIcon };

interface DocumentsTableProps {
  rows: DocTableRow[];
  mode?: 'live' | 'deleted';
  ownerLabel: string;
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onPreview?: (docId: string) => void;
  onOpen?: (docId: string) => void;
  onOpenOwner?: (row: DocTableRow) => void;
  onUploadMissing?: (row: DocTableRow) => void;
  onDelete?: (docId: string) => void;
  onRestore?: (docId: string) => void;
  onPurge?: (docId: string) => void;
  emptyText: string;
}

export default function DocumentsTable({
  rows, mode = 'live', ownerLabel, selected, onSelectionChange, onPreview, onOpen, onOpenOwner,
  onUploadMissing, onDelete, onRestore, onPurge, emptyText,
}: DocumentsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(
    mode === 'deleted' ? { key: 'uploaded', dir: -1 } : { key: 'expiry', dir: 1 },
  );
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [rows]);

  const sorted = useMemo(() => {
    const val = (r: DocTableRow): string | number => {
      switch (sort.key) {
        case 'document': return r.typeName.toLowerCase();
        case 'owner': return r.ownerName.toLowerCase();
        // Missing first, then soonest expiry; no-expiry documents last.
        case 'expiry': return r.state === 'missing' ? -1e9 : r.days ?? 1e9;
        case 'uploaded': return new Date((mode === 'deleted' ? r.deletedAt : r.uploadedAt) || 0).getTime();
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [rows, sort, mode]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectableIds = useMemo(() => rows.map((r) => r.docId).filter((id): id is string => !!id), [rows]);
  const selectedHere = selectableIds.filter((id) => selected.has(id)).length;
  const allState: boolean | 'indeterminate' = selectedHere === 0 ? false : selectedHere === selectableIds.length ? true : 'indeterminate';

  const toggleAll = () => {
    const next = new Set(selected);
    if (allState === true) selectableIds.forEach((id) => next.delete(id));
    else selectableIds.forEach((id) => next.add(id));
    onSelectionChange(next);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn('px-3 py-2 font-semibold text-left', className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-14 flex flex-col items-center gap-2 text-center">
        <FileText className="w-7 h-7 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="pl-3 pr-1 py-2 w-8">
                <Checkbox
                  checked={allState}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-charcoal data-[state=checked]:border-charcoal data-[state=checked]:text-white data-[state=indeterminate]:bg-charcoal data-[state=indeterminate]:text-white"
                />
              </th>
              {header('document', 'Document')}
              {header('owner', ownerLabel)}
              {header('expiry', 'Expiry')}
              <th className="px-3 py-2 font-semibold text-left">Check</th>
              {header('uploaded', mode === 'deleted' ? 'Deleted' : 'Uploaded', 'hidden md:table-cell')}
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pageRows.map((r) => {
              const st = ROW_STATE_STYLE[r.state];
              const isMissing = r.state === 'missing';
              const isSel = !!r.docId && selected.has(r.docId);
              const OwnerIcon = OWNER_ICON[r.ownerType] ?? Building2;
              return (
                <tr
                  key={r.key}
                  onClick={() => {
                    if (isMissing) onUploadMissing?.(r);
                    // Deleted documents can't be opened in the app; show the file itself.
                    else if (mode === 'deleted') { if (r.fileUrl) window.open(resolveFileUrl(r.fileUrl), '_blank', 'noopener'); }
                    else if (r.docId) onOpen?.(r.docId);
                  }}
                  className={cn(
                    'group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    isSel && 'bg-slate-100/70 dark:bg-slate-800/70',
                  )}
                >
                  <td className="pl-3 pr-1 py-2" onClick={(e) => e.stopPropagation()}>
                    {r.docId && (
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggle(r.docId!)}
                        aria-label={`Select ${r.typeName}`}
                        className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-charcoal data-[state=checked]:border-charcoal data-[state=checked]:text-white"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', st.dot)} />
                      <div className="min-w-0">
                        <div className={cn('font-semibold truncate flex items-center gap-1', isMissing ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100')}>
                          {r.typeName}
                          {r.isConfidential && <Lock className="w-3 h-3 text-amber-600 shrink-0" aria-label="Confidential" />}
                          {!!r.versionCount && r.versionCount > 1 && (
                            <span className="text-[10px] font-medium text-slate-400 shrink-0">v{r.versionCount}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">{isMissing ? 'Not uploaded' : r.number || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 min-w-[150px]">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenOwner?.(r); }}
                      className={cn('flex items-center gap-1.5 text-left min-w-0', onOpenOwner && 'hover:text-[#FA634E]')}
                    >
                      <OwnerIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-800 dark:text-slate-200 truncate">{r.ownerName}</span>
                        {r.ownerSub && <span className="block text-[11px] text-slate-400 truncate">{r.ownerSub}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isMissing ? (
                      <span className="font-semibold text-slate-400">Missing</span>
                    ) : r.expiry ? (
                      <>
                        <div className="font-medium text-slate-700 dark:text-slate-300">{formatDocDate(r.expiry)}</div>
                        <div className={cn('text-[11px] font-semibold', st.text)}>{relativeExpiry(r.days)}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">No expiry</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {!isMissing && r.verification && (
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', VERIFICATION_STYLE[r.verification].className)}>
                        {VERIFICATION_STYLE[r.verification].label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500 hidden md:table-cell">
                    {mode === 'deleted' && r.deletedAt ? (
                      <>
                        <div>{formatDocDate(r.deletedAt)}</div>
                        <div className="text-[11px] text-slate-400">Removed for good in {daysUntilPurge(r.deletedAt)}d</div>
                      </>
                    ) : r.uploadedAt ? formatDocDate(r.uploadedAt) : ''}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {isMissing ? (
                      onUploadMissing && (
                        <Button size="sm" variant="outline" onClick={() => onUploadMissing(r)} className="h-7 px-2.5 text-[11px] font-bold gap-1 rounded-full border-[#FA634E]/40 text-[#FA634E] hover:bg-[#FA634E]/5">
                          <Plus className="w-3 h-3" /> Upload
                        </Button>
                      )
                    ) : mode === 'deleted' ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => onRestore?.(r.docId!)} className="h-7 px-2.5 text-[11px] font-bold gap-1 rounded-full">
                          <RotateCcw className="w-3 h-3" /> Restore
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onPurge?.(r.docId!)} className="h-7 w-7 text-slate-400 hover:text-rose-600" aria-label="Delete for good" title="Delete for good">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                        <Button size="icon" variant="ghost" onClick={() => onPreview?.(r.docId!)} className="h-7 w-7" aria-label="Quick look" title="Quick look">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="More actions">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => onOpen?.(r.docId!)} className="text-xs gap-2">
                              <ExternalLink className="w-3.5 h-3.5" /> Open details
                            </DropdownMenuItem>
                            {r.fileUrl && (
                              <DropdownMenuItem asChild className="text-xs gap-2">
                                <a href={resolveFileUrl(r.fileUrl)} download target="_blank" rel="noreferrer">
                                  <Download className="w-3.5 h-3.5" /> Download
                                </a>
                              </DropdownMenuItem>
                            )}
                            {onDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDelete(r.docId!)} className="text-xs gap-2 text-rose-600 focus:text-rose-600">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(sorted.length, page * PAGE_SIZE)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="px-1 font-semibold text-slate-700 dark:text-slate-300">{page} / {totalPages}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
