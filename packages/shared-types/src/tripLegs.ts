/**
 * A round trip as two legs: out (Riyadh → Jeddah) and back (Jeddah → Riyadh).
 * Its first and last stop are the same city, so "first → last" reads
 * "Riyadh → Riyadh"; the route to show is the way out, plus "back to …".
 * Stops carry `leg_index` (0 out, 1 back); without it (older data or a
 * server that doesn't send it) the way out ends at the first drop-off.
 * Used by the web dashboard and the operator app so both read trips the same.
 */
export interface LegStop {
  stop_sequence?: number | null;
  sequence?: number | null;
  stop_type?: string | null;
  leg_index?: number | null;
  actual_arrival?: string | Date | null;
}

export interface TripLegs<S extends LegStop> {
  round: boolean;
  /** The way out — every stop for a one-way trip. */
  outbound: S[];
  /** The way back (round trip only). */
  ret: S[];
  /** 1 or 2 while a round trip still has stops to reach (the leg of the next one), else null. */
  currentLeg: 1 | 2 | null;
}

const seqOf = (s: LegStop, i: number) => s.stop_sequence ?? s.sequence ?? i;

export function splitLegs<S extends LegStop>(stops: S[] | null | undefined, rateCategory?: string | null): TripLegs<S> {
  const st = (stops ?? []).map((s, i) => ({ s, k: seqOf(s, i) })).sort((a, b) => a.k - b.k).map((x) => x.s);
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

/**
 * The two places a trip is "from → to": a one-way trip's first and last stop,
 * a round trip's way out (start → turn-around point) plus where it ends.
 */
export function tripEnds<S extends LegStop>(stops: S[] | null | undefined, rateCategory?: string | null): { from: S | null; to: S | null; back: S | null; round: boolean } {
  const legs = splitLegs(stops, rateCategory);
  const out = legs.outbound;
  return {
    from: out[0] ?? null,
    to: out.length > 1 ? out[out.length - 1] : null,
    back: legs.round ? legs.ret[legs.ret.length - 1] ?? out[0] ?? null : null,
    round: legs.round,
  };
}
