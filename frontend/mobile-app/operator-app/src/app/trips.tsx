/** Route: /trips — operator's trips (live board, schedule, history). */
import { Redirect, useLocalSearchParams } from 'expo-router';
import TripsScreen from '@/features/trips/list/TripsScreen';

export default function OperatorTripsRoute() {
  // The ledger has its own page now; old links to Trips › Ledger go there.
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (view === 'ledger') return <Redirect href={'/ledger' as any} />;
  return <TripsScreen />;
}
