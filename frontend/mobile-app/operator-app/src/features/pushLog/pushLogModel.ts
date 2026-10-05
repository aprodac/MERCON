/** How the Push log words and colours each push. Pure. */
import type { PushLogItem, PushOutcome } from './pushLogApi';

export type LogTone = 'green' | 'gray' | 'amber' | 'red';

export const LOG_TONE: Record<LogTone, { fg: string; bg: string }> = {
  green: { fg: '#067647', bg: '#ECFDF3' },
  gray: { fg: '#52525B', bg: '#F4F4F5' },
  amber: { fg: '#B54708', bg: '#FFFAEB' },
  red: { fg: '#D92D20', bg: '#FEF3F2' },
};

/** Over a minute from the alert to the phone. */
export const SLOW_MS = 60_000;

export function phoneName(platform: string | null | undefined): string {
  const p = (platform ?? '').toLowerCase();
  return p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'Phone';
}

/** "0.8 s", "12 s", "2 min 5 s", "3 h 10 min". */
export function formatDelay(ms: number): string {
  if (ms < 10_000) return `${(Math.round(ms / 100) / 10).toString()} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** The status pill for one push: label and colour. */
export function outcomeLabel(item: Pick<PushLogItem, 'outcome' | 'delayMs' | 'phone'>): { text: string; tone: LogTone } {
  const company = phoneName(item.phone?.platform) === 'Android' ? 'Google' : 'Apple';
  const map: Record<PushOutcome, { text: string; tone: LogTone }> = {
    arrived: {
      text: item.delayMs != null ? `Arrived · ${formatDelay(item.delayMs)}` : 'Arrived',
      tone: (item.delayMs ?? 0) > SLOW_MS ? 'amber' : 'green',
    },
    delivered: { text: `Delivered to ${company}`, tone: 'gray' },
    sending: { text: `Waiting for ${company}`, tone: 'gray' },
    retrying: { text: 'Retrying', tone: 'amber' },
    failed: { text: 'Failed', tone: 'red' },
    unknown: { text: 'Unknown', tone: 'gray' },
  };
  return map[item.outcome];
}
