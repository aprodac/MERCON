/**
 * Quotation numbers shown like trip numbers: QT-0001, QT-0668. The number is
 * `Quotation.quotation_number`; numbers past 9999 simply grow (QT-12345).
 */
export function formatQuotationRef(quotationNumber: number | string | null | undefined): string | null {
  if (quotationNumber == null || quotationNumber === '') return null;
  const n = Number(quotationNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `QT-${String(Math.trunc(n)).padStart(4, '0')}`;
}
