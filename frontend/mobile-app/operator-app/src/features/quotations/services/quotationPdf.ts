/**
 * Downloads a quotation PDF from the API (signed in as the operator) into the
 * app's cache and opens the phone's share sheet with the file — the operator
 * picks WhatsApp / email and the chat. Same expo-sharing path as the
 * documents page. Rates only: the PDF never carries driver pay.
 */
import { API_URL, ensureAuthToken } from '@mercon/mobile-shared/lib/api';

/** One quotation (`id`), or a customer's rate sheet (all active, or just `ids`). */
export type QuotationPdfTarget = { id: string } | { customerId: string; ids?: string[] };

export async function shareQuotationPdf(target: QuotationPdfTarget, fileName: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');

  const base = (API_URL || '').replace(/\/$/, '');
  const url = 'id' in target
    ? `${base}/quotations/${encodeURIComponent(target.id)}/pdf`
    : `${base}/quotations/pdf?customerId=${encodeURIComponent(target.customerId)}${target.ids?.length ? `&ids=${target.ids.map(encodeURIComponent).join(',')}` : ''}`;
  const token = await ensureAuthToken();
  const safe = fileName.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'quotation';
  // A fresh name each time: rates change, and a cached old PDF must never be sent.
  const target_ = `${FileSystem.cacheDirectory}${safe}-${Date.now()}.pdf`;

  const res = await FileSystem.downloadAsync(url, target_, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res || (res.status && res.status >= 400)) throw new Error(`Could not make the PDF (HTTP ${res?.status ?? '?'})`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone');
  await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Send quotation' });
}
