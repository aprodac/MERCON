import { prisma } from '../db';

/**
 * Works out which Driver/Vehicle a document belongs to, and which configured
 * DocumentType it is, from whatever signals a file carries: its filename, the
 * plate/ID numbers Gemini read out of it, and the raw OCR body text.
 *
 * Extracted from bulkOcrController's inline auto-assign logic so the import
 * pipeline and the legacy auto-assign screen share one implementation — two
 * copies of "how do we identify a document" drifting apart is exactly how the
 * old flow ended up proposing different owners in different screens.
 *
 * Deliberately never invents fleet records. The previous auto-assign path
 * would create a Vehicle named "Vehicle 9973" whenever it saw unfamiliar plate
 * digits, which is where the junk vehicles in the fleet list came from. An
 * unmatched file returns confidence NONE and is resolved by a human instead.
 */

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface MatchSignals {
  filename?: string | null;
  aiExtracted?: any;
  ocrRawText?: string | null;
}

export interface OwnerMatch {
  ownerType: 'Driver' | 'Vehicle' | null;
  ownerId: string | null;
  ownerName: string | null;
  confidence: MatchConfidence;
  reason: string;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeArabicDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

interface VehicleLite {
  id: string;
  plate_number: string | null;
  ref_id: string | null;
}
interface DriverLite {
  id: string;
  first_name: string;
  last_name: string;
  ref_id: string | null;
  license_number: string | null;
}

export interface MatchCandidates {
  vehicles: VehicleLite[];
  drivers: DriverLite[];
}

function normName(s: string): string {
  if (!s) return '';
  let clean = s.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  return clean.split(' ').map(t => {
    if (['mohd', 'mhd', 'md', 'mohammed', 'mohammad', 'muhammed', 'muhammad'].includes(t)) return 'muhammad';
    return t;
  }).join(' ').trim();
}

/** Loads the fleet once so a batch of N files doesn't issue 2N queries. */
export async function loadMatchCandidates(): Promise<MatchCandidates> {
  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { deletedAt: null },
      select: { id: true, plate_number: true, ref_id: true },
    }),
    prisma.driver.findMany({
      where: { deletedAt: null },
      select: { id: true, first_name: true, last_name: true, ref_id: true, license_number: true },
    }),
  ]);
  return { vehicles, drivers } as MatchCandidates;
}

export function matchOwner(signals: MatchSignals, candidates: MatchCandidates): OwnerMatch {
  const filename = (signals.filename || '')
    .replace(/^[0-9]+-/, '') // strip the multer timestamp prefix
    .toLowerCase();
  const rawText = normalizeArabicDigits(signals.ocrRawText || '').toLowerCase();
  const ai: any = signals.aiExtracted || {};
  const aiPlate = normalizeArabicDigits((ai.vehicle_plate || '').toString()).toLowerCase();
  const aiDocNum = normalizeArabicDigits((ai.document_number || ai.iqama_number || ai.resident_id || ai.license_number || ai.id_number || '').toString()).toLowerCase();
  const aiExtra = normalizeArabicDigits(JSON.stringify(ai.extra_details || {})).toLowerCase();
  const aiDriverName = (ai.driver_name || ai.name || ai.person_name || ai.owner_name || ai.extra_details?.owner_name || ai.extra_details?.driver_name || '').toString();
  const normAiDriverName = normName(aiDriverName);

  const noMatch: OwnerMatch = {
    ownerType: null,
    ownerId: null,
    ownerName: null,
    confidence: 'NONE',
    reason: 'Could not determine an owner from this document',
  };

  // ── Vehicles ──────────────────────────────────────────────────────────────
  for (const v of candidates.vehicles) {
    const plateStr = normalizeArabicDigits(v.plate_number || '').toLowerCase().trim();
    const plateDigits = plateStr.replace(/\D/g, '');
    const refStr = (v.ref_id || '').toLowerCase().trim();
    const name = v.plate_number || v.ref_id || 'Vehicle';

    // Exact plate as written on the document is the strongest signal there is.
    if (plateStr && plateStr.length >= 3 && (aiPlate.includes(plateStr) || filename.includes(plateStr))) {
      return { ownerType: 'Vehicle', ownerId: v.id, ownerName: name, confidence: 'HIGH', reason: `Plate ${v.plate_number} read from the document` };
    }
    if (plateDigits && plateDigits.length >= 3) {
      if (aiPlate.includes(plateDigits) || aiDocNum.includes(plateDigits)) {
        return { ownerType: 'Vehicle', ownerId: v.id, ownerName: name, confidence: 'HIGH', reason: `Plate digits ${plateDigits} read from the document` };
      }
      if (filename.includes(plateDigits)) {
        return { ownerType: 'Vehicle', ownerId: v.id, ownerName: name, confidence: 'MEDIUM', reason: `Plate digits ${plateDigits} found in the filename` };
      }
      if (rawText.includes(plateDigits) || aiExtra.includes(plateDigits)) {
        return { ownerType: 'Vehicle', ownerId: v.id, ownerName: name, confidence: 'LOW', reason: `Plate digits ${plateDigits} appear in the document text` };
      }
    }
    if (refStr && refStr.length >= 3 && (filename.includes(refStr) || rawText.includes(refStr))) {
      return { ownerType: 'Vehicle', ownerId: v.id, ownerName: name, confidence: 'MEDIUM', reason: `Vehicle reference ${v.ref_id} found` };
    }
  }

  // ── Drivers ───────────────────────────────────────────────────────────────
  for (const d of candidates.drivers) {
    const rawLicense = normalizeArabicDigits((d.license_number || '').toString().trim()).toLowerCase();
    const licenseDigits = rawLicense.replace(/\D/g, '');
    const refId = (d.ref_id || '').toLowerCase().trim();
    const fullName = `${d.first_name} ${d.last_name}`.trim();
    const normFull = normName(fullName);
    const normFirst = normName(d.first_name || '');

    // 1. IQAMA / licence numbers match (string inclusion or digit-only matching)
    if (rawLicense && rawLicense.length >= 5 && (aiDocNum.includes(rawLicense) || rawText.includes(rawLicense) || filename.includes(rawLicense) || aiExtra.includes(rawLicense))) {
      return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'HIGH', reason: `IQAMA / licence number ${d.license_number} read from the document` };
    }

    if (licenseDigits && licenseDigits.length >= 5) {
      const allDocDigits = (aiDocNum + ' ' + aiExtra + ' ' + rawText + ' ' + filename).replace(/\D/g, '');
      if (allDocDigits.includes(licenseDigits)) {
        return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'HIGH', reason: `IQAMA / licence number ${d.license_number} read from document text` };
      }
    }

    // 2. AI extracted driver name match
    if (normAiDriverName && normAiDriverName.length >= 3) {
      if (normFull === normAiDriverName || normFirst === normAiDriverName || normFull.includes(normAiDriverName) || normAiDriverName.includes(normFull)) {
        return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'HIGH', reason: `Driver name "${fullName}" read from document` };
      }
    }

    // 3. Driver reference ID match
    if (refId && refId.length >= 3 && (filename.includes(refId) || rawText.includes(refId))) {
      return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'MEDIUM', reason: `Driver reference ${d.ref_id} found` };
    }

    // 4. Raw text or filename full name / first name match
    if (normFull && normFull.length >= 4 && (rawText.includes(normFull) || filename.includes(normFull))) {
      return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'HIGH', reason: `Driver name "${fullName}" found in document text` };
    }

    if (normFirst && normFirst.length >= 3 && (filename.includes(normFirst) || rawText.includes(normFirst))) {
      return { ownerType: 'Driver', ownerId: d.id, ownerName: fullName, confidence: 'MEDIUM', reason: `Driver name "${d.first_name}" found — confirm this is the right person` };
    }
  }

  return noMatch;
}

