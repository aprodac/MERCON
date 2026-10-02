import { cn } from '@/lib/utils';
import { useChargeReviewQueue } from '@/hooks/useChargeReviewQueue';
import { useAssistantHidden } from './assistantVisibility';

/**
 * Top-bar button that shows or hides the extra-charges assistant. A tiny
 * version of the character's face; when hidden it goes grey, with a dot if
 * finished trips are still waiting for an answer.
 */
export default function AssistantToggle() {
  const [hidden, setHidden] = useAssistantHidden();
  const { total } = useChargeReviewQueue();
  const label = hidden ? `Show the extra charges assistant${total ? ` (${total} trips waiting)` : ''}` : 'Hide the extra charges assistant';

  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-label={label}
      aria-pressed={!hidden}
      title={label}
      className="relative hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shrink-0 cursor-pointer shadow-2xs"
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-[19px] w-[19px] place-items-center rounded-[7px] transition-all duration-300',
          hidden ? 'bg-slate-200 dark:bg-slate-700' : 'bg-gradient-to-b from-[#ff8b72] to-brand shadow-[0_2px_6px_rgba(250,99,78,.35)]'
        )}
      >
        <span className="flex gap-[3px]">
          {/* eyes: open when shown, closed lines when hidden */}
          <i className={cn('block w-[2.5px] rounded-full transition-all duration-300', hidden ? 'h-[1.5px] bg-slate-500 dark:bg-slate-400' : 'h-[6px] bg-charcoal-strong')} />
          <i className={cn('block w-[2.5px] rounded-full transition-all duration-300', hidden ? 'h-[1.5px] bg-slate-500 dark:bg-slate-400' : 'h-[6px] bg-charcoal-strong')} />
        </span>
      </span>
      {hidden && total > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white dark:ring-slate-900" />
      )}
    </button>
  );
}
