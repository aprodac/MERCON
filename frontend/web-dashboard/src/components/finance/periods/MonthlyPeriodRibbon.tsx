import { Plus, CheckCircle2, Lock } from 'lucide-react';
import { MONTH_NAMES, PeriodRow } from './types';

interface MonthlyPeriodRibbonProps {
  selectedYear: number;
  periods: PeriodRow[];
  selectedPeriodId: string | null;
  isAdmin: boolean;
  currentYear: number;
  currentMonthIdx: number;
  onSelectPeriod: (periodId: string) => void;
  onOpenNewPeriodForMonth: (monthIdx: number) => void;
}

export function MonthlyPeriodRibbon({
  selectedYear,
  periods,
  selectedPeriodId,
  isAdmin,
  currentYear,
  currentMonthIdx,
  onSelectPeriod,
  onOpenNewPeriodForMonth,
}: MonthlyPeriodRibbonProps) {
  return (
    <div className="overflow-x-auto pb-2 scrollbar-thin">
      <div className="flex items-center gap-2.5 min-w-max">
        {MONTH_NAMES.map((mName, mIdx) => {
          const matchingPeriod = periods.find((p) => {
            const sDate = new Date(p.start_date);
            return sDate.getFullYear() === selectedYear && sDate.getMonth() === mIdx;
          });

          const isCurrentMonth = selectedYear === currentYear && mIdx === currentMonthIdx;

          if (!matchingPeriod) {
            return (
              <div
                key={mName}
                onClick={() => isAdmin && onOpenNewPeriodForMonth(mIdx)}
                className={`w-[88px] h-[96px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-2 transition-all ${
                  isAdmin
                    ? 'hover:border-[#FA634E] hover:bg-rose-50/30 cursor-pointer group'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <span className="text-xs font-bold text-slate-400 group-hover:text-[#FA634E]">{mName}</span>
                <Plus className="w-4 h-4 my-1 text-slate-300 group-hover:text-[#FA634E]" />
                <span className="text-[10px] text-slate-400 font-medium">Not created</span>
              </div>
            );
          }

          const isSelected = selectedPeriodId === matchingPeriod.id;
          const status = matchingPeriod.status;

          let tileClass = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100';
          if (status === 'Closed') {
            tileClass = 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800/80 text-amber-950 dark:text-amber-200';
          } else if (status === 'Locked') {
            tileClass = 'bg-[#3E3C3D] text-white border-transparent';
          }

          const jeCount = matchingPeriod._count?.journalEntries || 0;

          return (
            <button
              key={matchingPeriod.id}
              type="button"
              role="button"
              aria-pressed={isSelected}
              onClick={() => onSelectPeriod(matchingPeriod.id)}
              className={`relative w-[88px] h-[96px] rounded-2xl border p-2 flex flex-col justify-between items-center text-center transition-all select-none focus:outline-none ${tileClass} ${
                isCurrentMonth ? 'ring-2 ring-[#FA634E]' : ''
              } ${isSelected ? 'border-2 border-[#FA634E] shadow-xs' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
            >
              <div className="w-full flex items-center justify-between">
                <span className={`text-xs font-extrabold ${status === 'Locked' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {mName}
                </span>
                {status === 'Open' && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                {status === 'Closed' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                {status === 'Locked' && <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
              </div>

              <div className="text-[11px] font-medium opacity-80">
                <span className="font-mono font-bold">{jeCount}</span> JEs
              </div>

              {isCurrentMonth ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-[#FA634E] text-white tracking-wider uppercase">
                  now
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
                  {status}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
