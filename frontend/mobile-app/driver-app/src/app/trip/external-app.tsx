import { useLocalSearchParams } from 'expo-router';
import TripLogScreen from '@/screens/TripLogScreen';
import ExternalTripScreen, { type ExternalStyle } from '@/screens/ExternalTripScreen';

const STYLES: ExternalStyle[] = ['next', 'list', 'tag'];

/**
 * Route: /trip/external-app — customer-app trips. Without `style`: the trip log
 * (shared-types tripLog). `?style=next|list|tag`: the stop-by-stop screens
 * with one screenshot per stop (ExternalTripScreen), three ideas to choose from.
 */
export default function ExternalAppRoute() {
  const { style } = useLocalSearchParams<{ style?: string }>();
  const picked = STYLES.find((x) => x === style);
  return picked ? <ExternalTripScreen style={picked} /> : <TripLogScreen />;
}
