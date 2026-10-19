/** Route: /trip/pickup — cargo photo + confirm pickup (AtPickup -> InTransit). */
import PickupVerificationScreen from '@/screens/PickupVerificationScreen';
import { TripLogRedirect } from '@/components/TripLogRedirect';

export default function PickupRoute() {
  return <TripLogRedirect><PickupVerificationScreen /></TripLogRedirect>;
}
