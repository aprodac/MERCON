/** Route: /trip/delivery — POD photo + confirm delivery (AtDelivery -> Completed). */
import DeliveryVerificationScreen from '@/screens/DeliveryVerificationScreen';
import { TripLogRedirect } from '@/components/TripLogRedirect';

export default function DeliveryRoute() {
  return <TripLogRedirect><DeliveryVerificationScreen /></TripLogRedirect>;
}
