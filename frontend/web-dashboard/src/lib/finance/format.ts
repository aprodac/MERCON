/**
 * Finance formatting utilities.
 */

export interface FormatMoneyOptions {
  currency?: string;
  signed?: boolean;
}

/**
 * Format a numeric/string/null amount with 2 decimal places and en-US thousands separators.
 * Supports optional currency prefix and sign options (+ prefix for positive, U+2212 minus for negative).
 */
export function formatMoney(
  value: number | string | null | undefined,
  opts?: FormatMoneyOptions
): string {
  let num: number;
  if (value === null || value === undefined || value === '') {
    num = 0;
  } else if (typeof value === 'number') {
    num = isNaN(value) ? 0 : value;
  } else {
    const parsed = parseFloat(String(value));
    num = isNaN(parsed) ? 0 : parsed;
  }

  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let signStr = '';
  if (opts?.signed) {
    if (num > 0) {
      signStr = '+';
    } else if (num < 0) {
      signStr = '\u2212';
    }
  } else if (num < 0) {
    signStr = '-';
  }

  const currStr = opts?.currency ? `${opts.currency} ` : '';
  return `${currStr}${signStr}${absFormatted}`;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Parses input into a Date object or null if invalid.
 */
function parseDateInput(d: Date | string | number | null | undefined): Date | null {
  if (d === null || d === undefined || d === '') return null;
  if (d instanceof Date) {
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof d === 'string') {
    // If YYYY-MM-DD format, construct local Date to prevent timezone offset shifts
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const dt = new Date(year, month, day);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Format date to "15 Sep 2026"
 */
export function formatDate(d: Date | string | number | null | undefined): string {
  const dt = parseDateInput(d);
  if (!dt) return '—';
  const day = dt.getDate();
  const month = MONTH_SHORT[dt.getMonth()];
  const year = dt.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format a number/string percentage, e.g. formatPct(7.1) -> "7.1%"
 */
export function formatPct(n: number | string | null | undefined, digits = 1): string {
  let num: number;
  if (n === null || n === undefined || n === '') {
    num = 0;
  } else if (typeof n === 'number') {
    num = isNaN(n) ? 0 : n;
  } else {
    const parsed = parseFloat(String(n));
    num = isNaN(parsed) ? 0 : parsed;
  }
  return `${num.toFixed(digits)}%`;
}

export interface DueLabelParams {
  due_date?: string | Date | null;
  status?: string | null;
  balance_due?: number | string | null;
  paid_at?: string | Date | null;
}

/**
 * Computes human-readable due label e.g.:
 * "Due in N days" | "Due today" | "Overdue N days" | "Paid DD Mon" | "—"
 */
export function dueLabel(doc: DueLabelParams, today: Date = new Date()): string {
  const statusUpper = (doc.status || '').toUpperCase();
  const isPaidStatus =
    statusUpper === 'PAID' ||
    statusUpper === 'COMPLETED' ||
    statusUpper === 'FULLYAPPLIED';

  if (isPaidStatus) {
    const paidDate = parseDateInput(doc.paid_at || doc.due_date);
    if (paidDate) {
      const day = paidDate.getDate();
      const month = MONTH_SHORT[paidDate.getMonth()];
      return `Paid ${day} ${month}`;
    }
    return 'Paid';
  }

  if (statusUpper === 'VOID' || statusUpper === 'VOIDED') {
    return '—';
  }

  const dueDate = parseDateInput(doc.due_date);
  if (!dueDate) return '—';

  // Normalize dates to start of day for accurate day diff calculation
  const startDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffTime = startDueDate.getTime() - startToday.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays > 0) {
    return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  } else {
    const overdueDays = Math.abs(diffDays);
    return `Overdue ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
  }
}
