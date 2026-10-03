import { useQueryClient } from '@tanstack/react-query';

/** Refresh everything that shows cost-setup figures after a change. */
export function useCostInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['cost-setup'] });
    qc.invalidateQueries({ queryKey: ['fleet-financials'] });
    qc.invalidateQueries({ queryKey: ['vehicle-financials'] });
  };
}
