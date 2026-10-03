/** Route: /more — the old hub. Its links now live on the Profile tab. */
import { Redirect } from 'expo-router';

export default function OperatorMoreRoute() {
  return <Redirect href="/profile" />;
}
