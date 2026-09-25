import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Download, FileText, Printer, Users } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import {
  AgeingFilterBar, AgeingForecast, AgeingSummary, AgeingToolbar, DocumentAgeingTable, PartyAgeingTable,
  PartyContact, SelectionBar, advanceInsight, dueThisWeekInsight, oldestOverdueInsight, type AgeingInsight, type AgeingView,
} from '@/components/finance/ageing';
import type { SummaryFigure } from '@/components/finance/kit/FigurePopover';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { SettlementSheet } from '@/components/finance/settlement/SettlementSheet';
import { useAgeingUrlState } from '@/hooks/useAgeingUrlState';
import { useAgeingWorkspace } from '@/hooks/useAgeingWorkspace';
import { financeService, type AgeingRow } from '@/services/financeService';
import { dueWithin, sumBalance, type AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';

type View = 'vendor' | 'bill' | 'schedule';

const exportColumns: ExportColumn<AgeingRow>[] = [
  { id: 'party_name', label: 'Vendor', accessor: (r) => r.party_name },
  { id: 'current', label: 'Current (SAR)', accessor: (r) => formatMoney(r.current) },
  { id: 'days_1_30', label: '1–30 days (SAR)', accessor: (r) => formatMoney(r.days_1_30) },
  { id: 'days_31_60', label: '31–60 days (SAR)', accessor: (r) => formatMoney(r.days_31_60) },
  { id: 'days_61_90', label: '61–90 days (SAR)', accessor: (r) => formatMoney(r.days_61_90) },
  { id: 'days_90_plus', label: '90+ days (SAR)', accessor: (r) => formatMoney(r.days_90_plus) },
  { id: 'total', label: 'Total (SAR)', accessor: (r) => formatMoney(r.total) },
];

export default function APAgeingPage() {
  const navigate = useNavigate();
  const url = useAgeingUrlState<View>('vendor');
  const filters = useMemo(() => ({ bucket: url.bucket, overdueOnly: url.overdueOnly, search: url.search }), [url.bucket, url.overdueOnly, url.search]);
  const ws = useAgeingWorkspace('payables', { asOf: url.asOf, basis: url.basis, filters, sort: url.sort });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[] | null>(null);
  const pay = (docs: AgeingDocument[]) => setPayIds(docs.map((d) => d.id));

  const { data: advancesRes } = useQuery({
    queryKey: ['advances', 'Provider'],
    queryFn: () => financeService.getAdvances({ party_type: 'Provider' }),
  });

  const due7 = sumBalance(dueWithin(ws.docs, url.asOf, 7));
  const due30 = sumBalance(dueWithin(ws.docs, url.asOf, 30));
  const overdue = sumBalance(ws.docs.filter((d) => d.days_overdue > 0));

  const insights = [
    oldestOverdueInsight(ws.docs, { label: 'Pay', run: (d) => pay([d]) }),
    dueThisWeekInsight(ws.docs, url.asOf, 'bill', { label: 'Select in pay run', run: pay }),
    advanceInsight(advancesRes?.data ?? [], 'available to apply against bills', { label: 'Apply advances', run: () => navigate('/finance/advances') }),
  ].filter((i): i is AgeingInsight => i !== null);

  const short = due30 - ws.cashOnHand;
  const figures: SummaryFigure[] = [
    {
      id: 'due30',
      label: 'Due in 30 days',
      value: formatMoney(due30),
      tone: short > 0 ? 'warning' : undefined,
      breakdown: [
        { label: 'Overdue now', value: `SAR ${formatMoney(overdue)}`, tone: overdue > 0 ? 'warning' : undefined },
        { label: 'Due in 7 days', value: `SAR ${formatMoney(due7)}` },
        { label: 'Due in 30 days', value: `SAR ${formatMoney(due30)}` },
        { label: 'Bank & cash', value: `SAR ${formatMoney(ws.cashOnHand)}` },
        short > 0
          ? { label: 'Short by', value: `SAR ${formatMoney(short)}`, tone: 'negative' }
          : { label: 'Covered, with spare', value: `SAR ${formatMoney(-short)}`, tone: 'positive' },
      ],
      explain: 'Due amounts include bills already overdue. Bank & cash is the book balance of every active bank and cash account.',
      footer: (
        <Link to="/finance/bank-accounts" className="text-xs font-medium text-foreground hover:underline">Bank accounts →</Link>
      ),
    },
    { id: 'cash', label: 'Bank & cash', value: formatMoney(ws.cashOnHand), tone: short > 0 ? 'negative' : 'positive' },
  ];

  const views: AgeingView<View>[] = [
    { key: 'vendor', label: 'By vendor', icon: Users, count: ws.rows.length },
    { key: 'bill', label: 'By bill', icon: FileText, count: ws.counts.total },
    { key: 'schedule', label: 'Payment schedule', icon: CalendarClock },
  ];

  const filterBar = (placeholder: string, withSort: boolean) => (
    <AgeingFilterBar
      search={url.search}
      onSearch={(v) => url.set('search', v)}
      placeholder={placeholder}
      overdueOnly={url.overdueOnly}
      onOverdueOnly={(v) => url.set('overdue_only', v ? 'true' : null)}
      sort={withSort ? url.sort : undefined}
      onSort={withSort ? (v) => url.set('sort', v) : undefined}
      partyNoun="Vendor"
    />
  );

  return (
    <DashboardLayout active="finance" title="AP Ageing" fixedViewport>
      <div className="fin-report mx-auto flex h-full w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <AgeingToolbar
          views={views}
          view={url.view}
          onViewChange={(v) => url.set('view', v)}
          asOf={url.asOf}
          onAsOfChange={(d) => url.set('as_of', d)}
          basis={url.basis}
          onBasisChange={(b) => url.set('basis', b)}
          documentDateLabel="Bill date"
          actions={
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
                <Download className="size-3.5" /> Export
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
                <Printer className="size-3.5" /> Print
              </Button>
              <Button size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => setPayIds([])}>
                <CreditCard className="size-3.5" /> Pay bills
              </Button>
            </>
          }
        />

        <AgeingSummary
          totalLabel="Payables"
          grandTotal={ws.grandTotal}
          counts={ws.counts}
          documentNoun="bills"
          asOf={url.asOf}
          priorTotal={ws.priorTotal}
          active={url.bucket}
          onToggle={(b) => url.set('bucket', b)}
          figures={figures}
          insights={insights}
        />

        <ReportViewState
          isLoading={ws.isLoading}
          isError={ws.isError}
          onRetry={() => ws.refetch()}
          isEmpty={ws.rows.length === 0}
          emptyTitle={`No open payables as of ${formatDate(url.asOf)}`}
          emptyDescription="Every vendor bill is settled."
        >
          {url.view === 'vendor' && (
            <PartyAgeingTable
              rows={ws.filteredRows}
              grandTotal={ws.grandTotal}
              documentsByParty={ws.docsByParty}
              partyNoun="Vendor"
              documentNoun="bills"
              documentDateLabel="Bill date"
              toolbar={filterBar('Search vendors…', true)}
              renderPartyHover={(r) => (
                <PartyContact
                  row={r}
                  prior={ws.priorTotals.get(r.party_id)}
                  links={[
                    { label: 'Provider record', to: `/third-party/${r.party_id}` },
                    { label: 'All bills', to: `/finance/bills?search=${encodeURIComponent(r.party_name)}` },
                  ]}
                />
              )}
              renderRowActions={(r) => (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pay(ws.docsByParty.get(r.party_id) ?? [])}>Pay</Button>
              )}
              renderDocumentAction={(d) => (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => pay([d])}>Pay bill</Button>
              )}
            />
          )}

          {url.view === 'bill' && (
            <DocumentAgeingTable
              docs={ws.filteredDocs}
              selected={selected}
              onSelectedChange={setSelected}
              partyNoun="Vendor"
              documentDateLabel="Bill date"
              toolbar={
                <>
                  {filterBar('Search bill ref or vendor…', false)}
                  <SelectionBar docs={ws.filteredDocs.filter((d) => selected.has(d.id))}>
                    <Button size="sm" className="h-7 bg-brand text-xs text-white hover:bg-brand-hover" onClick={() => setPayIds([...selected])}>
                      Pay selected
                    </Button>
                  </SelectionBar>
                </>
              }
              renderAction={(d) => (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pay([d])}>Pay</Button>
              )}
            />
          )}

          {url.view === 'schedule' && (
            <AgeingForecast
              side="payables"
              docs={ws.docs}
              asOf={url.asOf}
              basis={url.basis}
              startCash={ws.cashOnHand}
              renderWeekAction={(w) =>
                w.docs.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pay(w.docs)}>Pay week</Button>
                )
              }
            />
          )}
        </ReportViewState>
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export AP ageing"
        filteredData={ws.filteredRows}
        columns={exportColumns}
        fileNamePrefix={`AP_Ageing_${url.asOf}`}
      />

      <SettlementSheet
        mode="pay"
        open={payIds !== null}
        onOpenChange={(o) => !o && setPayIds(null)}
        documents={ws.docs}
        initialIds={payIds ?? []}
        onSuccess={() => {
          setSelected(new Set());
          ws.refetch();
        }}
      />
    </DashboardLayout>
  );
}
