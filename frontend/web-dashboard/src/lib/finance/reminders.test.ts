import { describe, expect, it } from 'vitest';
import type { AgeingDocument } from './ageing';
import { buildReminder, reminderSubject, suggestTone } from './reminders';

const doc = (ref: string, due: string, days: number, balance: number): AgeingDocument => ({
  id: ref, ref_id: ref, doc_date: '2026-07-01', due_date: due, days_overdue: days, balance, bucket: days > 30 ? '31-60' : days > 0 ? '1-30' : 'current',
  party_id: 'najd', party_name: 'Najd Steel Works',
});

const najd = [doc('INV-0004', '2026-08-27', 29, 6650), doc('INV-0011', '2026-10-19', 0, 5060)];

describe('payment reminders', () => {
  it('suggests a tone from the oldest overdue invoice', () => {
    expect(suggestTone(najd)).toBe('friendly');
    expect(suggestTone([doc('INV-0003', '2026-08-19', 37, 13800)])).toBe('firm');
    expect(suggestTone([doc('INV-0001', '2026-06-01', 116, 500)])).toBe('final');
    expect(suggestTone([])).toBe('friendly');
  });

  it('lists every invoice with its due date and the total', () => {
    const text = buildReminder({ customerName: 'Najd Steel Works', companyName: 'Mercon', docs: najd, tone: 'friendly', asOf: '2026-09-25' }, 'en');
    expect(text).toContain('Dear Najd Steel Works,');
    expect(text).toContain('INV-0004 — SAR 6,650.00, due 27 Aug 2026 (29 days overdue)');
    expect(text).toContain('INV-0011 — SAR 5,060.00, due 19 Oct 2026');
    expect(text).toContain('Total: SAR 11,710.00');
    expect(text).not.toContain('IBAN');
  });

  it('gives a pay-by date for firm and final tones and adds bank details', () => {
    const input = { customerName: 'Red Sea Logistics', companyName: 'Mercon', docs: najd, asOf: '2026-09-25', bank: { name: 'Al Rajhi', iban: 'SA00 0000' } };
    expect(buildReminder({ ...input, tone: 'firm' }, 'en')).toContain('Please arrange payment by 2 Oct 2026.');
    expect(buildReminder({ ...input, tone: 'final' }, 'en')).toContain('by 28 Sep 2026');
    expect(buildReminder({ ...input, tone: 'firm' }, 'en')).toContain('Bank transfer: Al Rajhi · IBAN SA00 0000');
  });

  it('writes the Arabic version', () => {
    const text = buildReminder({ customerName: 'Najd Steel Works', companyName: 'Mercon', docs: najd, tone: 'firm', asOf: '2026-09-25' }, 'ar');
    expect(text).toContain('السادة Najd Steel Works المحترمين،');
    expect(text).toContain('الإجمالي: 11,710.00 ريال');
  });

  it('names the tone in the email subject', () => {
    expect(reminderSubject('Mercon', 'final')).toBe('Final notice: overdue invoices — Mercon');
  });
});
