import React from 'react';
import { StatusChip } from '@/lib/finance/chips';
import type { FinKind, StatusDocParams } from '@/lib/finance/status';

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
  return (
    <StatusChip
      kind={kind}
      status={status}
      doc={doc}
      today={today}
      className={className}
    />
  );
}

