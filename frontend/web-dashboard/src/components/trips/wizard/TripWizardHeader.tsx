import React from 'react';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  CheckCircle2,
  Loader2,
  X,
  ChevronDown,
  CalendarRange,
  History,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TripWizardHeaderProps {
  contractStep: number;
  contractBillingType?: string;
  submissionResult: any;
  isStepValid: (step: number) => boolean;
  getStepValidationErrors?: (step: number) => string[];
  validateAndFocusErrors?: (step?: number) => boolean;
  canNavigateToStep: (step: number) => boolean;
  setContractStep: React.Dispatch<React.SetStateAction<any>>;
  handleContractSubmit: () => void;
  handleDialogClose: () => void;
  isPending: boolean;
  batchTripRowsCount: number;
  KbdBadge: React.ComponentType<{ keys: string }>;
  hasSavedDraft?: boolean;
  restoreDraft?: () => void;
  discardDraft?: () => void;
  /** Step 1 sections and whether each is filled — shown as chips; the next one is amber. */
  progress?: Array<{ key: string; label: string; done: boolean }>;
  nextSection?: string | null;
  /** "Next: set pickup time" while something is missing; null when everything is filled. */
  nextActionLabel?: string | null;
  onJumpTo?: (key: string) => void;
}

export const TripWizardHeader: React.FC<TripWizardHeaderProps> = ({
  contractStep,
  contractBillingType = 'Extra',
  submissionResult,
  isStepValid,
  getStepValidationErrors,
  validateAndFocusErrors,
  canNavigateToStep,
  setContractStep,
  handleContractSubmit,
  handleDialogClose,
  isPending,
  batchTripRowsCount,
  KbdBadge,
  hasSavedDraft,
  restoreDraft,
  discardDraft,
  progress,
  nextSection,
  nextActionLabel,
  onJumpTo,
}) => {

  if (submissionResult) return null;

  const isMonthly = contractBillingType === 'Monthly';
  const maxSteps = isMonthly ? 2 : 1;

  const steps = isMonthly
    ? [
        { step: 1, label: '1 · Route and price', icon: MapPin },
        { step: 2, label: '2 · Days and roster', icon: CalendarRange },
      ]
    : [{ step: 1, label: 'Configure and dispatch', icon: MapPin }];


  return (
    <div className="border-b border-black/[0.06] bg-white dark:bg-slate-900 shrink-0 flex items-center px-4 py-2.5 gap-3 w-full relative">
      {/* Top Left: Cancel / Back Actions & Multi-Color >>> Horizontal Navigation Launcher */}
      <div className="flex items-center gap-2 justify-start shrink-0">
        {contractStep > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setContractStep((prev: number) => (prev - 1) as any)}
            className="h-8 rounded-xl border border-slate-200/80 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            Back
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={handleDialogClose}
            className="h-8 rounded-xl border border-slate-200/80 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            Cancel
          </Button>
        )}

      </div>

      {/* Center: on step 1, what's filled and what's next; on step 2 (monthly), the steps */}
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto">
        {contractStep === 1 && progress ? (
          <ol className="flex items-center" aria-label="Progress">
            {progress.map((p, i) => {
              const isNext = p.key === nextSection;
              return (
                <li key={p.key} className="flex items-center">
                  {i > 0 && (
                    <span aria-hidden="true" className={cn('h-px w-4 sm:w-6', progress[i - 1].done ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-slate-200 dark:bg-slate-700')} />
                  )}
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onJumpTo?.(p.key)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer',
                    p.done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : isNext
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                  )}
                >
                  {p.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                  {p.label}
                </button>
                </li>
              );
            })}
            {isMonthly && (
              <li className="flex items-center">
                <span aria-hidden="true" className="h-px w-4 sm:w-6 bg-slate-200 dark:bg-slate-700" />
                <button
                  type="button"
                  disabled={!canNavigateToStep(2)}
                  onClick={() => setContractStep(2)}
                  className="flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap enabled:hover:border-[#FA634E]/60 enabled:cursor-pointer disabled:opacity-50"
                >
                  <CalendarRange className="w-3.5 h-3.5" /> Days and roster
                </button>
              </li>
            )}
          </ol>
        ) : (
          steps.map((s) => {
            const IconComp = s.icon;
            const isActive = contractStep === s.step;
            const isPassed = contractStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                disabled={!canNavigateToStep(s.step)}
                onClick={() => setContractStep(s.step)}
                className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                  isActive
                    ? 'bg-orange-50/90 text-brand border border-orange-200/90 font-black shadow-2xs'
                    : isPassed
                    ? 'bg-orange-50/50 text-brand border border-orange-200/60 hover:bg-orange-100/60'
                    : 'bg-white dark:bg-slate-800 text-[#6E6E80] border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                {IconComp && <IconComp className={`w-3.5 h-3.5 ${isActive || isPassed ? 'text-brand' : 'text-slate-400'}`} />}
                <span>{s.label}</span>
                {isPassed && <CheckCircle2 className="w-3 h-3 text-brand ml-0.5" />}
              </button>
            );
          })
        )}
      </div>

      {/* Top Right: Restore Draft (if any) + Next / Submit Primary Action */}
      <div className="flex items-center gap-2 justify-end shrink-0">
        {hasSavedDraft && contractStep === 1 && restoreDraft && discardDraft && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="A trip you started earlier is saved"
                className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300 rounded-xl px-2 gap-1 shadow-none cursor-pointer shrink-0"
              >
                <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Draft</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-[9999]">
              <DropdownMenuLabel className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Draft Options
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={restoreDraft} className="text-xs font-bold gap-2 text-emerald-700 dark:text-emerald-400 cursor-pointer">
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" /> Restore Saved Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={discardDraft} className="text-xs font-bold gap-2 text-rose-600 dark:text-rose-400 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Discard Saved Draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(() => {
          const isValid = isStepValid(contractStep);
          const errors = getStepValidationErrors ? getStepValidationErrors(contractStep) : [];

          const handleNextClick = () => {
            if (!isValid) {
              if (validateAndFocusErrors) {
                validateAndFocusErrors(contractStep);
              }
              if (errors.length > 0) {
                toast.error('Required fields missing', {
                  description: (
                    <div className="space-y-1 py-0.5">
                      <p className="font-bold text-xs">Please complete the following before proceeding:</p>
                      <ul className="list-disc list-inside text-[11px] font-sans space-y-0.5">
                        {errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ),
                  duration: 5000,
                });
              } else {
                toast.error('Please complete all required fields on this step.');
              }
              return;
            }
            setContractStep((prev: number) => (prev + 1) as any);
          };

          const handleReviewSubmitClick = () => {
            if (!isStepValid(1)) {
              if (validateAndFocusErrors) {
                validateAndFocusErrors(1);
              }
              const step1Errors = getStepValidationErrors ? getStepValidationErrors(1) : [];
              if (step1Errors.length > 0) {
                toast.error('Cannot proceed to review', {
                  description: (
                    <div className="space-y-1 py-0.5">
                      <p className="font-bold text-xs">Please complete Step 1 required fields:</p>
                      <ul className="list-disc list-inside text-[11px] font-sans space-y-0.5">
                        {step1Errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ),
                  duration: 5000,
                });
              } else {
                toast.error('Please complete all required fields before reviewing.');
              }
              return;
            }
            handleContractSubmit();
          };

          if (contractStep === 1 && nextActionLabel && nextSection) {
            return (
              <Button
                id="wizard-next-btn"
                type="button"
                onClick={() => onJumpTo?.(nextSection)}
                className="h-8 rounded-xl px-4 text-xs font-bold shadow-none gap-1 cursor-pointer border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
              >
                <span>{nextActionLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            );
          }

          if (contractStep < maxSteps) {
            return (
              <Button
                id="wizard-next-btn"
                type="button"
                onClick={handleNextClick}
                className={cn(
                  "h-8 rounded-xl px-4 text-xs font-bold shadow-none gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FA634E] focus-visible:outline-none transition-all",
                  isValid
                    ? "bg-[#FA634E] hover:bg-[#d13d0d] text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-white shadow-2xs"
                )}
                title={!isValid && errors.length > 0 ? `Incomplete: ${errors.join(', ')}` : undefined}
              >
                {!isValid && <AlertTriangle className="w-3.5 h-3.5 text-white animate-pulse" />}
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                <KbdBadge keys="Ctrl+S" />
              </Button>
            );
          }

          return (
            <Button
              id="wizard-submit-btn"
              type="button"
              disabled={isPending}
              onClick={handleReviewSubmitClick}
              className={cn(
                "h-8 rounded-xl px-4 text-xs font-bold shadow-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FA634E] focus-visible:outline-none transition-all",
                isStepValid(1)
                  ? "bg-[#FA634E] hover:bg-[#d13d0d] text-white"
                  : "bg-amber-500 hover:bg-amber-600 text-white shadow-2xs"
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  {!isStepValid(1) && <AlertTriangle className="w-3.5 h-3.5 mr-1 text-white animate-pulse" />}
                  <span>Review & Confirm</span>
                  <KbdBadge keys="Ctrl+Enter" />
                </>
              )}
            </Button>
          );
        })()}

        <button
          type="button"
          onClick={handleDialogClose}
          className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TripWizardHeader;