/**
 * Picks the configured DocumentType for a file. Prefers the code Gemini
 * returned (it is prompted with the live catalogue, so it answers in real
 * codes), then falls back to a filename keyword hit.
 *
 * Returns null rather than guessing — the old OCR path defaulted every
 * unrecognised document to VehicleRegistration, which is why so much of the
 * vault displayed as "Vehicle Registration" regardless of what it actually was.
 */
export function matchDocumentType(
  signals: MatchSignals,
  documentTypes: Array<{ id: string; code: string; name: string; ownerType: string }>,
  ownerType: string | null,
): { documentTypeId: string | null; reason: string } {
  const ai: any = signals.aiExtracted || {};
  const aiCode = (ai.document_type_code || '').toString().trim().toLowerCase();
  const detectedKind = (ai.detected_kind || '').toString().trim().toLowerCase();
  const filename = (signals.filename || '').toLowerCase();

  // Once the owner is known, a Vehicle document can't be a Driver type.
  const pool = ownerType ? documentTypes.filter((t) => t.ownerType === ownerType) : documentTypes;

  if (aiCode) {
    const hit = pool.find((t) => t.code.toLowerCase() === aiCode) || documentTypes.find((t) => t.code.toLowerCase() === aiCode);
    if (hit) return { documentTypeId: hit.id, reason: `AI identified this as ${hit.name}` };
  }

  // The model may describe the document correctly while failing to return a
  // catalogue code, so read its description before falling back to guesswork.
  if (detectedKind) {
    for (const t of pool) {
      const nameKey = t.name.toLowerCase();
      const codeKey = t.code.toLowerCase();
      if ((nameKey.length >= 4 && detectedKind.includes(nameKey)) || (codeKey.length >= 4 && detectedKind.includes(codeKey))) {
        return { documentTypeId: t.id, reason: `AI read this as ${t.name}` };
      }
    }

    // The model looked at the content and it matched nothing we track. Trust
    // that over the filename: "invoice-logo.png" is a company logo, not an
    // invoice, and letting a filename substring win here would hide genuinely
    // out-of-scope files inside the "needs input" queue.
    return { documentTypeId: null, reason: `Not one of your document types — appears to be: ${ai.detected_kind}` };
  }

  // Nothing was read from the document itself, so the filename is all we have.
  for (const t of pool) {
    const codeKey = t.code.toLowerCase();
    const nameKey = t.name.toLowerCase();
    if ((codeKey.length >= 4 && filename.includes(codeKey)) || (nameKey.length >= 4 && filename.includes(nameKey))) {
      return { documentTypeId: t.id, reason: `Filename mentions ${t.name}` };
    }
  }

  return { documentTypeId: null, reason: 'Could not determine the document type' };
}

/**
 * Finds a live document already occupying this owner+type slot, so the review
 * table can offer Replace / Add-as-file / Skip rather than quietly creating a
 * second copy. (Vehicle 9973 accumulated four Isthimaras this way.)
 */
export async function findDuplicate(
  ownerType: string | null,
  ownerId: string | null,
  documentTypeId: string | null,
): Promise<{ id: string; expiry_date: Date | null } | null> {
  if (!ownerType || !ownerId || !documentTypeId) return null;
  return prisma.document.findFirst({
    where: { entity_type: ownerType, entity_id: ownerId, documentTypeId, deletedAt: null, isActive: true },
    select: { id: true, expiry_date: true },
    orderBy: { createdAt: 'desc' },
  });
}
