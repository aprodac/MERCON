import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { SettleDriverSheet } from '@/components/finance/driverPay/SettleDriverSheet';
import { MonthlyPayouts } from '@/components/finance/driverPay/MonthlyPayouts';
import { financeService } from '@/services/financeService';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

type Tab = 'owed' | 'monthly' | 'paid';

/** Days since a date, for "oldest unpaid trip" ageing. */
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * Driver pay: who is owed trip pay (and how long it's been waiting), paying them, and the
 * settlements already paid. Salaries are recorded as Salary expenses, not here.
 */
export default function DriverPayPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'owed';
  const [settling, setSettling] = useState<{ id: string; name: string } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const queue = useQuery({ queryKey: ['driver-pay', 'queue'], queryFn: financeService.getSettlementQueue });
  const paid = useQuery({ queryKey: ['driver-pay', 'settlements'], queryFn: () => financeService.getDriverSettlements({ status: 'all' }), enabled: tab === 'paid' });
  const detail = useQuery({ queryKey: ['driver-pay', 'settlement', viewId], queryFn: () => financeService.getDriverSettlement(viewId!), enabled: Boolean(viewId) });

  const rows = queue.data ?? [];
  const totalOwed = rows.reduce((t, r) => t + r.owed, 0);
  const totalAdv = rows.reduce((t, r) => t + r.open_advances, 0);
  const oldest = rows.reduce<string | null>((o, r) => (!o || r.oldest < o ? r.oldest : o), null);

  const doVoid = async () => {
    if (!viewId) return;
    setVoiding(true);
    try {
      await financeService.voidDriverSettlement(viewId);
      toast.success(`${detail.data?.ref_id ?? 'Settlement'} voided; its trips are payable again`);
      ['driver-pay', 'bank-accounts', 'bankAccounts', 'finance-reports', 'journalEntries', 'advances'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      setConfirmVoid(false);
      setViewId(null);
    } catch (err: any) {
      const e = err?.response?.data?.error;
      toast.error((typeof e === 'string' ? e : e?.message) || 'Could not void the settlement.');
    } finally {
      setVoiding(false);
    }
  };

  const d = detail.data;
  return (
    <DashboardLayout active="finance" title="Driver pay" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto">
        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-t-2 bg-card px-3 py-2 shadow-xs" style={{ borderTopColor: 'var(--chip-warning-dot)' }}>
            <span className="block text-[11px] font-medium text-muted-foreground">Trip pay owed · {rows.length} drivers</span>
            <span className={cn('fin-num block text-lg font-semibold', totalOwed > 0 ? TONE_CLASSES.warning.fg : 'text-foreground')}>{queue.data ? formatMoney(totalOwed) : '…'}</span>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2 shadow-xs">
            <span className="block text-[11px] font-medium text-muted-foreground">Open advances to recover</span>
            <span className="fin-num block text-lg font-semibold text-foreground">{queue.data ? formatMoney(totalAdv) : '…'}</span>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2 shadow-xs">
            <span className="block text-[11px] font-medium text-muted-foreground">Oldest unpaid trip</span>
            <span className={cn('block text-lg font-semibold', oldest && daysSince(oldest) > 30 ? TONE_CLASSES.negative.fg : 'text-foreground')}>{oldest ? `${daysSince(oldest)} days` : '—'}</span>
          </div>
          <div className="flex items-center rounded-xl border bg-card px-3 py-2 text-[11px] text-muted-foreground shadow-xs">
            Trip pay only. Salaries are recorded as Salary expenses; advances in Finance → Advances.
          </div>
        </div>

        <ScrollTableCard
          toolbar={
            <SegmentedControl
              aria-label="View"
              value={tab}
              onChange={(v) => setParams((p) => {
                const n = new URLSearchParams(p);
                if (v === 'owed') n.delete('tab');
                else n.set('tab', v);
                return n;
              })}
              options={[
                { value: 'owed', label: 'To pay' },
                { value: 'monthly', label: 'By month' },
                { value: 'paid', label: 'Paid' },
              ]}
            />
          }
        >
          {tab === 'monthly' ? (
            <MonthlyPayouts onPay={setSettling} />
          ) : tab === 'owed' ? (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 text-right font-medium">Trips</th>
                  <th className="px-3 py-2 font-medium">Waiting since</th>
                  <th className="px-3 py-2 text-right font-medium">Advances</th>
                  <th className="px-3 py-2 text-right font-medium">Owed</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {queue.isLoading &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td colSpan={6} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))}
                {!queue.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center">
                      <Wallet className="mx-auto mb-2 size-5 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">All drivers are paid up</p>
                      <p className="mt-1 text-xs text-muted-foreground">Trip pay shows here once a trip is completed.</p>
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const age = daysSince(r.oldest);
                  return (
                    <tr key={r.driver_id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{r.driver_name}</span>
                        {r.driver_ref && <span className="ml-1.5 text-muted-foreground">{r.driver_ref}</span>}
                      </td>
                      <td className="fin-num px-3 py-2 text-right">{r.trips}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={cn(age > 30 ? TONE_CLASSES.negative.fg : age > 14 ? TONE_CLASSES.warning.fg : 'text-muted-foreground')}>
                          {formatDate(r.oldest)} · {age}d
                        </span>
                      </td>
                      <td className="fin-num px-3 py-2 text-right text-muted-foreground">{r.open_advances > 0 ? formatMoney(r.open_advances) : '—'}</td>
                      <td className="fin-num px-3 py-2 text-right font-semibold text-foreground">{formatMoney(r.owed)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSettling({ id: r.driver_id, name: r.driver_name })}>
                          Pay
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 z-10 bg-card text-[11px] text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Paid on</th>
                  <th className="px-3 py-2 font-medium">Settlement</th>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 text-right font-medium">Trips</th>
                  <th className="px-3 py-2 text-right font-medium">Trip pay</th>
                  <th className="px-3 py-2 text-right font-medium">Advances</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {paid.isLoading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                )}
                {!paid.isLoading && (paid.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">No settlements yet.</td>
                  </tr>
                )}
                {(paid.data ?? []).map((s) => {
                  const voided = s.status === 'Voided';
                  return (
                    <tr key={s.id} onClick={() => setViewId(s.id)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', voided && 'text-muted-foreground')}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(s.paid_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {s.ref_id}
                        {voided && <Chip tone="neutral" size="sm" className="ml-1.5">Voided</Chip>}
                      </td>
                      <td className="px-3 py-2">{s.driver_name}</td>
                      <td className="fin-num px-3 py-2 text-right">{s.trips || '—'}</td>
                      <td className="fin-num px-3 py-2 text-right">{formatMoney(s.gross)}</td>
                      <td className="fin-num px-3 py-2 text-right">{s.deducted > 0 ? `−${formatMoney(s.deducted)}` : '—'}</td>
                      <td className={cn('fin-num px-3 py-2 text-right font-semibold', voided && 'line-through')}>{formatMoney(s.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ScrollTableCard>
      </div>

      <SettleDriverSheet driver={settling} onOpenChange={(o) => !o && setSettling(null)} />

      <Sheet open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {!d ? (
            <div className="space-y-2 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : (
            <>
              <div className="space-y-2 border-b p-5 pr-14">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-base">{d.ref_id}</SheetTitle>
                  <Chip tone={d.status === 'Paid' ? 'positive' : 'neutral'} size="sm">{d.status}</Chip>
                </div>
                <SheetDescription className="text-xs">
                  {d.driver_name} · paid {formatDate(d.paid_date)}
                  {d.paid_from ? ` from ${d.paid_from}` : ''}
                  {d.reference ? ` · ${d.reference}` : ''}
                </SheetDescription>
                <p className="fin-num text-2xl font-semibold">
                  <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
                  {formatMoney(d.net)}
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-xs">
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Trip pay</dt><dd className="fin-num">{formatMoney(d.gross)}</dd></div>
                  {d.advances.map((a) => (
                    <div key={a.advance_id} className="flex justify-between"><dt className="text-muted-foreground">Advance {a.ref_id} recovered</dt><dd className="fin-num">−{formatMoney(a.amount)}</dd></div>
                  ))}
                  <div className="flex justify-between border-t pt-1 font-semibold"><dt>Paid</dt><dd className="fin-num">{formatMoney(d.net)}</dd></div>
                </dl>
                {d.lines.length > 0 ? (
                  <div className="divide-y divide-border/60 rounded-lg border">
                    {d.lines.map((l) => (
                      <Link key={`${l.trip_id}:${l.role}`} to={`/trips/${l.trip_id}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
                        <span className="w-20 shrink-0 font-medium">{l.trip_ref}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {l.customer}
                          {l.role === 'co_driver' ? ' · co-driver' : ''}
                        </span>
                        <span className="fin-num">{formatMoney(l.amount)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  d.status === 'Voided' && <p className="text-muted-foreground">Voided {d.voided_at ? formatDate(d.voided_at) : ''}: its trips were released and can be paid again.</p>
                )}
                {d.journal_entry_id && (
                  <Link to={`/finance/journal-entries/${d.journal_entry_id}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                    Open journal entry <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
              {d.status === 'Paid' && (
                <div className="flex justify-end border-t p-4">
                  <Button variant="outline" size="sm" className={cn('h-8 text-xs', TONE_CLASSES.negative.fg)} onClick={() => setConfirmVoid(true)}>
                    Void settlement
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmVoid} onOpenChange={(o) => !o && !voiding && setConfirmVoid(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {d?.ref_id}?</AlertDialogTitle>
            <AlertDialogDescription>
              A reversing entry dated today undoes the payment, the advances get their balance back, and the {d?.lines.length} trips become payable again. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={voiding}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                doVoid();
              }}
            >
              {voiding && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Void settlement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
