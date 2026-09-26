/**
 * Variance helpers for financial reporting.
 */

export type VarianceTone = 'positive' | 'negative' | 'flat';

/**
 * Returns variance tone based on delta and whether the line represents cost/expense.
 * - Income/Revenue going up (delta > 0) -> positive; going down (delta < 0) -> negative.
 * - Cost/Expense going down (delta < 0) -> positive; going up (delta > 0) -> negative.
 * - Zero change (delta === 0) -> flat.
 */
export function varianceTone(
  delta: number | string | null | undefined,
  isCost?: boolean
): VarianceTone {
  if (delta === null || delta === undefined || delta === '') {
    return 'flat';
  }
  const num = typeof delta === 'number' ? delta : parseFloat(String(delta));
  if (isNaN(num) || num === 0) {
    return 'flat';
  }

  if (isCost) {
    return num < 0 ? 'positive' : 'negative';
  } else {
    return num > 0 ? 'positive' : 'negative';
  }
}
