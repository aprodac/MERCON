import { ArrowRight, ChevronDown, CornerUpLeft, Loader2, XCircle } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUS_LABEL, nextStatuses } from '@/lib/liveOps';

interface Props {
  status: string;
  pending?: boolean;
  onChange: (status: string) => void;
}

/** The trip's status badge doubles as the menu that moves it on — only to statuses the backend allows. */
export default function TripStatusMenu({ status, pending, onChange }: Props) {
  const { forward, back, cancel } = nextStatuses(status);
  const empty = forward.length === 0 && back.length === 0 && !cancel;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending || empty}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="group/status inline-flex shrink-0 items-center gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          aria-label={`Status: ${STATUS_LABEL[status] ?? status}. Change status`}
        >
          {/* StatusBadge folds Draft into "Scheduled"; on this page the difference matters. */}
          {status === 'Draft' ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Draft
            </span>
          ) : (
            <StatusBadge status={status} className="text-[10px]" />
          )}
          {pending ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : (
            !empty && <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]/status:rotate-180" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        {forward.length > 0 && <DropdownMenuLabel className="text-[11px] text-muted-foreground">Move to</DropdownMenuLabel>}
        {forward.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)} className="gap-2 text-sm">
            <ArrowRight className="size-3.5 text-muted-foreground" />
            {STATUS_LABEL[s] ?? s}
          </DropdownMenuItem>
        ))}
        {back.length > 0 && (
          <>
            {forward.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Send back to</DropdownMenuLabel>
            {back.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onChange(s)} className="gap-2 text-sm">
                <CornerUpLeft className="size-3.5 text-muted-foreground" />
                {STATUS_LABEL[s] ?? s}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {cancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange('Cancelled')} className="gap-2 text-sm text-rose-600 focus:text-rose-700">
              <XCircle className="size-3.5" />
              Cancel trip
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
