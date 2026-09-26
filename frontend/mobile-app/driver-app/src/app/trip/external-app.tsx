/**
 * Route: /trip/external-app — retired. External-app trips now use the same
 * trip screens as native ones (see getEvidencePolicy); anything still linking
 * here goes Home, which opens the right step for the trip.
 */
import { Redirect } from 'expo-router';

export default function ExternalAppRoute() {
  return <Redirect href="/" />;
}
