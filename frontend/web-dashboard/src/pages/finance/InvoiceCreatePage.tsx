/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { CustomerPicker } from '@/components/finance/invoices/editor/CustomerPicker';
import { InvoiceLinesTable } from '@/components/finance/invoices/editor/InvoiceLinesTable';
import { TripPickerSheet } from '@/components/finance/invoices/editor/TripPickerSheet';
import { InvoiceEditorRail, type CustomerPosition } from '@/components/finance/invoices/editor/InvoiceEditorRail';
import { IssueInvoiceDialog, useInvoiceLedger } from '@/components/finance/invoices/InvoiceLedgerSetup';
import { ledgerGaps, SLOT_META } from '@/lib/finance/invoiceLedger';

import { financeService, type CreateInvoiceDTO } from '@/services/financeService';
import { customerService } from '@/services/customerService';
import { tripService } from '@/services/tripService';
import { settingsService } from '@/services/settingsService';
import { asOfPresetDate } from '@/components/finance/kit/AsOfControl';
import { addDays, toDateOnly } from '@/lib/finance/ageing';
import { termsToDays } from '@/lib/finance/invoices';
import { formatMoney } from '@/lib/finance/format';
import {
  buildInvoicePayload,
  daysBetween,
  draftIssues,
  draftTotals,
  linesFromInvoice,
  newManualLine,
  type DraftHeader,
  type DraftLine,
} from '@/lib/finance/invoiceDraft';
import { tripAmount, tripLineDescription } from '@/lib/finance/tripBilling';
import type { Account, Invoice } from '@mercon/shared-types';

/** Days per payment-terms option; "custom" means a date picked by hand. */
const TERM_DAYS: Record<string, number> = { due_on_receipt: 0, net15: 15, net30: 30, net45: 45, net60: 60, net90: 90 };
const TERM_LABEL: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net15: 'Net 15',
  net30: 'Net 30',
  net45: 'Net 45',
  net60: 'Net 60',
  net90: 'Net 90',
  custom: 'Custom date',
};

const DEFAULT_NOTES = 'Thank you for your business!';
const DEFAULT_TERMS = 'Payment is due within agreed credit terms. Late payments subject to standard service terms.';

/** The option matching a customer's terms text ("Net 30", "Due on receipt"), if there is one. */
function termsOption(terms: string | null | undefined): string | null {
  const days = termsToDays(terms);
  const hit = Object.entries(TERM_DAYS).find(([, d]) => d === days);
  return hit ? hit[0] : null;
}

const fieldLabel = 'text-[11px] font-medium text-muted-foreground';

