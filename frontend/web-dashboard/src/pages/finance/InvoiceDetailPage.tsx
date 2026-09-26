import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { asOfPresetDate } from '@/components/finance/kit/AsOfControl';
import { InvoiceRecord } from '@/components/finance/invoices/InvoiceRecord';
import { useInvoiceWorkflow } from '@/components/finance/invoices/useInvoiceWorkflow';

/** One invoice on its own page — the same record as the list's side panel, for sharing a link. */
export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { run, sheets, busy } = useInvoiceWorkflow({ onDeleted: () => navigate('/finance/invoices') });

  return (
    <DashboardLayout active="finance" title="Invoice" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <Link to="/finance/invoices" className="inline-flex w-fit shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Invoices
        </Link>
        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-xl py-0 shadow-xs">
          <InvoiceRecord id={id} today={asOfPresetDate('today')} run={run} busy={busy} />
        </Card>
      </div>
      {sheets}
    </DashboardLayout>
  );
}
