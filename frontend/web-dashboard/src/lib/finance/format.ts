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
 * Format date to "15 Sep 2026" or custom format string
 */
export function formatDate(d: Date | string | number | null | undefined, fmt?: string): string {
  const dt = parseDateInput(d);
  if (!dt) return '—';
  const day = dt.getDate();
  const month = MONTH_SHORT[dt.getMonth()];
  const year = dt.getFullYear();

  if (fmt === 'MMM d, yyyy') {
    return `${month} ${day}, ${year}`;
  }

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

/**
 * Converts a numeric amount to English words for payment/receipt vouchers.
 * E.g., 3000.00 -> "Three Thousand SAR Only"
 * E.g., 2000.50 -> "Two Thousand SAR and 50/100 Only"
 */
export function amountInWords(amount: number | string | null | undefined, currency = 'SAR'): string {
  let num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  if (isNaN(num) || num <= 0) return `Zero ${currency} Only`;

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertChunk = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += `${units[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n >= 20) {
      str += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    }
    if (n > 0) {
      str += `${units[n]} `;
    }
    return str.trim();
  };

  const integerPart = Math.floor(Math.abs(num));
  const cents = Math.round((Math.abs(num) - integerPart) * 100);

  if (integerPart === 0 && cents === 0) return `Zero ${currency} Only`;

  let words = '';
  let temp = integerPart;

  if (temp >= 1_000_000_000) {
    words += `${convertChunk(Math.floor(temp / 1_000_000_000))} Billion `;
    temp %= 1_000_000_000;
  }
  if (temp >= 1_000_000) {
    words += `${convertChunk(Math.floor(temp / 1_000_000))} Million `;
    temp %= 1_000_000;
  }
  if (temp >= 1_000) {
    words += `${convertChunk(Math.floor(temp / 1_000))} Thousand `;
    temp %= 1_000;
  }
  if (temp > 0) {
    words += convertChunk(temp);
  }

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `${words} ${currency}`;
  if (cents > 0) {
    result += ` and ${cents.toString().padStart(2, '0')}/100`;
  }
  result += ' Only';

  return result;
}

