/**
 * Sequential, zero-padded reference ID generator (e.g. "TRP-0001", "INV-0001", "DRV-0001", "TRK-0001").
 *
 * Fills numerical gaps starting from 1 (e.g., if TRP-0211 was deleted, 0211 is freed
 * and will be generated if 0210 is the preceding record).
 */

export interface RefIdOptions {
  /** Format number with zero padding, e.g. 4 digits ("0001"). Default 4. */
  padLength?: number;
  /** Include the current year, e.g. "INV-2026-0001". Default false. */
  year?: boolean;
  /**
   * Treat numbers of soft-deleted records (renamed "TRP-DEL-0289-…") as taken,
   * so a number is never handed out twice. Trips use it: a reused number made
   * old WhatsApp shares, notifications and tracking links point at another trip.
   */
  keepDeletedNumbers?: boolean;
}

/**
 * Generate a sequential reference ID for the given prefix.
 * `getAllRefIds` should fetch active records select { ref_id: true }.
 */
export async function generateSequentialRefId(
  prefix: string,
  getAllRefIds: () => Promise<{ ref_id: string | null }[]>,
  opts: RefIdOptions = {},
): Promise<string> {
  const { padLength = 4, year = false, keepDeletedNumbers = false } = opts;
  const deletedPrefix = `${prefix}-DEL-`;
  const yearPart = year ? `${new Date().getFullYear()}-` : '';
  const fullPrefix = `${prefix}-${yearPart}`;

  const records = await getAllRefIds();
  const existingNumbers = new Set<number>();

  for (const record of records) {
    if (!record.ref_id) continue;
    if (record.ref_id.startsWith(deletedPrefix)) {
      if (!keepDeletedNumbers) continue;
      // "TRP-DEL-0289-45fde4bb" → 289
      const num = parseInt(record.ref_id.slice(deletedPrefix.length + yearPart.length), 10);
      if (!isNaN(num) && num > 0) existingNumbers.add(num);
      continue;
    }
    if (!record.ref_id.startsWith(fullPrefix)) continue;
    if (record.ref_id.includes('-DEL-')) continue;
    const numPart = record.ref_id.slice(fullPrefix.length);
    const num = parseInt(numPart, 10);
    if (!isNaN(num) && num > 0) {
      existingNumbers.add(num);
    }
  }

  let nextNum = 1;
  while (existingNumbers.has(nextNum)) {
    nextNum++;
  }

  const paddedNum = String(nextNum).padStart(padLength, '0');
  return `${fullPrefix}${paddedNum}`;
}

export async function generateRefId(
  prefix: string,
  getAllRefIds: () => Promise<{ ref_id: string | null }[]>,
  opts: RefIdOptions = {},
): Promise<string> {
  return generateSequentialRefId(prefix, getAllRefIds, opts);
}

export async function nextJournalEntryRefId(client: any): Promise<string> {
  return generateRefId(
    'JE',
    () => client.journalEntry.findMany({ select: { ref_id: true } }),
    { padLength: 4 },
  );
}

export async function nextBillRefId(client: any): Promise<string> {
  return generateRefId(
    'BIL',
    () => client.bill.findMany({ select: { ref_id: true } }),
    { padLength: 4 },
  );
}


