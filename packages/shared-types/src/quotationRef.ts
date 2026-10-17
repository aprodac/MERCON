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

type QuotationRouteLike = {
  quotation_number?: number | string | null;
  stops?: Array<{ sequence?: number | null; leg_index?: number | null }> | null;
} | null | undefined;

const middleCount = (stops: Array<{ leg_index?: number | null }>, getSeq: (s: any) => number): number => {
  let n = 0;
  for (const leg of [0, 1]) {
    const legStops = stops.filter((s) => (s.leg_index ?? 0) === leg).sort((a, b) => getSeq(a) - getSeq(b));
    if (legStops.length >= 3) n += legStops.length - 2;
  }
  return n;
};

/**
 * "Extra stop · route differs from QT-0123" when the trip has more middle stops
 * than the quotation it was priced on (a stop added after booking). Null when
 * the quotation has no stop list to compare against.
 */
export function extraStopNote(
  trip: { stops?: Array<{ leg_index?: number | null; stop_sequence?: number | null; deletedAt?: unknown }> | null; quotation?: QuotationRouteLike } | null | undefined,
): string | null {
  const q = trip?.quotation;
  if (!q || !q.stops || q.stops.length === 0) return null;
  const tripMiddle = middleCount((trip?.stops ?? []).filter((s) => !s.deletedAt), (s) => s.stop_sequence ?? 0);
  const quoteMiddle = middleCount(q.stops, (s) => s.sequence ?? 0);
  if (tripMiddle <= quoteMiddle) return null;
  const ref = formatQuotationRef(q.quotation_number);
  return ref ? `Extra stop · route differs from ${ref}` : 'Extra stop · route differs from the quotation';
}

/** The customer's "additional / extra stop" surcharge rule, if one is saved (active first). */
export function findExtraStopRule<T extends { charge_type?: string | null; is_active?: boolean | null }>(rules: T[] | null | undefined): T | null {
  const hits = (rules ?? []).filter((r) => /(additional|extra)[\s_-]*stops?/i.test(r.charge_type ?? ''));
  return hits.find((r) => r.is_active !== false) ?? hits[0] ?? null;
}
