/**
 * A round trip as two legs: out (Riyadh → Jeddah) and back (Jeddah → Riyadh).
 * Its first and last stop are the same city, so "first → last" reads
 * "Riyadh → Riyadh"; the route to show is the outbound leg, plus "back to …".
 * Stops carry `leg_index` (0 out, 1 back); without it (an older server) the
 * outbound leg ends at the first drop-off.
 */
export interface LegStop {
  stop_sequence: number;
  stop_type?: string | null;
  leg_index?: number | null;
  actual_arrival?: string | null;
}

export interface TripLegs<S extends LegStop> {
  round: boolean;
  outbound: S[];
  ret: S[];
  /** 1 or 2 while a round trip is running (the leg of the next stop), else null. */
  currentLeg: 1 | 2 | null;
}

export function splitLegs<S extends LegStop>(stops: S[], rateCategory?: string | null): TripLegs<S> {
  const st = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const hasLegs = st.some((s) => (s.leg_index ?? 0) === 1);
  const round = hasLegs || /round/i.test(rateCategory || '');
  if (!round || st.length < 3) return { round: false, outbound: st, ret: [], currentLeg: null };

  let outbound: S[];
  let ret: S[];
  if (hasLegs) {
    outbound = st.filter((s) => (s.leg_index ?? 0) === 0);
    ret = st.filter((s) => (s.leg_index ?? 0) === 1);
  } else {
    const drop = st.findIndex((s, i) => i > 0 && /drop/i.test(s.stop_type || ''));
    const end = drop > 0 && drop < st.length - 1 ? drop : Math.floor((st.length - 1) / 2);
    outbound = st.slice(0, end + 1);
    ret = st.slice(end + 1);
  }
  const next = st.find((s) => !s.actual_arrival);
  const currentLeg = !next ? null : ret.includes(next) ? 2 : 1;
  return { round: true, outbound, ret, currentLeg };
}
