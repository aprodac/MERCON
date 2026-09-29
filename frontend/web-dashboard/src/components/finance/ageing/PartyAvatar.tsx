import { cn } from '@/lib/utils';
import { TONE_CLASSES, partyTone } from './tones';

/** Initials on a stable, name-derived tone tint. */
export function PartyAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const tone = TONE_CLASSES[partyTone(name)];
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold', tone.bg, tone.fg, tone.border, className)}
    >
      {initials}
    </span>
  );
}
