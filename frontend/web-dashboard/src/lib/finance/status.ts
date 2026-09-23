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
    bg: 'bg-[#ECFDF3] dark:bg-emerald-950/40',
    text: 'text-[#15803D] dark:text-emerald-400',
    dot: 'bg-[#15803D] dark:bg-emerald-400',
    combined:
      'bg-[#ECFDF3] text-[#15803D] dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  negative: {
    bg: 'bg-[#FEF1EE] dark:bg-orange-950/40',
    text: 'text-[#C2410C] dark:text-orange-400',
    dot: 'bg-[#C2410C] dark:bg-orange-400',
    combined:
      'bg-[#FEF1EE] text-[#C2410C] dark:bg-orange-950/40 dark:text-orange-400',
  },
  info: {
    bg: 'bg-[#EEF3FF] dark:bg-blue-950/40',
    text: 'text-[#1D4ED8] dark:text-blue-300',
    dot: 'bg-[#1D4ED8] dark:bg-blue-300',
    combined:
      'bg-[#EEF3FF] text-[#1D4ED8] dark:bg-blue-950/40 dark:text-blue-300',
  },
  warning: {
    bg: 'bg-[#FFF6E5] dark:bg-amber-950/40',
    text: 'text-[#B45309] dark:text-amber-300',
    dot: 'bg-[#B45309] dark:bg-amber-300',
    combined:
      'bg-[#FFF6E5] text-[#B45309] dark:bg-amber-950/40 dark:text-amber-300',
  },
  neutral: {
    bg: 'bg-[#F1F2F5] dark:bg-slate-800',
    text: 'text-[#4B4B57] dark:text-slate-300',
    dot: 'bg-[#4B4B57] dark:bg-slate-300',
    combined:
      'bg-[#F1F2F5] text-[#4B4B57] dark:bg-slate-800 dark:text-slate-300',
  },
  muted: {
    bg: 'bg-[#F4F4F6] dark:bg-slate-800/60',
    text: 'text-[#6E6E80] dark:text-slate-400',
    dot: 'bg-[#6E6E80] dark:bg-slate-400',
    combined:
      'bg-[#F4F4F6] text-[#6E6E80] dark:bg-slate-800/60 dark:text-slate-400',
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
