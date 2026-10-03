import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';

import { lineTypeLabel } from '@mercon/shared-types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { exportFormatsKey } from '@/components/reports/ExportFormatDialog';
import { reportTemplateService, type ReportTemplateSummary } from '@/services/reportTemplateService';

/**
 * Downloads the invoice's trips in the customer's own Excel layout — the trip
 * list many customers want alongside the invoice. Formats are set up on the
 * customer page (Customer → Excel exports); only trips formats apply here.
 */
export function InvoiceTripSheetButton({ invoiceId, customerId }: { invoiceId: string; customerId: string }) {
  const enabled = useModuleEnabled('company-reports');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: allFormats, isError } = useQuery({
    queryKey: exportFormatsKey(customerId),
    queryFn: () => reportTemplateService.list(customerId),
    enabled,
  });
  const formats = allFormats?.filter((f) => f.source === 'trips');

  if (!enabled || isError || !formats) return null;

  if (formats.length === 0) {
    return (
      <Link to={`/customers/${customerId}?tab=exports`} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
        + Add a trip sheet format for this customer
      </Link>
    );
  }

  const download = async (t: ReportTemplateSummary) => {
    setBusyId(t.id);
    try {
      await reportTemplateService.download(t.id, { invoiceId });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.userMessage || 'Could not build the trip sheet');
    } finally {
      setBusyId(null);
    }
  };

  const icon = busyId ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />;

  if (formats.length === 1) {
    return (
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={!!busyId} onClick={() => download(formats[0])} title={`Download in “${formats[0].name}”`}>
        {icon} Trip sheet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={!!busyId}>
          {icon} Trip sheet <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => download(t)} className="flex-col items-start gap-0 text-xs">
            <span className="font-medium">{t.name}</span>
            <span className="text-[11px] text-muted-foreground">{t.rate_category ? `${lineTypeLabel(t.rate_category)} trips only` : 'All trips on the invoice'}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
