import type { ChipTone } from '@/components/ui/chip';

/**
 * Token-based colour pieces per chip tone (literal class names so Tailwind generates them).
 * Surfaces that aren't chips — tiles, bars, avatars — use these instead of raw palette classes.
 */
export const TONE_CLASSES: Record<ChipTone, { bg: string; fg: string; border: string; dot: string }> = {
  neutral: { bg: 'bg-chip-neutral-bg', fg: 'text-chip-neutral-fg', border: 'border-chip-neutral-border', dot: 'bg-chip-neutral-dot' },
  positive: { bg: 'bg-chip-positive-bg', fg: 'text-chip-positive-fg', border: 'border-chip-positive-border', dot: 'bg-chip-positive-dot' },
  negative: { bg: 'bg-chip-negative-bg', fg: 'text-chip-negative-fg', border: 'border-chip-negative-border', dot: 'bg-chip-negative-dot' },
  warning: { bg: 'bg-chip-warning-bg', fg: 'text-chip-warning-fg', border: 'border-chip-warning-border', dot: 'bg-chip-warning-dot' },
  info: { bg: 'bg-chip-info-bg', fg: 'text-chip-info-fg', border: 'border-chip-info-border', dot: 'bg-chip-info-dot' },
  violet: { bg: 'bg-chip-violet-bg', fg: 'text-chip-violet-fg', border: 'border-chip-violet-border', dot: 'bg-chip-violet-dot' },
  teal: { bg: 'bg-chip-teal-bg', fg: 'text-chip-teal-fg', border: 'border-chip-teal-border', dot: 'bg-chip-teal-dot' },
  orange: { bg: 'bg-chip-orange-bg', fg: 'text-chip-orange-fg', border: 'border-chip-orange-border', dot: 'bg-chip-orange-dot' },
  brand: { bg: 'bg-chip-brand-bg', fg: 'text-chip-brand-fg', border: 'border-chip-brand-border', dot: 'bg-chip-brand-dot' },
};

/** CSS colour of a tone's dot, for inline mixes (heat cells, chart fills). */
export const toneDotVar = (tone: ChipTone) => `var(--chip-${tone}-dot)`;
