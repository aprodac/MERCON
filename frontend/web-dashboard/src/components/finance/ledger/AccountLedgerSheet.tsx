import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, type LucideIcon } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import { financeService } from '@/services/financeService';
import { SourceChip } from '@/lib/finance/chips';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;
const cell = 'px-3 py-2 text-xs align-top';

export interface LedgerAccount {
  id: string;
  code?: string | null;
  name: string;
  /** Colour of the statement section the account sits in. */
  tone: ChipTone;
  icon?: LucideIcon;
  /** Where it sits, e.g. "Assets · Receivables". */
  context: string;
}

function Stat({ label, value, icon: Icon, className }: { label: string; value: string; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-lg border px-3 py-2', className)}>
      <p className="flex items-center gap-1 text-[11px] opacity-80">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p className="fin-num truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Ledger entries for one account over a date range, opened from a statement without leaving it. */
export function AccountLedgerSheet({ account, from, to: asOf, onClose }: { account: LedgerAccount | null; from: string; to: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-reports', 'general-ledger', account?.id, from, asOf, 'recent'],
    queryFn: () => financeService.getGeneralLedger({ account_id: account?.id, date_from: from, date_to: asOf, per_page: PAGE_SIZE }),
    enabled: Boolean(account),
  });
  const ledger = data?.data;
  const more = (ledger?.pagination?.total_pages ?? 1) > 1;

  const toneKey = account?.tone ?? 'neutral';
  const tone = TONE_CLASSES[toneKey];
  const Icon = account?.icon ?? BookOpen;
  // Point 0 is the opening balance; point i is the balance after entry i − 1
  const series = ledger
    ? [
        { date: from, ref: 'Opening balance', balance: ledger.opening_balance, side: ledger.opening_balance_side ?? '', lineId: null as string | null },
        ...ledger.lines.map((l) => ({ date: l.entry_date, ref: l.ref_id ?? 'Journal entry', balance: l.running_balance, side: l.balance_side, lineId: l.line_id })),
      ]
    : [];
  const [flash, setFlash] = useState<string | null>(null);
  const jumpTo = (lineId: string | null) => {
    if (!lineId) return;
    document.getElementById(`gl-${lineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(lineId);
    window.setTimeout(() => setFlash((f) => (f === lineId ? null : f)), 1500);
  };
  const chart: ChartConfig = { balance: { label: 'Balance', color: toneDotVar(toneKey) } };

  return (
    <Sheet open={account !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className={cn('border-b p-5 pr-14', tone.bg)}>
          <div className="flex items-start gap-3">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background', tone.border, tone.fg)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">
                {account?.code && <span className="mr-2 font-normal text-muted-foreground tabular-nums">{account.code}</span>}
                {account?.name}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <Chip tone={toneKey} size="sm">{account?.context}</Chip>
                  <span className="text-muted-foreground">{formatDate(from)} – {formatDate(asOf)}</span>
                </div>
              </SheetDescription>
            </div>
          </div>
          {account && (
            <Button variant="outline" size="sm" asChild className="mt-3 h-7 w-fit gap-1.5 bg-background text-xs">
              <Link to={`/finance/general-ledger?account_id=${account.id}&date_from=${from}&date_to=${asOf}`}>
                Open full ledger <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </SheetHeader>

        {ledger && (
          <div className="space-y-3 border-b px-5 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Opening" value={`${formatMoney(ledger.opening_balance)} ${ledger.opening_balance_side ?? ''}`} className="border-border bg-muted/40" />
              <Stat label="Debits" icon={ArrowDownLeft} value={formatMoney(ledger.total_debit)} className={cn(TONE_CLASSES.positive.bg, TONE_CLASSES.positive.fg, TONE_CLASSES.positive.border)} />
              <Stat label="Credits" icon={ArrowUpRight} value={formatMoney(ledger.total_credit)} className={cn(TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg, TONE_CLASSES.negative.border)} />
              <Stat label="Closing" value={`${formatMoney(ledger.closing_balance)} ${ledger.closing_balance_side ?? ''}`} className={cn(tone.bg, tone.fg, tone.border)} />
            </div>
            {series.length > 2 && (
              <ChartContainer config={chart} className="aspect-auto h-14 w-full" aria-label="Balance over the period">
                <AreaChart
                  data={series}
                  margin={{ top: 4, bottom: 0, left: 0, right: 0 }}
                  className="cursor-pointer"
                  onClick={(e) => {
                    const i = Number(e?.activeTooltipIndex);
                    if (Number.isInteger(i)) jumpTo(series[i]?.lineId ?? null);
                  }}
                >
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <ChartTooltip
                    cursor={{ stroke: 'var(--border)' }}
                    content={({ active, payload }) => {
                      const p = active ? payload?.[0]?.payload : null;
                      if (!p) return null;
                      return (
                        <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                          <p className="text-muted-foreground">{formatDate(p.date)} · {p.ref}</p>
                          <p className="fin-num font-semibold">
                            {formatMoney(p.balance)} <span className="text-[10px] font-normal text-muted-foreground">{p.side}</span>
                          </p>
                          {p.lineId && <p className="text-[10px] text-muted-foreground">Click to find it below</p>}
                        </div>
                      );
                    }}
                  />
                  <Area dataKey="balance" type="stepAfter" stroke="var(--color-balance)" fill="var(--color-balance)" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ChartContainer>
            )}
          </div>
        )}

        <div className="table-container min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : isError || !ledger ? (
            <p className="p-8 text-center text-xs text-muted-foreground">The ledger could not be loaded.</p>
          ) : ledger.lines.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted-foreground">No entries in this period.</p>
          ) : (
            <table className="w-full min-w-[600px] text-left">
              <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
                <tr>
                  <th className={cn(cell, 'py-2 font-semibold')}>Date</th>
                  <th className={cn(cell, 'py-2 font-semibold')}>Entry</th>
                  <th className={cn(cell, 'py-2 text-right font-semibold')}>Debit</th>
                  <th className={cn(cell, 'py-2 text-right font-semibold')}>Credit</th>
                  <th className={cn(cell, 'py-2 text-right font-semibold')}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.lines.map((l) => {
                  const voided = l.journal_entry_status === 'Voided';
                  const against = l.contra.map((c) => c.name).filter(Boolean);
                  return (
                    <tr
                      key={l.line_id}
                      id={`gl-${l.line_id}`}
                      className={cn('border-b border-border/60 transition-colors hover:bg-muted/40', voided && 'bg-muted/30 opacity-60', flash === l.line_id && tone.bg)}
                    >
                      <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{formatDate(l.entry_date)}</td>
                      <td className={cell}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link to={`/finance/journal-entries/${l.journal_entry_id}`} className="font-medium text-foreground hover:underline">
                            {l.ref_id ?? 'Journal entry'}
                          </Link>
                          <SourceChip type={l.source_type || 'Manual'} size="sm" />
                          {voided && <Chip tone="negative" size="sm">Voided</Chip>}
                          {l.reversal_of_id && <Chip tone="warning" size="sm">Reversal</Chip>}
                        </div>
                        {(l.description || l.memo) && <p className="mt-0.5 max-w-80 truncate text-[11px] text-muted-foreground">{l.description || l.memo}</p>}
                        {against.length > 0 && (
                          <p className="max-w-80 truncate text-[11px] text-muted-foreground">
                            against <span className="text-foreground/80">{against.slice(0, 2).join(', ')}{against.length > 2 ? ` +${against.length - 2}` : ''}</span>
                          </p>
                        )}
                      </td>
                      <td className={cn(cell, 'fin-num text-right font-medium', TONE_CLASSES.positive.fg, voided && 'line-through')}>{l.debit ? formatMoney(l.debit) : ''}</td>
                      <td className={cn(cell, 'fin-num text-right font-medium', TONE_CLASSES.negative.fg, voided && 'line-through')}>{l.credit ? formatMoney(l.credit) : ''}</td>
                      <td className={cn(cell, 'fin-num whitespace-nowrap text-right font-medium')}>
                        {formatMoney(l.running_balance)}
                        <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] font-normal text-muted-foreground">{l.balance_side}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {more && <p className="p-4 text-center text-[11px] text-muted-foreground">Showing the first {PAGE_SIZE} entries — open the full ledger for the rest.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
