/** Route: /needs-action?kind=<ActionKind> — one kind of "needs you" item, from Home's Today card. */
import NeedsKindScreen from '@/features/dashboard/screens/NeedsKindScreen';

export default function NeedsActionRoute() {
  return <NeedsKindScreen />;
}
