/** Route: /trip/stop — intermediate stop verification + photo uploads */
import StopVerificationScreen from '@/screens/StopVerificationScreen';
import { TripLogRedirect } from '@/components/TripLogRedirect';

export default function StopRoute() {
  return <TripLogRedirect><StopVerificationScreen /></TripLogRedirect>;
}
