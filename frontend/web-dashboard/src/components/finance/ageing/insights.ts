import { AlertTriangle, CalendarClock, Wallet, type LucideIcon } from 'lucide-react';
import type { ChipTone } from '@/components/ui/chip';
import type { Advance } from '@mercon/shared-types';
import { addDays, dueSoon, sumBalance, type AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';

export interface AgeingInsight {
  id: string;
  icon: LucideIcon;
  tone?: ChipTone;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Deterministic insight builders shared by the payables and receivables workspaces.
 * Each returns null when there is nothing worth saying.
 */

export function oldestOverdueInsight(docs: AgeingDocument[], action: { label: string; run: (doc: AgeingDocument) => void }): AgeingInsight | null {
  const oldest = docs.reduce<AgeingDocument | null>((best, d) => (d.days_overdue > 0 && (!best || d.days_overdue > best.days_overdue) ? d : best), null);
  if (!oldest) return null;
  return {
    id: 'oldest-overdue',
    icon: AlertTriangle,
    tone: oldest.days_overdue > 60 ? 'negative' : 'warning',
    title: `${oldest.party_name} — ${oldest.ref_id ?? 'oldest'}`,
    detail: `${oldest.days_overdue} days overdue · SAR ${formatMoney(oldest.balance)}`,
    actionLabel: action.label,
    onAction: () => action.run(oldest),
  };
}

export function dueThisWeekInsight(
  docs: AgeingDocument[],
  asOf: string,
  noun: string,
  action: { label: string; run: (docs: AgeingDocument[]) => void },
): AgeingInsight | null {
  const week = dueSoon(docs, asOf, 7);
  if (week.length === 0) return null;
  return {
    id: 'due-this-week',
    icon: CalendarClock,
    tone: 'info',
    title: `${week.length} ${noun}${week.length === 1 ? '' : 's'} due this week`,
    detail: `SAR ${formatMoney(sumBalance(week))} by ${formatDate(addDays(asOf, 7))}`,
    actionLabel: action.label,
    onAction: () => action.run(week),
  };
}

export function advanceInsight(advances: Advance[], detail: string, action: { label: string; run: (advance: Advance) => void }): AgeingInsight | null {
  const open = advances.filter((a) => a.status !== 'Void' && Number(a.remaining_amount ?? 0) > 0);
  if (open.length === 0) return null;
  const total = open.reduce((s, a) => s + Number(a.remaining_amount), 0);
  const first = open[0];
  return {
    id: 'advance-available',
    icon: Wallet,
    tone: 'teal',
    title: open.length === 1 ? `${first.party?.name ?? 'An advance'} has credit` : `${open.length} advances with credit`,
    detail: `SAR ${formatMoney(total)} ${detail}`,
    actionLabel: action.label,
    onAction: () => action.run(first),
  };
}
