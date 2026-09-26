import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BellRing, CalendarClock, Download, FileText, HandCoins, MoreHorizontal, Printer, ScrollText, Users } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import {
  AgeingFilterBar, AgeingForecast, AgeingSummary, AgeingToolbar, DocumentAgeingTable, PartyAgeingTable,
  PartyContact, SelectionBar, advanceInsight, dueThisWeekInsight, oldestOverdueInsight, type AgeingInsight, type AgeingView,
} from '@/components/finance/ageing';
import { CustomerStatementSheet, ReminderSheet, useCollectionHealthFigures, type ReminderCustomer } from '@/components/finance/receivables';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { SettlementSheet } from '@/components/finance/settlement/SettlementSheet';
import { useAgeingUrlState } from '@/hooks/useAgeingUrlState';
import { useAgeingWorkspace } from '@/hooks/useAgeingWorkspace';
import { financeService, type AgeingRow } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import type { AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';

type View = 'customer' | 'invoice' | 'forecast';

const exportColumns: ExportColumn<AgeingRow>[] = [
  { id: 'party_name', label: 'Customer', accessor: (r) => r.party_name },
  { id: 'current', label: 'Current (SAR)', accessor: (r) => formatMoney(r.current) },
  { id: 'days_1_30', label: '1–30 days (SAR)', accessor: (r) => formatMoney(r.days_1_30) },
  { id: 'days_31_60', label: '31–60 days (SAR)', accessor: (r) => formatMoney(r.days_31_60) },
  { id: 'days_61_90', label: '61–90 days (SAR)', accessor: (r) => formatMoney(r.days_61_90) },
  { id: 'days_90_plus', label: '90+ days (SAR)', accessor: (r) => formatMoney(r.days_90_plus) },
  { id: 'total', label: 'Total (SAR)', accessor: (r) => formatMoney(r.total) },
];

export default function ARAgeingPage() {
  const navigate = useNavigate();
  const url = useAgeingUrlState<View>('customer');
  const filters = useMemo(() => ({ bucket: url.bucket, overdueOnly: url.overdueOnly, search: url.search }), [url.bucket, url.overdueOnly, url.search]);
  const ws = useAgeingWorkspace('receivables', { asOf: url.asOf, basis: url.basis, filters, sort: url.sort });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [collectFor, setCollectFor] = useState<string | null>(null);
  const [remindFor, setRemindFor] = useState<ReminderCustomer | null>(null);
  const [statementFor, setStatementFor] = useState<string | null>(null);

  const { data: advancesRes } = useQuery({
    queryKey: ['advances', 'Customer'],
    queryFn: () => financeService.getAdvances({ party_type: 'Customer', direction: 'Received' }),
  });
  const { data: company } = useQuery({ queryKey: ['settings', 'public'], queryFn: () => settingsService.getPublic() });
  const companyName = company?.companyLegalName || company?.appName || '';

  const rowById = useMemo(() => new Map(ws.rows.map((r) => [r.party_id, r])), [ws.rows]);
  const customerOf = (partyId: string): ReminderCustomer => {
    const r = rowById.get(partyId);
    return { id: partyId, name: r?.party_name ?? '', phone: r?.party?.phone, email: r?.party?.email };
  };
  const remind = (partyId: string) => setRemindFor(customerOf(partyId));

  const insights = [
    oldestOverdueInsight(ws.docs, { label: 'Send reminder', run: (d) => remind(d.party_id) }),
    dueThisWeekInsight(ws.docs, url.asOf, 'invoice', { label: 'See forecast', run: () => url.set('view', 'forecast') }),
    advanceInsight(advancesRes?.data ?? [], 'in customer advances not yet applied', {
      label: 'Apply advance',
      run: (a) => navigate(`/finance/advances/${a.id}`),
    }),
  ].filter((i): i is AgeingInsight => i !== null);

  const healthFigures = useCollectionHealthFigures(ws.rows, ws.docs, ws.priorRows, url.asOf);

  const views: AgeingView<View>[] = [
    { key: 'customer', label: 'By customer', icon: Users, count: ws.rows.length },
    { key: 'invoice', label: 'By invoice', icon: FileText, count: ws.counts.total },
    { key: 'forecast', label: 'Collection forecast', icon: CalendarClock },
  ];

  const selectedDocs = ws.filteredDocs.filter((d) => selected.has(d.id));
  const selectedCustomers = new Set(selectedDocs.map((d) => d.party_id));

  const filterBar = (placeholder: string, withSort: boolean) => (
    <AgeingFilterBar
      search={url.search}
      onSearch={(v) => url.set('search', v)}
      placeholder={placeholder}
      overdueOnly={url.overdueOnly}
      onOverdueOnly={(v) => url.set('overdue_only', v ? 'true' : null)}
      sort={withSort ? url.sort : undefined}
      onSort={withSort ? (v) => url.set('sort', v) : undefined}
      partyNoun="Customer"
    />
  );

  const documentAction = (d: AgeingDocument) => (
    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCollectFor(d.party_id)}>Collect</Button>
  );

  return (
    <DashboardLayout active="finance" title="AR Ageing" fixedViewport>
      <div className="fin-report mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <AgeingToolbar
          views={views}
          view={url.view}
          onViewChange={(v) => url.set('view', v)}
          asOf={url.asOf}
          onAsOfChange={(d) => url.set('as_of', d)}
          basis={url.basis}
          onBasisChange={(b) => url.set('basis', b)}
          documentDateLabel="Invoice date"
          actions={
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
                <Download className="size-3.5" /> Export
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
                <Printer className="size-3.5" /> Print
              </Button>
              <Button size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => setCollectFor('')}>
                <HandCoins className="size-3.5" /> Collect payment
              </Button>
            </>
          }
        />

        <AgeingSummary
          totalLabel="Receivables"
          grandTotal={ws.grandTotal}
          counts={ws.counts}
          documentNoun="invoices"
          asOf={url.asOf}
          priorTotal={ws.priorTotal}
          active={url.bucket}
          onToggle={(b) => url.set('bucket', b)}
          figures={healthFigures}
          insights={insights}
        />

        <ReportViewState
          isLoading={ws.isLoading}
          isError={ws.isError}
          onRetry={() => ws.refetch()}
          isEmpty={ws.rows.length === 0}
          emptyTitle={`No open receivables as of ${formatDate(url.asOf)}`}
          emptyDescription="Every customer invoice is paid."
        >
          {url.view === 'customer' && (
            <PartyAgeingTable
              rows={ws.filteredRows}
              grandTotal={ws.grandTotal}
              documentsByParty={ws.docsByParty}
              partyNoun="Customer"
              documentNoun="invoices"
              documentDateLabel="Invoice date"
              toolbar={filterBar('Search customers…', true)}
              renderPartyHover={(r) => (
                <PartyContact
                  row={r}
                  prior={ws.priorTotals.get(r.party_id)}
                  links={[
                    { label: 'Customer record', to: `/customers/${r.party_id}` },
                    { label: 'Invoices', to: '/finance/invoices' },
                  ]}
                />
              )}
              renderRowActions={(r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCollectFor(r.party_id)}>Collect</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`More actions for ${r.party_name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => remind(r.party_id)} className="gap-2 text-xs">
                        <BellRing className="size-3.5" /> Send reminder
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatementFor(r.party_id)} className="gap-2 text-xs">
                        <ScrollText className="size-3.5" /> Statement
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              renderDocumentAction={documentAction}
            />
          )}

          {url.view === 'invoice' && (
            <DocumentAgeingTable
              docs={ws.filteredDocs}
              selected={selected}
              onSelectedChange={setSelected}
              partyNoun="Customer"
              documentDateLabel="Invoice date"
              toolbar={
                <>
                  {filterBar('Search invoice ref or customer…', false)}
                  <SelectionBar docs={selectedDocs}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={selectedCustomers.size !== 1}
                      title={selectedCustomers.size > 1 ? 'Select invoices of one customer' : undefined}
                      onClick={() => remind(selectedDocs[0].party_id)}
                    >
                      <BellRing className="size-3.5" /> Remind
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 bg-brand text-xs text-white hover:bg-brand-hover"
                      disabled={selectedCustomers.size !== 1}
                      title={selectedCustomers.size > 1 ? 'Select invoices of one customer' : undefined}
                      onClick={() => setCollectFor(selectedDocs[0].party_id)}
                    >
                      Collect
                    </Button>
                  </SelectionBar>
                </>
              }
              renderAction={documentAction}
            />
          )}

          {url.view === 'forecast' && (
            <AgeingForecast side="receivables" docs={ws.docs} asOf={url.asOf} basis={url.basis} startCash={ws.cashOnHand} />
          )}
        </ReportViewState>
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export AR ageing"
        filteredData={ws.filteredRows}
        columns={exportColumns}
        fileNamePrefix={`AR_Ageing_${url.asOf}`}
      />

      <SettlementSheet
        mode="collect"
        open={collectFor !== null}
        onOpenChange={(o) => !o && setCollectFor(null)}
        documents={ws.docs}
        initialPartyId={collectFor ?? undefined}
        onSuccess={() => {
          setSelected(new Set());
          ws.refetch();
        }}
      />

      <ReminderSheet
        open={remindFor !== null}
        onOpenChange={(o) => !o && setRemindFor(null)}
        customer={remindFor}
        docs={remindFor ? ws.docsByParty.get(remindFor.id) ?? [] : []}
        asOf={url.asOf}
        companyName={companyName}
        bankAccounts={ws.bankAccounts}
      />

      <CustomerStatementSheet
        open={statementFor !== null}
        onOpenChange={(o) => !o && setStatementFor(null)}
        customerId={statementFor}
        asOf={url.asOf}
      />
    </DashboardLayout>
  );
}
