import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatMoney,
  formatPct,
  dueLabel,
  amountInWords,
  FIN_STATUS,
  FIN_TONE_CLASSES,
  getDisplayStatus,
  varianceTone,
} from './index';

describe('Finance Formatting Helpers (format.ts)', () => {
  describe('formatMoney', () => {
    it('formats standard numbers with 2 decimals and grouping', () => {
      expect(formatMoney(12650)).toBe('12,650.00');
      expect(formatMoney(12650.5)).toBe('12,650.50');
    });

    it('formats string amounts correctly', () => {
      expect(formatMoney('12650.50')).toBe('12,650.50');
      expect(formatMoney('0')).toBe('0.00');
    });

    it('handles negative amounts', () => {
      expect(formatMoney(-1200)).toBe('-1,200.00');
      expect(formatMoney('-1200.75')).toBe('-1,200.75');
    });

    it('handles zero and null / undefined values', () => {
      expect(formatMoney(0)).toBe('0.00');
      expect(formatMoney(null)).toBe('0.00');
      expect(formatMoney(undefined)).toBe('0.00');
      expect(formatMoney('invalid')).toBe('0.00');
    });

    it('supports signed option with U+2212 minus and + prefix', () => {
      expect(formatMoney(1200, { signed: true })).toBe('+1,200.00');
      expect(formatMoney(-1200, { signed: true })).toBe('−1,200.00');
      expect(formatMoney(0, { signed: true })).toBe('0.00');
    });

    it('supports currency option', () => {
      expect(formatMoney(12650, { currency: 'SAR' })).toBe('SAR 12,650.00');
      expect(formatMoney(-1200, { currency: 'SAR', signed: true })).toBe('SAR −1,200.00');
    });
  });

  describe('amountInWords', () => {
    it('converts whole numbers to English words with currency', () => {
      expect(amountInWords(3000, 'SAR')).toBe('Three Thousand SAR Only');
      expect(amountInWords(1250, 'USD')).toBe('One Thousand Two Hundred Fifty USD Only');
    });

    it('converts numbers with cents/halalas', () => {
      expect(amountInWords(2000.5, 'SAR')).toBe('Two Thousand SAR and 50/100 Only');
      expect(amountInWords('150.25', 'SAR')).toBe('One Hundred Fifty SAR and 25/100 Only');
    });

    it('handles zero or negative amounts gracefully', () => {
      expect(amountInWords(0, 'SAR')).toBe('Zero SAR Only');
      expect(amountInWords(-100, 'SAR')).toBe('Zero SAR Only');
      expect(amountInWords(null, 'SAR')).toBe('Zero SAR Only');
    });
  });

  describe('formatDate', () => {
    it('formats YYYY-MM-DD date strings into "15 Sep 2026"', () => {
      expect(formatDate('2026-09-15')).toBe('15 Sep 2026');
    });

    it('formats Date instances', () => {
      const dt = new Date(2026, 8, 15);
      expect(formatDate(dt)).toBe('15 Sep 2026');
    });

    it('returns "—" for null, undefined, or invalid dates', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('invalid-date')).toBe('—');
    });
  });

  describe('formatPct', () => {
    it('formats percentage values', () => {
      expect(formatPct(7.1)).toBe('7.1%');
      expect(formatPct('7.14', 1)).toBe('7.1%');
      expect(formatPct(12.3456, 2)).toBe('12.35%');
    });

    it('handles zero and null values', () => {
      expect(formatPct(0)).toBe('0.0%');
      expect(formatPct(null)).toBe('0.0%');
      expect(formatPct(undefined)).toBe('0.0%');
    });
  });

  describe('dueLabel', () => {
    const mockToday = new Date(2026, 8, 15); // 15 Sep 2026

    it('returns "Due in N days" for future due dates', () => {
      expect(
        dueLabel(
          { due_date: '2026-09-25', status: 'Issued', balance_due: 500 },
          mockToday
        )
      ).toBe('Due in 10 days');
    });

    it('returns "Due today" when due date is today', () => {
      expect(
        dueLabel(
          { due_date: '2026-09-15', status: 'Issued', balance_due: 500 },
          mockToday
        )
      ).toBe('Due today');
    });

    it('returns "Overdue N days" when due date is past', () => {
      expect(
        dueLabel(
          { due_date: '2026-09-10', status: 'Issued', balance_due: 500 },
          mockToday
        )
      ).toBe('Overdue 5 days');
    });

    it('returns "Paid DD Mon" for paid documents', () => {
      expect(
        dueLabel({
          status: 'Paid',
          paid_at: '2026-09-12',
          balance_due: 0,
        })
      ).toBe('Paid 12 Sep');
    });

    it('returns "—" for void documents or missing due dates', () => {
      expect(dueLabel({ status: 'Void' })).toBe('—');
      expect(dueLabel({ due_date: null, status: 'Draft' })).toBe('—');
    });
  });
});

