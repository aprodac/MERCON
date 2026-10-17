/** Route: /trip/navigate — live map to the delivery stop; auto-detects arrival (InTransit -> AtDelivery). */
import LiveNavigationScreen from '@/screens/LiveNavigationScreen';
import { TripLogRedirect } from '@/components/TripLogRedirect';

export default function NavigateRoute() {
  return <TripLogRedirect><LiveNavigationScreen /></TripLogRedirect>;
}