export default function InvoiceCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  // Present on /finance/invoices/:id/edit — the page then edits that draft
  const { id: editId } = useParams<{ id: string }>();
  const editing = Boolean(editId);
  const today = asOfPresetDate('today');

  const [customerId, setCustomerId] = useState(() => (editing ? '' : params.get('customer') || ''));
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => addDays(today, 30));
  const [paymentTerms, setPaymentTerms] = useState('net30');
  const [taxRate, setTaxRate] = useState(15);
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);

  const touch = () => setDirty(true);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: editRes, isLoading: isLoadingEdit } = useQuery({
    queryKey: ['invoices', 'detail', editId],
    queryFn: () => financeService.getInvoiceById(editId as string),
    enabled: editing,
  });
  const editInvoice: Invoice | undefined = editRes?.data;
  const draftTripIds = useMemo(() => (editInvoice?.lines ?? []).filter((l) => l.tripId).map((l) => l.tripId as string), [editInvoice]);

  // Load the draft being edited once
  const loadedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!editInvoice || editInvoice.status !== 'Draft' || loadedDraft.current === editInvoice.id) return;
    loadedDraft.current = editInvoice.id;
    setCustomerId(editInvoice.customerId);
    setInvoiceDate(toDateOnly(editInvoice.invoice_date));
    setDueDate(editInvoice.due_date ? toDateOnly(editInvoice.due_date) : '');
    setPaymentTerms('custom');
    setTaxRate(Number(editInvoice.tax_rate) || 0);
    setNotes(editInvoice.notes ?? '');
    setTerms(editInvoice.terms ?? '');
    setLines(linesFromInvoice(editInvoice));
    setDirty(false);
  }, [editInvoice]);

  const { data: unbilledRes } = useQuery({ queryKey: ['invoices', 'unbilled'], queryFn: () => financeService.getUnbilledTrips() });
  const { data: customersRes, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customerService.getAll({ per_page: 500 } as any),
  });
  const { data: tripsRes, isLoading: isLoadingTrips } = useQuery({
    queryKey: ['trips', 'completed-unbilled', customerId],
    queryFn: () => tripService.getAll({ customer_id: customerId, status: 'Completed', per_page: 200 }),
    enabled: Boolean(customerId),
  });
  const { data: summaryRes, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['invoices', 'summary', { customer_id: customerId }],
    queryFn: () => financeService.getInvoiceSummary({ customer_id: customerId }),
    enabled: Boolean(customerId),
  });
  const { data: advancesRes } = useQuery({
    queryKey: ['advances', 'customer', customerId],
    queryFn: () => financeService.getAdvances({ party_type: 'Customer', party_id: customerId, direction: 'Received' }),
    enabled: Boolean(customerId),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get, staleTime: 60000 });
  const { data: accountsRes } = useQuery({ queryKey: ['accounts', 'postable'], queryFn: () => financeService.getAccounts({ include_inactive: false }) });

  const customers = useMemo(() => (customersRes?.data || []) as any[], [customersRes]);
  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const unbilledByCustomer = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    (unbilledRes?.data?.customers ?? []).forEach((c) => m.set(c.customer_id, { count: c.trip_ids.length, amount: c.amount }));
    return m;
  }, [unbilledRes]);

  // Billable: not invoiced and not on another draft; trips already on this draft stay selectable
  const customerTrips = useMemo(() => {
    const allowed = new Set([...(unbilledRes?.data?.customers ?? []).flatMap((c) => c.trip_ids), ...draftTripIds]);
    // Trips without a billing amount aren't in the server's list; they are shown (greyed out) so the gap is visible
    return ((tripsRes?.data || []) as any[]).filter((t) => (!t.invoiceId || t.invoiceId === editId) && (!unbilledRes || allowed.has(t.id) || tripAmount(t) <= 0));
  }, [tripsRes, unbilledRes, draftTripIds, editId]);
  const tripsById = useMemo(() => new Map(customerTrips.map((t) => [t.id, t])), [customerTrips]);

  const onInvoice = useMemo(() => new Set(lines.filter((l) => l.tripId).map((l) => l.tripId as string)), [lines]);
  const remainingTrips = customerTrips.filter((t) => tripAmount(t) > 0 && !onInvoice.has(t.id));
  const remaining = { count: remainingTrips.length, amount: remainingTrips.reduce((s, t) => s + tripAmount(t), 0) };

  // ── Header behaviour ────────────────────────────────────────────────────
  // A new invoice takes the customer's own payment terms when they match an option
  useEffect(() => {
    if (editing || !selectedCustomer) return;
    const option = termsOption(selectedCustomer.payment_terms);
    if (option) setPaymentTerms(option);
  }, [selectedCustomer, editing]);

  // The due date follows the invoice date and terms, unless it was picked by hand
  useEffect(() => {
    if (paymentTerms in TERM_DAYS && invoiceDate) setDueDate(addDays(invoiceDate, TERM_DAYS[paymentTerms]));
  }, [invoiceDate, paymentTerms]);

  const changeCustomer = (id: string) => {
    if (id === customerId) return;
    const tripLines = lines.filter((l) => l.kind === 'trip').length;
    if (tripLines > 0) toast.info(`${tripLines} trip ${tripLines === 1 ? 'line was' : 'lines were'} removed: they belong to the previous customer.`);
    setLines((prev) => prev.filter((l) => l.kind !== 'trip'));
    setCustomerId(id);
    touch();
  };

  // ── Lines ───────────────────────────────────────────────────────────────
  const setTripSelection = (ids: string[]) => {
    setLines((prev) => {
      const keep = prev.filter((l) => l.kind === 'manual' || (l.tripId && ids.includes(l.tripId)));
      const have = new Set(keep.filter((l) => l.tripId).map((l) => l.tripId));
      const added: DraftLine[] = ids
        .filter((id) => !have.has(id))
        .map((id) => {
          const t = tripsById.get(id);
          return { key: id, kind: 'trip', tripId: id, description: t ? tripLineDescription(t) : 'Trip', quantity: 1, rate: t ? tripAmount(t) : 0, discount_pct: 0, tax_rate: null };
        });
      return [...keep, ...added];
    });
    touch();
  };
  const addAllTrips = () => {
    setTripSelection([...onInvoice, ...remainingTrips.map((t) => t.id)]);
    toast.success(`${remainingTrips.length} ${remainingTrips.length === 1 ? 'trip' : 'trips'} added`);
  };
  const changeLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  };
  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    touch();
  };
  const addLine = (description = '') => {
    setLines((prev) => [...prev, newManualLine(description)]);
    touch();
  };

  // ── Derived figures ─────────────────────────────────────────────────────
  const header: DraftHeader = { customerId, invoiceDate, dueDate, taxRate, notes, terms };
  const totals = useMemo(() => draftTotals(lines, taxRate), [lines, taxRate]);
  const ledger = useInvoiceLedger();
  const ledgerMissing = ledgerGaps(ledger.setup, totals.tax > 0.005);
  const issues = [
    ...draftIssues(header, lines),
    ...(ledgerMissing.length && lines.length
      ? [{ level: 'warning' as const, message: `Issuing needs the ${ledgerMissing.map((g) => SLOT_META[g].label).join(' and ')} account; you'll be asked to choose it.` }]
      : []),
  ];
  const blocking = issues.filter((i) => i.level === 'error');

  const summary = summaryRes?.data;
  const advancesAvailable = ((advancesRes?.data ?? []) as any[])
    .filter((a) => a.status === 'Open' || a.status === 'PartiallyApplied')
    .reduce((s, a) => s + (Number(a.remaining_amount) || 0), 0);
  const position: CustomerPosition | null = selectedCustomer
    ? {
        name: selectedCustomer.name,
        terms: selectedCustomer.payment_terms ?? null,
        unpaid: summary?.unpaid_balance ?? 0,
        overdue: summary?.overdue_balance ?? 0,
        unpaidCount: summary?.counts?.unpaid ?? 0,
        advances: advancesAvailable,
        loading: isLoadingSummary,
      }
    : null;

  const accountName = (id: string | null | undefined, fallback: string) => {
    const a = ((accountsRes?.data ?? []) as Account[]).find((x) => x.id === id);
    return a ? `${a.account_code} ${a.name}` : fallback;
  };
  const postingAccounts = {
    receivable: accountName(settings?.defaultReceivableAccountId, 'Accounts receivable'),
    revenue: accountName(settings?.defaultRevenueAccountId, 'Revenue'),
    vat: accountName(settings?.defaultVatOutputAccountId, 'VAT output'),
  };

  // ── Save / issue ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ issue }: { issue: boolean }) => {
      const payload: CreateInvoiceDTO = buildInvoicePayload(header, lines);
      let id = editId as string | undefined;
      let ref: string | undefined = editInvoice?.ref_id ?? undefined;
      if (!editing) {
        const res: any = await financeService.createDraftInvoice(payload);
        id = res?.data?.id;
        ref = res?.data?.ref_id;
      } else {
        // The customer of a draft can't change; lines are rebuilt from the trips plus the manual lines
        const { customerId: _customer, ...changes } = payload;
        await financeService.updateDraftInvoice(id as string, changes);
      }
      if (!issue || !id) return { id, ref, issued: false as const, issueError: null as string | null };
      try {
        await financeService.issueInvoice(id);
        return { id, ref, issued: true as const, issueError: null };
      } catch (err: any) {
        return { id, ref, issued: false as const, issueError: err?.response?.data?.error?.message || 'The invoice could not be issued' };
      }
    },
    onSuccess: ({ id, ref, issued, issueError }, { issue }) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      if (issued) {
        queryClient.invalidateQueries({ queryKey: ['finance-reports'] });
        toast.success(`${ref ?? 'Invoice'} issued`);
      } else if (issue && issueError) toast.error(`Saved as draft ${ref ?? ''}, but not issued: ${issueError}`);
      else toast.success(editing ? 'Draft saved' : `Draft ${ref ?? 'invoice'} created`);
      navigate(`/finance/invoices?invoice=${id ?? editId}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || (editing ? 'Could not save the draft' : 'Could not create the invoice'));
    },
  });
  const saving = saveMutation.isPending;

  const save = useCallback(
    (issue: boolean) => {
      if (saving) return;
      if (blocking.length > 0) {
        toast.error(blocking[0].message);
        return;
      }
      if (issue) setConfirmIssue(true);
      else saveMutation.mutate({ issue: false });
    },
    [saving, blocking, saveMutation],
  );

  // Ctrl/⌘+S saves the draft, Ctrl/⌘+Enter issues
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        save(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        save(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);

  const cancel = () => navigate(editing ? `/finance/invoices?invoice=${editId}` : '/finance/invoices');
  const dueInDays = daysBetween(invoiceDate, dueDate);
  const vatOptions = [...new Set([15, 0, taxRate])].sort((a, b) => b - a);

  if (editing && !isLoadingEdit && editInvoice && editInvoice.status !== 'Draft') {
    return (
      <DashboardLayout active="finance" title={`Invoice ${editInvoice.ref_id ?? ''}`}>
        <div className="mx-auto max-w-md space-y-3 p-10 text-center text-sm">
          <p>{editInvoice.ref_id} has been issued, so it can no longer be edited. Void it and create a new invoice if it needs to change.</p>
          <Link to={`/finance/invoices?invoice=${editInvoice.id}`} className="font-medium underline">
            Back to the invoice
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="finance" title={editing ? `Edit draft ${editInvoice?.ref_id ?? ''}` : 'New Draft Invoice'} fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b pb-2.5">
          <Chip tone="neutral" size="sm">Draft</Chip>
          <span className="text-sm font-medium text-foreground">{editing ? editInvoice?.ref_id ?? 'Draft invoice' : 'New invoice'}</span>
          {selectedCustomer && <span className="truncate text-sm text-muted-foreground">· {selectedCustomer.name}</span>}
          {dirty && <span className="text-[11px] text-muted-foreground">· Unsaved changes</span>}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => save(false)} disabled={saving} title="Save draft (Ctrl+S)">
              {saving && !confirmIssue && saveMutation.variables?.issue === false && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? 'Save draft' : 'Save as draft'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover"
              onClick={() => save(true)}
              disabled={saving}
              title="Save and issue (Ctrl+Enter)"
            >
              {saving && saveMutation.variables?.issue ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Save and issue
            </Button>
          </div>
        </div>

        {editing && isLoadingEdit ? (
          <Card className="space-y-3 rounded-xl p-6 shadow-xs">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </Card>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* The invoice document */}
            <Card className="flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl py-0 shadow-xs max-lg:min-h-[480px]">
              <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2.5 border-b px-4 py-3 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
                <div className="col-span-2 space-y-1 md:col-span-4 xl:col-span-1">
                  <Label className={fieldLabel}>Customer</Label>
                  <CustomerPicker
                    customers={customers}
                    value={customerId}
                    onChange={changeCustomer}
                    unbilled={unbilledByCustomer}
                    disabled={editing}
                    isLoading={isLoadingCustomers}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-date" className={fieldLabel}>Invoice date</Label>
                  <Input
                    id="inv-date"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => {
                      setInvoiceDate(e.target.value);
                      touch();
                    }}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabel}>
                    Terms
                    {selectedCustomer?.payment_terms && <span className="font-normal text-muted-foreground/80"> · customer: {selectedCustomer.payment_terms}</span>}
                  </Label>
                  <Select
                    value={paymentTerms}
                    onValueChange={(v) => {
                      setPaymentTerms(v);
                      touch();
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm" aria-label="Payment terms">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TERM_LABEL).map(([k, label]) => (
                        <SelectItem key={k} value={k} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-due" className={fieldLabel}>Due date</Label>
                  <Input
                    id="inv-due"
                    type="date"
                    value={dueDate}
                    min={invoiceDate || undefined}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      setPaymentTerms('custom');
                      touch();
                    }}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabel}>Default VAT</Label>
                  <Select
                    value={String(taxRate)}
                    onValueChange={(v) => {
                      setTaxRate(Number(v));
                      touch();
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm" aria-label="Default VAT rate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vatOptions.map((r) => (
                        <SelectItem key={r} value={String(r)} className="text-xs">
                          {r}%{r === 15 ? ' · standard' : r === 0 ? ' · zero-rated' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <InvoiceLinesTable
                lines={lines}
                tripsById={tripsById}
                defaultTaxRate={taxRate}
                onChange={changeLine}
                onRemove={removeLine}
                onAddLine={addLine}
                onPickTrips={() => setPickerOpen(true)}
                onAddAllTrips={addAllTrips}
                customerChosen={Boolean(customerId)}
                unbilled={remaining}
              />

              <div className="grid shrink-0 gap-3 border-t bg-muted/20 px-4 py-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="inv-notes" className={fieldLabel}>Notes to the customer</Label>
                  <Textarea
                    id="inv-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      touch();
                    }}
                    placeholder="Shown on the invoice"
                    className="min-h-0 resize-none bg-background text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-terms" className={fieldLabel}>Terms and conditions</Label>
                  <Textarea
                    id="inv-terms"
                    rows={2}
                    value={terms}
                    onChange={(e) => {
                      setTerms(e.target.value);
                      touch();
                    }}
                    placeholder="Shown on the invoice"
                    className="min-h-0 resize-none bg-background text-xs"
                  />
                </div>
              </div>
            </Card>

            <div className="min-h-0 overflow-y-auto max-lg:overflow-visible">
              <InvoiceEditorRail totals={totals} dueDate={dueDate} dueInDays={dueInDays} customer={position} accounts={postingAccounts} issues={issues} />
            </div>
          </div>
        )}
      </div>

      <TripPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        trips={customerTrips}
        isLoading={isLoadingTrips}
        customerName={selectedCustomer?.name ?? ''}
        selected={[...onInvoice]}
        onApply={setTripSelection}
      />

      <IssueInvoiceDialog
        open={confirmIssue}
        onOpenChange={setConfirmIssue}
        hasVat={totals.tax > 0.005}
        pending={saving}
        onConfirm={() => {
          setConfirmIssue(false);
          saveMutation.mutate({ issue: true });
        }}
        title={`Issue this invoice for SAR ${formatMoney(totals.total)}?`}
        description={`It posts ${postingAccounts.receivable} Dr ${formatMoney(totals.total)} against ${postingAccounts.revenue} Cr ${formatMoney(totals.subtotal)}${
          totals.tax > 0.005 ? ` and ${postingAccounts.vat} Cr ${formatMoney(totals.tax)}` : ''
        }, and marks ${totals.tripCount} ${totals.tripCount === 1 ? 'trip' : 'trips'} as invoiced. An issued invoice can't be edited, only voided.`}
        confirmLabel="Issue invoice"
      />
    </DashboardLayout>
  );
}
