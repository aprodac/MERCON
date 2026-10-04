/**
 * Saudi number plates: 3 letters and 1–4 digits, e.g. "DRA-6484". Only 17
 * letters are used on plates, each with an Arabic twin; people type them in
 * any order ("6484 DRA"), with spaces or dashes, in Latin or Arabic.
 * One rule for the web, the operator app and the API.
 */

/** The Latin letters allowed on Saudi plates. */
export const SAUDI_PLATE_LETTERS = 'ABDEGHJKLNRSTUVXZ';

const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ب': 'B', 'ح': 'J', 'د': 'D', 'ر': 'R', 'س': 'S', 'ص': 'X',
  'ط': 'T', 'ع': 'E', 'ق': 'G', 'ك': 'K', 'ل': 'L', 'م': 'Z', 'ن': 'N', 'ه': 'H', 'ة': 'H', 'و': 'U', 'ى': 'V', 'ي': 'V',
};

export type SaudiPlateResult = { ok: true; plate: string } | { ok: false; reason: string };

/** Turn what was typed into "ABC-1234", or say what's wrong with it. */
export function normalizeSaudiPlate(input: string | null | undefined): SaudiPlateResult {
  const raw = String(input ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .split('')
    .map((c) => ARABIC_TO_LATIN[c] ?? c)
    .join('')
    .toUpperCase()
    .replace(/[\s\-._/]/g, '');
  if (!raw) return { ok: false, reason: 'Enter the plate number, like DRA-6484.' };

  const m = raw.match(/^([A-Z]{3})(\d{1,4})$/) ?? raw.match(/^(\d{1,4})([A-Z]{3})$/);
  if (!m) return { ok: false, reason: 'A Saudi plate is 3 letters and up to 4 numbers, like DRA-6484.' };
  const [letters, digits] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];

  const wrong = [...letters].filter((c) => !SAUDI_PLATE_LETTERS.includes(c));
  if (wrong.length) {
    return { ok: false, reason: `"${wrong.join('')}" isn't used on Saudi plates. Letters are ${SAUDI_PLATE_LETTERS.split('').join(' ')}.` };
  }
  if (/^0+$/.test(digits)) return { ok: false, reason: 'The number part can’t be all zeros.' };
  return { ok: true, plate: `${letters}-${digits}` };
}

/** True when the value is a real plate (or empty / "Assign Later" where the field is optional). */
export function isSaudiPlateOrLater(input: string | null | undefined): boolean {
  const v = String(input ?? '').trim();
  return !v || /^assign later$/i.test(v) || normalizeSaudiPlate(v).ok;
}
