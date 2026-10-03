/**
 * Driver phone status — the green / amber / red dot and the matching pill,
 * shared by the driver list, driver page, trip page and operator inbox.
 */
import { cn } from '@/lib/utils';
import { StatusPill, type Tone } from '@/components/details/DetailKit';
import { PHONE_LEVEL_LABEL, PUSH_STATUS_LABEL, type PhoneLevel, type PushStatus } from '@/services/driverPhoneService';

const DOT: Record<PhoneLevel, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
};

export const PHONE_TONE: Record<PhoneLevel, Tone> = { green: 'green', amber: 'amber', red: 'red' };

export function PhoneDot({ level, title, className }: { level: PhoneLevel | null | undefined; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', level ? DOT[level] : 'bg-slate-300 dark:bg-slate-600', className)}
    />
  );
}

export function PhoneLevelPill({ level, size }: { level: PhoneLevel; size?: 'sm' | 'lg' }) {
  return <StatusPill tone={PHONE_TONE[level]} size={size}>{PHONE_LEVEL_LABEL[level]}</StatusPill>;
}

const PUSH_TONE: Record<PushStatus, Tone> = {
  Delivered: 'green',
  Sent: 'blue',
  Unknown: 'slate',
  Failed: 'red',
  NoDevice: 'red',
};

export function PushStatusPill({ status }: { status: PushStatus | null }) {
  if (!status) return <StatusPill tone="slate">No push record</StatusPill>;
  return <StatusPill tone={PUSH_TONE[status]}>{PUSH_STATUS_LABEL[status]}</StatusPill>;
}
