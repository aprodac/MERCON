import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FinanceEmptyState } from './FinanceEmptyState';

/** Loading, error and empty states around a report view; renders the view once there is data. */
export function ReportViewState({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <Card className="space-y-3 rounded-xl p-6 shadow-xs">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </Card>
    );
  }
  if (isError) {
    return (
      <Card className="flex-row items-center justify-between gap-3 rounded-xl border-chip-negative-border bg-chip-negative-bg p-4 text-xs text-chip-negative-fg shadow-xs">
        <span className="flex items-center gap-2"><AlertTriangle className="size-4" /> The report could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </Card>
    );
  }
  if (isEmpty) return <FinanceEmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}
