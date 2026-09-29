import { addDays, dueOn, sumBalance, type AgeingDocument } from './ageing';
import { formatDate, formatMoney } from './format';

export type ReminderTone = 'friendly' | 'firm' | 'final';
export type ReminderLanguage = 'en' | 'ar';

export const REMINDER_TONES: { key: ReminderTone; label: string; hint: string }[] = [
  { key: 'friendly', label: 'Friendly', hint: 'Up to 30 days overdue' },
  { key: 'firm', label: 'Firm', hint: '31–60 days overdue' },
  { key: 'final', label: 'Final notice', hint: 'Over 60 days overdue' },
];

/** Suggested tone from the oldest overdue invoice. */
export function suggestTone(docs: AgeingDocument[]): ReminderTone {
  const oldest = Math.max(0, ...docs.map((d) => d.days_overdue));
  if (oldest > 60) return 'final';
  if (oldest > 30) return 'firm';
  return 'friendly';
}

export interface ReminderInput {
  customerName: string;
  companyName: string;
  docs: AgeingDocument[];
  tone: ReminderTone;
  asOf: string;
  bank?: { name: string; iban: string } | null;
}

const COPY = {
  en: {
    greeting: (name: string) => `Dear ${name},`,
    intro: {
      friendly: (co: string) => `This is a friendly reminder that the following invoices are open on your account with ${co}:`,
      firm: (co: string) => `Our records show that the following invoices on your account with ${co} are now overdue:`,
      final: (co: string) => `Despite our earlier reminders, the following invoices on your account with ${co} remain unpaid:`,
    },
    line: (d: AgeingDocument) =>
      `• ${d.ref_id ?? 'Invoice'} — SAR ${formatMoney(d.balance)}, due ${formatDate(dueOn(d))}${d.days_overdue > 0 ? ` (${d.days_overdue} days overdue)` : ''}`,
    total: (amount: number) => `Total: SAR ${formatMoney(amount)}`,
    ask: {
      friendly: () => 'We would be grateful if you could arrange payment at your earliest convenience.',
      firm: (by: string) => `Please arrange payment by ${by}.`,
      final: (by: string) => `Please settle this balance by ${by}, or contact us to agree a payment plan.`,
    },
    bank: (b: { name: string; iban: string }) => `Bank transfer: ${b.name} · IBAN ${b.iban}`,
    paid: 'If you have already paid, please ignore this message and send us the payment reference.',
    signoff: (co: string) => `Thank you,\n${co}`,
    subject: (co: string, tone: ReminderTone) =>
      tone === 'final' ? `Final notice: overdue invoices — ${co}` : tone === 'firm' ? `Overdue invoices — ${co}` : `Payment reminder — ${co}`,
  },
  ar: {
    greeting: (name: string) => `السادة ${name} المحترمين،`,
    intro: {
      friendly: (co: string) => `نود تذكيركم بلطف بأن الفواتير التالية مستحقة على حسابكم لدى ${co}:`,
      firm: (co: string) => `نفيدكم بأن الفواتير التالية على حسابكم لدى ${co} قد تجاوزت تاريخ استحقاقها:`,
      final: (co: string) => `رغم تذكيراتنا السابقة، لا تزال الفواتير التالية على حسابكم لدى ${co} غير مسددة:`,
    },
    line: (d: AgeingDocument) =>
      `• ${d.ref_id ?? 'فاتورة'} — ${formatMoney(d.balance)} ريال، تاريخ الاستحقاق ${formatDate(dueOn(d))}${d.days_overdue > 0 ? ` (متأخرة ${d.days_overdue} يوماً)` : ''}`,
    total: (amount: number) => `الإجمالي: ${formatMoney(amount)} ريال`,
    ask: {
      friendly: () => 'نرجو التكرم بالسداد في أقرب وقت ممكن.',
      firm: (by: string) => `نرجو السداد في موعد أقصاه ${by}.`,
      final: (by: string) => `نرجو سداد هذا الرصيد في موعد أقصاه ${by}، أو التواصل معنا للاتفاق على خطة سداد.`,
    },
    bank: (b: { name: string; iban: string }) => `للتحويل البنكي: ${b.name} - رقم الآيبان ${b.iban}`,
    paid: 'إذا تم السداد بالفعل، يرجى تجاهل هذه الرسالة وتزويدنا بمرجع الدفع.',
    signoff: (co: string) => `شكراً لكم،\n${co}`,
  },
};

/** Days given to pay, by tone. */
const PAY_WITHIN: Record<ReminderTone, number> = { friendly: 0, firm: 7, final: 3 };

export function buildReminder(input: ReminderInput, language: ReminderLanguage): string {
  const t = COPY[language];
  const by = formatDate(addDays(input.asOf, PAY_WITHIN[input.tone]));
  const ask = input.tone === 'friendly' ? t.ask.friendly() : t.ask[input.tone](by);
  return [
    t.greeting(input.customerName),
    '',
    t.intro[input.tone](input.companyName),
    '',
    ...input.docs.map(t.line),
    '',
    t.total(sumBalance(input.docs)),
    '',
    ask,
    ...(input.bank ? [t.bank(input.bank)] : []),
    t.paid,
    '',
    t.signoff(input.companyName),
  ].join('\n');
}

export const reminderSubject = (companyName: string, tone: ReminderTone) => COPY.en.subject(companyName, tone);
