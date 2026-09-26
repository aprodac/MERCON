/**
 * Formats an IBAN string by grouping into 4-character blocks.
 * Example: 'SA1234567890123456789012' -> 'SA12 3456 7890 1234 5678 9012'
 */
export function formatIban(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    chunks.push(cleaned.slice(i, i + 4));
  }
  return chunks.join(' ');
}

/**
 * Validates a Saudi IBAN according to ISO 13616 format:
 * - Starts with 'SA' followed by 22 digits (length 24)
 * - Passes ISO 13616 mod-97 checksum
 */
export function validateSaudiIban(raw: string): { isValid: boolean; error?: string } {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();

  if (!cleaned) {
    return { isValid: false, error: 'IBAN is required for bank accounts' };
  }

  if (!cleaned.startsWith('SA')) {
    return { isValid: false, error: 'Saudi IBAN must start with SA' };
  }

  if (cleaned.length !== 24) {
    return { isValid: false, error: `Saudi IBAN must be 24 characters (currently ${cleaned.length})` };
  }

  if (!/^SA\d{22}$/.test(cleaned)) {
    return { isValid: false, error: 'Saudi IBAN must contain SA followed by 22 digits' };
  }

  // ISO 13616 Mod 97 check:
  // Move initial 4 chars to the end
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // Convert letters to digits: A=10, S=28
  let numericStr = '';
  for (let i = 0; i < rearranged.length; i++) {
    const char = rearranged[i];
    if (char >= 'A' && char <= 'Z') {
      numericStr += (char.charCodeAt(0) - 55).toString();
    } else {
      numericStr += char;
    }
  }

  // BigInt mod 97 check
  try {
    const remainder = BigInt(numericStr) % 97n;
    if (remainder !== 1n) {
      return { isValid: false, error: 'Invalid IBAN checksum' };
    }
  } catch {
    return { isValid: false, error: 'Failed to calculate IBAN checksum' };
  }

  return { isValid: true };
}
