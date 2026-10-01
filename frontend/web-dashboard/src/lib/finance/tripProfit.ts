/**
 * How the trip profitability page reads a margin: its colour (loss red, thin amber, healthy green,
 * no price grey) and the share of revenue each cost takes, for the breakdown bars.
 */
import type { ChipTone } from '@/components/ui/chip';

/** Below this margin % a profitable trip still counts as thin. */
export const THIN_MARGIN_PCT = 10;

export function marginTone(margin: number, pct: number | null): ChipTone {
  if (pct === null) return 'neutral';
  if (margin < -0.005) return 'negative';
  if (pct < THIN_MARGIN_PCT) return 'warning';
  return 'positive';
}

export interface CostShares {
  driverPay: number;
  subcontract: number;
  expenses: number;
  margin: number;
  /** Cost above revenue, as % of revenue (a loss). */
  over: number;
}

/** Each part as % of revenue, for a bar that fills to 100 (or shows the overrun). */
export function costShares(p: { revenue: number; driverPay: number; subcontract: number; expenses: number }): CostShares {
  if (!(p.revenue > 0.005)) return { driverPay: 0, subcontract: 0, expenses: 0, margin: 0, over: 0 };
  const pct = (n: number) => (n / p.revenue) * 100;
  const cost = p.driverPay + p.subcontract + p.expenses;
  const scale = cost > p.revenue ? p.revenue / cost : 1;
  return {
    driverPay: pct(p.driverPay) * scale,
    subcontract: pct(p.subcontract) * scale,
    expenses: pct(p.expenses) * scale,
    margin: cost < p.revenue ? pct(p.revenue - cost) : 0,
    over: cost > p.revenue ? pct(cost - p.revenue) : 0,
  };
}

export const formatPct = (pct: number | null) => (pct === null ? '—' : `${pct.toFixed(1)}%`);
