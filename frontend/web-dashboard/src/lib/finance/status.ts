/**
 * Finance status mapping and display status helpers.
 */

export type FinKind =
  | 'invoice'
  | 'bill'
  | 'journal'
  | 'period'
  | 'advance'
  | 'reconciliation';

export type FinTone =
  | 'positive'
  | 'negative'
  | 'info'
  | 'warning'
  | 'neutral'
  | 'muted';

export const FIN_TONE_CLASSES: Record<
  FinTone,
  { bg: string; text: string; dot: string; combined: string }
> = {
  positive: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    combined:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border',
  },
  negative: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-600 dark:bg-rose-400',
    combined:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400 border',
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-400',
    dot: 'bg-sky-600 dark:bg-sky-400',
    combined:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-400 border',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-600 dark:bg-amber-400',
    combined:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border',
  },
  neutral: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    combined:
      'border-border bg-muted text-muted-foreground border',
  },
  muted: {
    bg: 'bg-muted/60',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/60',
    combined:
      'border-border/60 bg-muted/60 text-muted-foreground border',
  },
};

export const FIN_STATUS: Record<
  FinKind,
  Record<string, { label: string; tone: FinTone }>
> = {
  invoice: {
    Draft: { label: 'Draft', tone: 'neutral' },
    Issued: { label: 'Issued', tone: 'info' },
    PartiallyPaid: { label: 'Partially paid', tone: 'warning' },
    Paid: { label: 'Paid', tone: 'positive' },
    Void: { label: 'Void', tone: 'muted' },
    Overdue: { label: 'Overdue', tone: 'negative' },
  },
  bill: {
    Draft: { label: 'Draft', tone: 'neutral' },
    Approved: { label: 'Approved', tone: 'info' },
    PartiallyPaid: { label: 'Partially paid', tone: 'warning' },
    Paid: { label: 'Paid', tone: 'positive' },
    Void: { label: 'Void', tone: 'muted' },
    Overdue: { label: 'Overdue', tone: 'negative' },
  },
  journal: {
    Draft: { label: 'Draft', tone: 'neutral' },
    Posted: { label: 'Posted', tone: 'positive' },
    Voided: { label: 'Voided', tone: 'muted' },
  },
  period: {
    Open: { label: 'Open', tone: 'positive' },
    Closed: { label: 'Closed', tone: 'warning' },
    Locked: { label: 'Locked', tone: 'neutral' },
  },
  advance: {
    Open: { label: 'Open', tone: 'info' },
    PartiallyApplied: { label: 'Partially applied', tone: 'warning' },
    FullyApplied: { label: 'Fully applied', tone: 'positive' },
    Void: { label: 'Void', tone: 'muted' },
  },
  reconciliation: {
    Draft: { label: 'In progress', tone: 'neutral' },
    Completed: { label: 'Completed', tone: 'positive' },
  },
};

export interface StatusDocParams {
  status?: string | null;
  due_date?: string | Date | null;
  balance_due?: number | string | null;
  balance?: number | string | null;
}

/**
 * Returns 'Overdue' for open docs (Issued / Approved / PartiallyPaid) whose due_date is before today and balance > 0.
 * Otherwise returns doc.status.
 */
export function getDisplayStatus(
  kind: FinKind,
  doc: StatusDocParams,
  today: Date = new Date()
): string {
  const status = doc.status || 'Draft';

  if (kind === 'invoice' || kind === 'bill') {
    const isOpenStatus =
      status === 'Issued' || status === 'Approved' || status === 'PartiallyPaid';

    if (isOpenStatus && doc.due_date) {
      const balanceVal = doc.balance_due ?? doc.balance;
      const numBalance =
        balanceVal === null || balanceVal === undefined
          ? 1 // default to > 0 if unstated for open status
          : typeof balanceVal === 'number'
          ? balanceVal
          : parseFloat(String(balanceVal));

      if (numBalance > 0) {
        let dueDateObj: Date;
        if (typeof doc.due_date === 'string') {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(doc.due_date.trim());
          if (match) {
            dueDateObj = new Date(
              parseInt(match[1], 10),
              parseInt(match[2], 10) - 1,
              parseInt(match[3], 10)
            );
          } else {
            dueDateObj = new Date(doc.due_date);
          }
        } else {
          dueDateObj = new Date(doc.due_date);
        }

        const startDueDate = new Date(
          dueDateObj.getFullYear(),
          dueDateObj.getMonth(),
          dueDateObj.getDate()
        );
        const startToday = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        if (startDueDate < startToday) {
          return 'Overdue';
        }
      }
    }
  }

  return status;
}
