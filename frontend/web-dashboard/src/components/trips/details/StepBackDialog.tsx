/**
 * "Go back to an earlier step" — the office's undo for a driver who tapped ahead
 * by mistake (e.g. went through delivery and took the POD photos while still
 * loading). Lists the trip's steps; pick the last one that really happened.
 * Everything after it is undone, the driver's app returns to the next step, and
 * the photos taken since can move onto the step being redone.
 * Backend: GET /trips/:id/progress-steps, POST /trips/:id/step-back.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, Images, Loader2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { tripService } from '@/services/tripService';

type PhotoChoice = 'move' | 'remove' | 'keep';

export function StepBackDialog({ tripId, tripRef, open, onOpenChange }: { tripId: string; tripRef?: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const tz = useDeploymentTimezone();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trip-progress-steps', tripId],
    queryFn: () => tripService.progressSteps(tripId),
    enabled: open,
    staleTime: 0,
  });
  const [target, setTarget] = useState<number | null>(null);
  const [photos, setPhotos] = useState<PhotoChoice>('move');

  // Default: one step back.
  useEffect(() => {
    if (open && data) setTarget(data.current - 1 >= -1 ? data.current - 1 : null);
    if (!open) { setTarget(null); setPhotos('move'); }
  }, [open, data]);

  const mutation = useMutation({
    mutationFn: () => tripService.stepBack(tripId, { to_index: target!, photos }),
    onSuccess: (r) => {
      // The page may be keyed by ref (TRP-0005) or id — refresh everything trip-shaped.
      for (const key of [['trip'], ['trips'], ['trip-progress-steps', tripId], ['documents', 'Trip'], ['operator-inbox'], ['trip-overview'], ['trip-driver-trail']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      const photoNote = r.photos.count
        ? r.photos.choice === 'move' ? ` · ${r.photos.count} photo${r.photos.count === 1 ? '' : 's'} moved to ${r.photos.moved_to}`
          : r.photos.choice === 'remove' ? ` · ${r.photos.count} photo${r.photos.count === 1 ? '' : 's'} removed` : ''
        : '';
      toast.success(`Back to: ${r.to.label}${photoNote}. The driver was told.`);
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || err.message || 'Could not take the trip back'),
  });

  const fmt = (iso: string | null) => (iso ? formatInDeploymentTz(iso, tz, 'EEE d MMM, HH:mm') : '');
  const steps = data?.steps ?? [];
  const current = data?.current ?? -1;
  const undoCount = target === null ? 0 : current - target;
  const photoCount = target === null ? 0 : data?.photos_after[target] ?? 0;
  const targetLabel = target === null ? '' : target === -1 ? 'Not started' : steps[target]?.label;
  const nextForDriver = target === null ? '' : target === -1 ? 'Start the trip' : steps[target]?.next;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="size-4" /> Go back to an earlier step</DialogTitle>
          <DialogDescription>
            {tripRef ? `${tripRef} · ` : ''}For when the driver tapped ahead by mistake. Pick the last step that really happened — everything after it is undone.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading the trip's steps…</div>
        ) : isError || !data ? (
          <p className="py-4 text-sm text-rose-600">Couldn't load the trip's steps.</p>
        ) : !data.can_step_back ? (
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> {data.blocked_reason}
          </p>
        ) : (
          <div className="space-y-4">
            {/* The steps, oldest first; the done ones can be picked. */}
            <ol className="max-h-72 space-y-1 overflow-y-auto pr-1" role="radiogroup" aria-label="Go back to">
              <StepRow
                label="Not started" sub="Before the driver tapped Start"
                done picked={target === -1} undone={target !== null && target < -1}
                onPick={() => setTarget(-1)}
              />
              {steps.map((st) => {
                const isCurrent = st.index === current;
                const canPick = st.done && !isCurrent;
                const willUndo = target !== null && st.index > target && st.done;
                return (
                  <StepRow
                    key={st.key}
                    label={st.label}
                    sub={isCurrent ? `Where the trip is now${st.at ? ` · ${fmt(st.at)}` : ''}` : st.at ? fmt(st.at) : st.done ? '' : 'Not done yet'}
                    done={st.done}
                    current={isCurrent}
                    picked={target === st.index}
                    undone={willUndo}
                    disabled={!canPick}
                    onPick={() => canPick && setTarget(st.index)}
                  />
                );
              })}
            </ol>

            {target !== null && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                <p className="text-sm text-amber-950 dark:text-amber-100">
                  <strong>{undoCount} step{undoCount === 1 ? '' : 's'}</strong> will be undone. The trip goes back to <strong>{targetLabel}</strong>; the driver's app opens on <strong>{nextForDriver}</strong>.
                </p>
                {photoCount > 0 && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/80">
                      <Images className="size-3.5" /> {photoCount} photo{photoCount === 1 ? '' : 's'} taken since then
                    </p>
                    {([
                      ['move', `Move them to “${nextForDriver}”`, 'For photos taken at the wrong step (e.g. loading photos sent as POD).'],
                      ['remove', 'Remove them from the trip', 'The driver retakes them.'],
                      ['keep', 'Leave them where they are', ''],
                    ] as const).map(([value, title, hint]) => (
                      <label key={value} className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm', photos === value ? 'border-amber-400 bg-white dark:bg-slate-900' : 'border-transparent hover:bg-white/60 dark:hover:bg-slate-900/40')}>
                        <input type="radio" name="photos" value={value} checked={photos === value} onChange={() => setPhotos(value)} className="mt-1 accent-[#FA634E]" />
                        <span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{title}</span>
                          {hint && <span className="block text-xs text-slate-600 dark:text-slate-400">{hint}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {data?.can_step_back && (
            <Button
              onClick={() => mutation.mutate()}
              disabled={target === null || mutation.isPending}
              className="bg-[#FA634E] text-white hover:bg-[#e0523d]"
            >
              {mutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Undo2 className="mr-1.5 size-4" />}
              Go back {undoCount > 0 ? `${undoCount} step${undoCount === 1 ? '' : 's'}` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({ label, sub, done, current, picked, undone, disabled, onPick }: {
  label: string; sub?: string; done: boolean; current?: boolean; picked: boolean; undone?: boolean; disabled?: boolean; onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={picked}
        disabled={disabled}
        onClick={onPick}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
          picked ? 'border-[#FA634E] bg-orange-50 dark:bg-orange-950/30' : 'border-transparent',
          !disabled && !picked && 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
          disabled && 'cursor-default',
        )}
      >
        {done ? (
          <CheckCircle2 className={cn('mt-0.5 size-4 shrink-0', undone ? 'text-slate-300 dark:text-slate-600' : 'text-emerald-600')} />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-slate-300 dark:text-slate-600" />
        )}
        <span className="min-w-0">
          <span className={cn('block text-sm font-medium', !done && 'text-slate-400', undone && 'text-slate-400 line-through', current && 'font-bold')}>
            {label}
            {picked && <span className="ml-1.5 rounded-full bg-[#FA634E] px-1.5 py-px text-[10px] font-bold text-white no-underline">Back to here</span>}
          </span>
          {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
        </span>
      </button>
    </li>
  );
}

export default StepBackDialog;
