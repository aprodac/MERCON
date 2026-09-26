/**
 * React Query keys for the driver app's server data. Every screen that shows
 * the same data reads the same cache entry, so opening a screen or switching
 * tabs no longer fires its own copy of the request. The whole cache is
 * cleared on sign-out (auth-context) and invalidated when a trip is assigned,
 * cancelled or reassigned (DriverNotificationManager).
 */
export const driverKeys = {
  currentTrip: ['driver', 'trip', 'current'] as const,
  scheduledTrips: ['driver', 'trips', 'scheduled'] as const,
  tripHistory: (limit: number) => ['driver', 'trips', 'history', limit] as const,
  profile: ['driver', 'profile'] as const,
  notifications: ['driver', 'notifications'] as const,
};
