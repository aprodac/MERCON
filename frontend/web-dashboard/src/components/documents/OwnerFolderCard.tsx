import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, FileQuestion, ChevronRight, Truck, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DriverAvatar from '@/components/ui/DriverAvatar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DocComplianceStatus, OwnerFoldersSummaryRow } from '@/services/documentService';
import { daysUntil, formatDocDate, getOwnerCardSummary } from '@/lib/documents';

const STATUS_ICON: Record<DocComplianceStatus, { label?: string; icon: any; iconClass: string; textClass: string }> = {
  VALID:          { label: 'Valid', icon: CheckCircle2, iconClass: 'text-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400 font-bold' },
  EXPIRING_SOON:  { label: 'Expiring Soon', icon: AlertTriangle, iconClass: 'text-amber-500', textClass: 'text-amber-600 dark:text-amber-400 font-bold' },
  EXPIRED:        { label: 'Expired', icon: XCircle, iconClass: 'text-rose-500', textClass: 'text-rose-500 dark:text-rose-400 font-extrabold' },
  MISSING:        { label: 'Missing', icon: FileQuestion, iconClass: 'text-slate-400', textClass: 'text-slate-400 font-medium' },
};

interface OwnerFolderCardProps {
  row: OwnerFoldersSummaryRow;
  onOpen: () => void;
  /** Clicking a slot that already has a document previews it directly, without leaving the page. */
  onPreviewDocument?: (documentId: string) => void;
  /** Clicking a Missing slot opens the upload flow directly, without leaving the page. */
  onUploadMissing?: (row: OwnerFoldersSummaryRow, slotCode: string) => void;
  /** Selection for bulk actions; the checkbox only shows when onToggleSelect is given. */
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Slot to emphasise when the list is filtered by one document type. */
  highlightTypeId?: string | null;
}

