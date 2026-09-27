import { TripStatus } from '@prisma/client';

const MAX_DELAY_REASON_LENGTH = 1000;

/**
 * Separates a delay reason from the workflow state on a status update.
 * Workflow states are UPPER_SNAKE_CASE (GOING_TO_PICKUP, …). Older driver-app
 * builds put the typed reason in that slot when reporting a delay, so on a
 * Delayed update a value that isn't a workflow state is treated as the reason.
 */
export function splitDelayReason(
  status: string,
  driverWorkflowState: unknown,
  reason: unknown,
): { workflowState: string | undefined; delayReason: string | null } {
  const ws = typeof driverWorkflowState === 'string' && driverWorkflowState.trim() ? driverWorkflowState.trim() : undefined;
  const wsIsReason = status === TripStatus.Delayed && !!ws && !/^[A-Z][A-Z0-9_]*$/.test(ws);
  const explicit = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  const delayReason = status === TripStatus.Delayed ? explicit ?? (wsIsReason ? ws! : null) : null;
  return {
    workflowState: wsIsReason ? undefined : ws,
    delayReason: delayReason ? delayReason.slice(0, MAX_DELAY_REASON_LENGTH) : null,
  };
}
