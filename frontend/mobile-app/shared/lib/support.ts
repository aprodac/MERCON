/** MERCON's support mailbox, shown on the sign-in help sheet, Settings and Help & Support. */
export const SUPPORT_EMAIL = 'support@mercon.sa';

/** Digits only, for wa.me / tel: links ("+966 50 000 0001" → "966500000001"). */
export function phoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