export default function OwnerFolderCard({ row, onOpen, onPreviewDocument, onUploadMissing, selected, onToggleSelect, highlightTypeId }: OwnerFolderCardProps) {
  const { slots: mandatorySlots } = row;
  const cardSummary = getOwnerCardSummary(mandatorySlots);
  
  const title = row.ownerName;
  const subtitle = row.ownerType === 'Driver'
    ? [row.ownerRef, row.relatedName ? `Truck: ${row.relatedName}` : null].filter(Boolean).join(' · ') || 'No ref'
    : [row.ownerRef, row.relatedName ? `Driver: ${row.relatedName}` : null].filter(Boolean).join(' · ') || 'No ref';

  // Compute theme matching the second uploaded image
  const folderTheme = (() => {
    const hasExpired = mandatorySlots.some((s) => s.status === 'EXPIRED');
    const hasExpiring = mandatorySlots.some((s) => s.status === 'EXPIRING_SOON');
    const hasMissing = mandatorySlots.some((s) => s.status === 'MISSING');

    if (hasExpired || hasMissing) {
      return {
        tabBg: "bg-[#FFE8E8] dark:bg-rose-950/40 border-rose-250/80 dark:border-rose-800",
        cardBorder: "border-slate-200/80 dark:border-slate-800 group-hover:border-rose-300 dark:group-hover:border-rose-700",
        iconBg: "bg-[#FFE8E8] text-[#FA4D56] border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-400",
        badgeClass: "bg-[#FFEAEA] text-[#FA4D56] border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-400 font-bold",
        footerLink: "text-[#FA634E] hover:text-[#FA634E]/90",
        isCompliant: false,
      };
    }
    if (hasExpiring) {
      return {
        tabBg: "bg-[#FFF4E5] dark:bg-amber-950/40 border-amber-250/80 dark:border-amber-800",
        cardBorder: "border-slate-200/80 dark:border-slate-800 group-hover:border-amber-300 dark:group-hover:border-amber-700",
        iconBg: "bg-[#FFF4E5] text-amber-600 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-400",
        badgeClass: "bg-[#FFF4E5] text-amber-700 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-400 font-bold",
        footerLink: "text-amber-600 hover:text-amber-700",
        isCompliant: false,
      };
    }
    return {
      tabBg: "bg-[#E2F6EC] dark:bg-emerald-950/40 border-emerald-250/80 dark:border-emerald-800",
      cardBorder: "border-slate-200/80 dark:border-slate-800 group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
      iconBg: "bg-[#E2F6EC] text-[#10B981] border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-400",
      badgeClass: "bg-[#E6F7F0] text-[#10B981] border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold",
      footerLink: "text-emerald-600 hover:text-emerald-700",
      isCompliant: true,
    };
  })();

  return (
    <div className="relative mt-3.5 group">
      {/* Folder Tab Ear (Matching Image 2) */}
      <div
        className={cn(
          "absolute -top-[14px] left-0 h-[15px] w-28 rounded-t-xl border-t border-x z-0 transition-all duration-300",
          folderTheme.tabBg
        )}
      />

      <Card
        onClick={onOpen}
        className={cn(
          'border bg-white dark:bg-slate-900 rounded-2xl rounded-tl-none p-4 shadow-2xs transition-all duration-300 flex flex-col justify-between cursor-pointer group-hover:shadow-xs relative z-10',
          selected ? 'border-charcoal ring-1 ring-charcoal dark:border-slate-300 dark:ring-slate-300' : folderTheme.cardBorder
        )}
      >
        <div className="space-y-3.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {onToggleSelect && (
                <span onClick={(e) => e.stopPropagation()} className="flex">
                  <Checkbox
                    checked={!!selected}
                    onCheckedChange={() => onToggleSelect()}
                    aria-label={`Select ${title}`}
                    className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-charcoal data-[state=checked]:border-charcoal data-[state=checked]:text-white"
                  />
                </span>
              )}
              {row.ownerType === 'Driver' ? (
                <DriverAvatar
                  src={row.avatar_url}
                  firstName={title.split(' ')[0]}
                  lastName={title.split(' ')[1]}
                  size="sm"
                />
              ) : (
                <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', folderTheme.iconBg)}>
                  <Truck className="w-4.5 h-4.5" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">{title}</h4>
                <span className="text-[10px] text-slate-400 font-mono truncate block">{subtitle}</span>
              </div>
            </div>

            <Badge className={cn('text-[10px] font-mono px-2.5 py-0.5 border shrink-0 rounded-full shadow-none', folderTheme.badgeClass)}>
              {cardSummary.label}
            </Badge>
          </div>

          {/* Slots Checklist (Matching Image 2 light colors) */}
          <div className="space-y-1.5 pt-1">
            {mandatorySlots.map((slot) => {
              const cfg = STATUS_ICON[slot.status];
              const Icon = cfg.icon;
              const hasDoc = !!slot.documentId;
              const formattedDate = slot.expiry_date ? formatDocDate(slot.expiry_date) : null;

              const getStatusText = () => {
                if (slot.status === 'MISSING') return 'Missing';
                if (slot.status === 'VALID') return 'Valid';
                if (slot.status === 'EXPIRING_SOON') {
                  const d = daysUntil(slot.expiry_date);
                  return d !== null && d > 0 ? `${d}d left` : 'Expiring';
                }
                if (slot.status === 'EXPIRED') return 'Expired';
                return 'Valid';
              };

              return (
                <div
                  key={slot.code}
                  title={formattedDate ? `Expiry: ${formattedDate}` : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasDoc) onPreviewDocument?.(slot.documentId!);
                    else onUploadMissing?.(row, slot.code);
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 text-[11px] -mx-1 px-1 py-0.5 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    highlightTypeId && slot.documentTypeId !== highlightTypeId && 'opacity-40',
                  )}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Icon className={cn('w-3.5 h-3.5 shrink-0', cfg.iconClass)} />
                    <span className="truncate text-slate-700 dark:text-slate-300 font-medium text-[11px]">{slot.name}</span>
                  </span>
                  {slot.status === 'MISSING' && onUploadMissing ? (
                    <span className="shrink-0 text-[11px] font-bold text-[#FA634E] flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> Upload
                    </span>
                  ) : (
                    <span className={cn('shrink-0 text-[11px]', cfg.textClass)}>
                      {getStatusText()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end text-xs">
          <span className={cn("text-xs font-extrabold flex items-center gap-1 transition-colors", folderTheme.footerLink)}>
            <span>Open Folder</span>
            <ChevronRight size={12} />
          </span>
        </div>
      </Card>
    </div>
  );
}
