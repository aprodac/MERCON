/** Status chip colours by trip state — the same meaning as the map's colours. */
export function statusChip(status: string): { label: string; className: string; dot: string } {
  const s = status.toLowerCase();
  if (s === 'draft') return { label: 'Draft', className: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', dot: 'bg-violet-500' };
  if (s === 'scheduled') return { label: 'Scheduled', className: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', dot: 'bg-violet-600' };
  if (s === 'loading') return { label: 'Loading', className: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', dot: 'bg-sky-600' };
  if (s === 'intransit') return { label: 'In transit', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300', dot: 'bg-blue-600' };
  if (s === 'delayed') return { label: 'Delayed', className: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300', dot: 'bg-rose-600' };
  if (s === 'completed') return { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-600' };
  if (s === 'invoiced') return { label: 'Invoiced', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-600' };
  if (s === 'cancelled') return { label: 'Cancelled', className: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300', dot: 'bg-stone-400' };
  return { label: status, className: 'bg-muted text-muted-foreground', dot: 'bg-slate-400' };
}

export type TripPhase = 'planned' | 'active' | 'done' | 'cancelled';

/** Same mapping as the backend's tripPhase (services/tripOverview.ts). */
export function tripPhaseOf(status: string): TripPhase {
  if (status === 'Draft' || status === 'Scheduled') return 'planned';
  if (status === 'Completed' || status === 'Invoiced') return 'done';
  if (status === 'Cancelled') return 'cancelled';
  return 'active';
}
