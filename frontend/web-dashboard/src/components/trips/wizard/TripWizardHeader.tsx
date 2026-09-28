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
}) => {

  if (submissionResult) return null;

  const isMonthly = contractBillingType === 'Monthly';
  const maxSteps = isMonthly ? 2 : 1;

  const steps = isMonthly
    ? [
        { step: 1, label: '1. Configure & Dispatch', icon: MapPin },
        { step: 2, label: '2. Operating Month & Days', icon: CalendarRange },
      ]
    : [{ step: 1, label: '1. Configure & Dispatch', icon: MapPin }];


  return (
    <div className="border-b border-black/[0.06] bg-white dark:bg-slate-900 shrink-0 grid grid-cols-3 items-center px-5 py-2.5 gap-3 w-full relative">
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
            Back <KbdBadge keys="Esc" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={handleDialogClose}
            className="h-8 rounded-xl border border-slate-200/80 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            Cancel <KbdBadge keys="Esc" />
          </Button>
        )}

      </div>

      {/* Center: Stepper Pills — Mathematically Centered */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s) => {
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
              {IconComp && (
                <IconComp className={`w-3.5 h-3.5 ${isActive ? 'text-brand' : isPassed ? 'text-brand' : 'text-slate-400'}`} />
              )}
              <span>{s.label}</span>
              {isPassed && <CheckCircle2 className="w-3 h-3 text-brand ml-0.5" />}
            </button>
          );
        })}
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
                className="h-8 text-xs font-bold border-amber-300/80 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100/80 rounded-xl px-2.5 gap-1.5 shadow-2xs cursor-pointer shrink-0"
              >
                <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Saved Draft</span>
                <ChevronDown className="w-3 h-3 text-amber-500 shrink-0" />
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