describe('Finance Status Helpers (status.ts)', () => {
  it('defines valid FIN_STATUS mappings for all kinds', () => {
    expect(FIN_STATUS.invoice.Issued).toEqual({ label: 'Issued', tone: 'info' });
    expect(FIN_STATUS.invoice.Overdue).toEqual({ label: 'Overdue', tone: 'negative' });
    expect(FIN_STATUS.bill.Approved).toEqual({ label: 'Approved', tone: 'info' });
    expect(FIN_STATUS.journal.Posted).toEqual({ label: 'Posted', tone: 'positive' });
    expect(FIN_STATUS.period.Open).toEqual({ label: 'Open', tone: 'positive' });
  });

  it('provides tone class mappings in FIN_TONE_CLASSES', () => {
    expect(FIN_TONE_CLASSES.positive.text).toContain('text-[#15803D]');
    expect(FIN_TONE_CLASSES.negative.text).toContain('text-[#C2410C]');
  });

  describe('getDisplayStatus', () => {
    const mockToday = new Date(2026, 8, 15); // 15 Sep 2026

    it('returns "Overdue" for open invoices with due date in the past and balance > 0', () => {
      const doc = { status: 'Issued', due_date: '2026-09-10', balance_due: 100 };
      expect(getDisplayStatus('invoice', doc, mockToday)).toBe('Overdue');
    });

    it('returns original status if due date is in the future', () => {
      const doc = { status: 'Issued', due_date: '2026-09-20', balance_due: 100 };
      expect(getDisplayStatus('invoice', doc, mockToday)).toBe('Issued');
    });

    it('returns "Paid" if status is Paid even if due date was in the past', () => {
      const doc = { status: 'Paid', due_date: '2026-09-10', balance_due: 0 };
      expect(getDisplayStatus('invoice', doc, mockToday)).toBe('Paid');
    });

    it('returns "Draft" if status is Draft even if due date was in the past', () => {
      const doc = { status: 'Draft', due_date: '2026-09-10', balance_due: 100 };
      expect(getDisplayStatus('invoice', doc, mockToday)).toBe('Draft');
    });

    it('handles bills correctly', () => {
      const doc = { status: 'Approved', due_date: '2026-09-10', balance_due: '250.00' };
      expect(getDisplayStatus('bill', doc, mockToday)).toBe('Overdue');
    });
  });
});

describe('Finance Variance Helpers (variance.ts)', () => {
  it('handles income / revenue variance (isCost = false)', () => {
    expect(varianceTone(100, false)).toBe('positive');
    expect(varianceTone(-100, false)).toBe('negative');
    expect(varianceTone(0, false)).toBe('flat');
  });

  it('handles cost / expense variance (isCost = true)', () => {
    expect(varianceTone(100, true)).toBe('negative');
    expect(varianceTone(-100, true)).toBe('positive');
    expect(varianceTone(0, true)).toBe('flat');
  });

  it('handles string amounts, zero, and null', () => {
    expect(varianceTone('50.5', false)).toBe('positive');
    expect(varianceTone('-50.5', true)).toBe('positive');
    expect(varianceTone(null, false)).toBe('flat');
    expect(varianceTone(undefined, true)).toBe('flat');
  });
});
