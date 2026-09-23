import React from 'react';
import {
  FIN_STATUS,
  FIN_TONE_CLASSES,
  FinKind,
  getDisplayStatus,
  StatusDocParams,
} from '@/lib/finance';
import { cn } from '@/lib/utils';

export interface StatusPillProps {
  kind: FinKind;
  status: string;
  doc?: StatusDocParams;
  today?: Date;
  className?: string;
}

export function StatusPill({
  kind,
  status,
  doc,
  today,
  className,
}: StatusPillProps) {
  const resolvedStatus = doc
    ? getDisplayStatus(kind, { status, ...doc }, today)
    : status;

  const statusConfig =
    FIN_STATUS[kind]?.[resolvedStatus] || {
      label: resolvedStatus,
      tone: 'neutral',
    };

  const toneClasses =
    FIN_TONE_CLASSES[statusConfig.tone] || FIN_TONE_CLASSES.neutral;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-bold select-none shrink-0 border border-black/[0.04] dark:border-white/[0.06]',
        toneClasses.combined,
        className
      )}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', toneClasses.dot)}
      />
      <span>{statusConfig.label}</span>
    </span>
  );
}
