import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Charcoal bar pinned to the bottom of the viewport while documents are selected. */
export default function SelectionBar({ label, onClear, children }: { label: ReactNode; onClear: () => void; children: ReactNode }) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[94vw] animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center gap-3 rounded-2xl bg-charcoal dark:bg-slate-800 text-white px-4 py-2.5 shadow-xl">
        <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">{children}</div>
        <button type="button" onClick={onClear} aria-label="Clear selection" className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SelectionAction({
  icon, label, onClick, danger, busy,
}: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'h-7 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60',
        danger ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'border border-white/25 hover:bg-white/10 text-white',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
