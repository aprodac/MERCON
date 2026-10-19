/**
 * The step screens (navigate / pickup / stop / delivery) aren't used by a trip
 * running as a trip log; a notification or old link that opens one goes to the
 * Trip log instead (shared-types tripLog).
 */
import React from 'react';
import { Redirect } from 'expo-router';
import { TRIP_LOG_STATE } from '@mercon/shared-types';
import { useCurrentTrip } from '../hooks/use-current-trip';

export function TripLogRedirect({ children }: { children: React.ReactNode }) {
  const { trip } = useCurrentTrip();
  if (trip?.driver_workflow_state === TRIP_LOG_STATE) return <Redirect href="/trip/external-app" />;
  return <>{children}</>;
}
