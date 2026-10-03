import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OwnerFolderCard from '@/components/documents/OwnerFolderCard';
import type { OwnerFoldersSummaryRow } from '@/services/documentService';

const ITEMS_PER_ROW = 4;
const INITIAL_BATCH = 12;
const BATCH_INCREMENT = 12;

interface FolderCardSectionProps {
  title: string;
  icon: React.ReactNode;
  noun: string; // "Vehicles" | "Drivers" — used for the "View all N Vehicles" label
  rows: OwnerFoldersSummaryRow[];
  onOpenRow: (row: OwnerFoldersSummaryRow) => void;
  onPreviewDocument: (documentId: string) => void;
  onUploadMissing?: (row: OwnerFoldersSummaryRow, slotCode: string) => void;
  isOverview?: boolean;
  onViewAll?: () => void;
  /** Owner ids currently selected for bulk actions. */
  selectedIds?: Set<string>;
  onToggleSelect?: (row: OwnerFoldersSummaryRow) => void;
  highlightTypeId?: string | null;
}

/**
 * Renders owner folder cards in a grid.
 * In overview mode (isOverview=true), shows strictly 1 row (4 items) with a "View all"
 * button that navigates to the dedicated category page.
 * In category mode (isOverview=false), shows grid with a "Show More" expansion button.
 */
export default function FolderCardSection({
  title,
  icon,
  noun,
  rows,
  onOpenRow,
  onPreviewDocument,
  onUploadMissing,
  isOverview = false,
  onViewAll,
  selectedIds,
  onToggleSelect,
  highlightTypeId,
}: FolderCardSectionProps) {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_BATCH);

  if (rows.length === 0) return null;

  const visibleRows = isOverview
    ? rows.slice(0, ITEMS_PER_ROW)
    : rows.slice(0, visibleLimit);

  const hasMore = !isOverview && rows.length > visibleLimit;
  const isExpanded = !isOverview && visibleLimit > INITIAL_BATCH && visibleLimit >= rows.length;

  return (
    <div className="space-y-3">
      {isOverview && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-wider uppercase flex items-center gap-2">
            {icon}
            <span>{title} ({rows.length} {noun})</span>
          </h3>
          {onViewAll && rows.length > ITEMS_PER_ROW && (
            <button
              onClick={onViewAll}
              className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>View all {noun.toLowerCase()} ({rows.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-7">
        {visibleRows.map((row) => (
          <OwnerFolderCard
            key={row.ownerId}
            row={row}
            onOpen={() => onOpenRow(row)}
            onPreviewDocument={onPreviewDocument}
            onUploadMissing={onUploadMissing}
            selected={selectedIds?.has(row.ownerId)}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(row) : undefined}
            highlightTypeId={highlightTypeId}
          />
        ))}
      </div>

      {!isOverview && (hasMore || isExpanded) && (
        <div className="flex justify-center pt-2">
          {hasMore ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleLimit((prev) => prev + BATCH_INCREMENT)}
              className="h-9 px-5 gap-2 text-xs font-extrabold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-full shadow-2xs cursor-pointer transition-all hover:scale-[1.01]"
            >
              <span>Show More ({rows.length - visibleLimit} remaining)</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleLimit(INITIAL_BATCH)}
              className="h-8 px-4 gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-855 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
            >
              <span>Show Less</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
