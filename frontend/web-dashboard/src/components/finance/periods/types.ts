import type { AccountingPeriod } from '@mercon/shared-types';
import type { ExportColumn } from '@/components/ui/ExportModal';
import { formatDate } from '@/lib/finance';

export type PeriodRow = AccountingPeriod & { _count?: { journalEntries: number } };

export const ACCOUNTING_PERIODS_EXPORT_COLUMNS: ExportColumn<PeriodRow>[] = [
  { id: 'name', label: 'Period Name', accessor: (p) => p.name },
  { id: 'start_date', label: 'Start Date', accessor: (p) => formatDate(p.start_date) },
  { id: 'end_date', label: 'End Date', accessor: (p) => formatDate(p.end_date) },
  { id: 'status', label: 'Status', accessor: (p) => p.status },
  { id: 'journal_entries_count', label: 'Journal Entries Count', accessor: (p) => p._count?.journalEntries || 0 },
];

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface PeriodChecklist {
  draftJeCount: number;
  draftInvoiceCount: number;
  draftBillCount: number;
  overdueInvoiceCount: number;
  unreconciledAccountNames: string[];
  isTbBalanced: boolean;
  prevPeriod: PeriodRow | null;
  isPrevPeriodClosed: boolean;
  check1_blocker: boolean;
  check2_warning: boolean;
  check3_warning: boolean;
  check4_warning: boolean;
  check5_check: boolean;
  check6_warning: boolean;
  checksPassedCount: number;
  hasWarnings: boolean;
}
