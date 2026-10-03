/** 1,250 → "1,250" · 48,300 → "48.3K" · 1,200,000 → "1.2M" (for the small stat tiles). */
export function compactSar(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(v).toLocaleString('en-US');
}
