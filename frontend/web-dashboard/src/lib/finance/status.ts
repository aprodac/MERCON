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
    bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    combined:
      'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  negative: {
    bg: 'bg-rose-500/10 dark:bg-rose-400/10',
    text: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-600 dark:bg-rose-400',
    combined:
      'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20',
  },
  info: {
    bg: 'bg-sky-500/10 dark:bg-sky-400/10',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-600 dark:bg-sky-400',
    combined:
      'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20',
  },
  warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-400/10',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-600 dark:bg-amber-400',
    combined:
      'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  },
  neutral: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    combined:
      'bg-muted text-muted-foreground ring-border',
  },
  muted: {
    bg: 'bg-muted/60',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/60',
    combined:
      'bg-muted/60 text-muted-foreground ring-border/50',
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
