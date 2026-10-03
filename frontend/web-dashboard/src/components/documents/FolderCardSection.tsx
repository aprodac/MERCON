import { useEffect, useRef, useState } from 'react';
import OwnerFolderCard from '@/components/documents/OwnerFolderCard';
import Pager from '@/components/documents/center/Pager';
import type { OwnerFoldersSummaryRow } from '@/services/documentService';

const PAGE_SIZES = [12, 24, 48, 96];

interface FolderCardSectionProps {
  noun: string; // "vehicles" | "drivers" — used in "1–12 of 60 vehicles"
  rows: OwnerFoldersSummaryRow[];
  onOpenRow: (row: OwnerFoldersSummaryRow) => void;
  onPreviewDocument: (documentId: string) => void;
  onUploadMissing?: (row: OwnerFoldersSummaryRow, slotCode: string) => void;
  /** Owner ids currently selected for bulk actions. */
  selectedIds?: Set<string>;
  onToggleSelect?: (row: OwnerFoldersSummaryRow) => void;
  highlightTypeId?: string | null;
}

/** Owner folder cards in a grid, a page at a time. */
export default function FolderCardSection({
  noun,
  rows,
  onOpenRow,
  onPreviewDocument,
  onUploadMissing,
  selectedIds,
  onToggleSelect,
  highlightTypeId,
}: FolderCardSectionProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const topRef = useRef<HTMLDivElement>(null);

  // Back to the first page whenever the filters change the list.
  useEffect(() => setPage(1), [rows]);

  if (rows.length === 0) return null;

  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div ref={topRef} className="space-y-4 scroll-mt-4">
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

      <Pager
        page={page}
        pageSize={pageSize}
        total={rows.length}
        noun={noun}
        pageSizes={PAGE_SIZES}
        onPageChange={(p) => { setPage(p); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        className="pt-3 border-t border-slate-200 dark:border-slate-800"
      />
    </div>
  );
}
