import { prisma } from '../../db';
import { currentDataKeyId, openSecret, sealedKeyId, sealSecret } from './secretBox';

/**
 * Every column that holds a sealSecret() value. A new integration that stores
 * secrets adds its columns here, and key rotation covers it automatically.
 */
const ZATCA_SEALED_FIELDS = ['privateKeyEnc', 'complianceSecretEnc', 'productionSecretEnc'] as const;

/**
 * Re-seals every stored secret that isn't under the current key yet. Runs at
 * startup: after a rotation (new DATA_ENCRYPTION_KEY, old one moved to
 * DATA_ENCRYPTION_KEY_PREVIOUS) the first boot moves everything to the new
 * key. Values whose key is gone entirely are counted, left untouched, and
 * surface on the settings page as "reconnect needed".
 */
export async function reencryptStoredSecrets(): Promise<{ reencrypted: number; unreadable: number }> {
  const current = currentDataKeyId();
  if (!current) return { reencrypted: 0, unreadable: 0 };

  let reencrypted = 0;
  let unreadable = 0;
  const rows = await prisma.zatcaConfig.findMany({
    select: { id: true, privateKeyEnc: true, complianceSecretEnc: true, productionSecretEnc: true },
  });
  for (const row of rows) {
    const data: Partial<Record<(typeof ZATCA_SEALED_FIELDS)[number], string>> = {};
    for (const field of ZATCA_SEALED_FIELDS) {
      const value = row[field];
      if (!value || sealedKeyId(value) === current) continue;
      try {
        data[field] = sealSecret(openSecret(value));
      } catch {
        unreadable++;
      }
    }
    if (Object.keys(data).length) {
      await prisma.zatcaConfig.update({ where: { id: row.id }, data });
      reencrypted += Object.keys(data).length;
    }
  }
  return { reencrypted, unreadable };
}
