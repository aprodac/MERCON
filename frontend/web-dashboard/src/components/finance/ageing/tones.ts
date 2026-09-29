import type { ChipTone } from '@/components/ui/chip';
import { AGEING_BUCKETS_REGISTRY } from '@/lib/finance/chips';
import type { AgeingBucket } from '@/lib/finance/ageing';

export { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';

/** Ageing bucket → tone, from the shared chip registry (one source for chips, tiles and cells). */
export const bucketTone = (bucket: AgeingBucket): ChipTone => AGEING_BUCKETS_REGISTRY[bucket]?.tone ?? 'neutral';

const AVATAR_TONES: ChipTone[] = ['info', 'violet', 'teal', 'warning', 'positive', 'orange'];

/** Stable tone for a party's initials avatar. */
export function partyTone(name: string): ChipTone {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}
