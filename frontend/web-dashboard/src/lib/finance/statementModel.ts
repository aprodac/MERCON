import type { ChipTone } from '@/components/ui/chip';

/**
 * Shared shape for financial statements (balance sheet, profit and loss). Page-specific builders
 * turn report data into these items; one table component renders them.
 */

/** How to read a movement: more revenue is good (`up-good`), more cost is not (`up-bad`). */
export type ChangeSense = 'up-good' | 'up-bad' | 'neutral';

export interface StmtLine {
  key: string;
  label: string;
  code?: string | null;
  amount: number;
  /** Amount in the comparison period / at the comparison date; null when not comparing. */
  compare: number | null;
  /** Share of a base (e.g. % of revenue), when shown. */
  share?: number | null;
  /** The source record, handed back when the line is clicked. */
  ref?: unknown;
}

export interface StmtGroup {
  key: string;
  label: string;
  amount: number;
  compare: number | null;
  share?: number | null;
  lines: StmtLine[];
}

export interface StmtBlock {
  key: string;
  /** Null when the block needs no heading (a section with a single block). */
  label: string | null;
  amount: number;
  compare: number | null;
  share?: number | null;
  groups: StmtGroup[];
}

interface Figure {
  key: string;
  label: string;
  amount: number;
  compare: number | null;
  share?: number | null;
  sense: ChangeSense;
}

export type StmtItem =
  /** A coloured band with its blocks, groups and accounts beneath it. */
  | (Figure & { kind: 'section'; tone: ChipTone; blocks: StmtBlock[] })
  /** A single figure line, e.g. Gross loss with a "carried down" tag, coloured by whether it's good news. */
  | (Figure & { kind: 'line'; hint?: string; tone?: ChipTone; tag?: string })
  /** The closing figure of a statement or a side. */
  | (Figure & { kind: 'total'; tone: ChipTone });

/** Percentage change from the comparison amount; null when there was nothing to compare against. */
export const changePct = (amount: number, compare: number | null) =>
  compare === null || Math.abs(compare) < 0.005 ? null : ((amount - compare) / Math.abs(compare)) * 100;

/** Whether a movement is good news, given how the figure should be read. Null when nothing moved. */
export function senseTone(sense: ChangeSense, delta: number): 'positive' | 'negative' | null {
  if (Math.abs(delta) < 0.005 || sense === 'neutral') return null;
  const up = delta > 0;
  return (sense === 'up-bad' ? !up : up) ? 'positive' : 'negative';
}

/** a ÷ base as a percentage, or null without a base. */
export const shareOf = (amount: number, base: number) => (Math.abs(base) < 0.005 ? null : (amount / base) * 100);
