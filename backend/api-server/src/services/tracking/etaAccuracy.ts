/**
 * How good the ETAs are: for every stop a truck has reached in the last N
 * days, what etaWatcher predicted (EtaPrediction) against when it really
 * arrived (TripStop.actual_arrival) — grouped by how far ahead the
 * prediction was made, because "1 h before" and "6 h before" are different
 * promises. Road-route ETAs only; straight-line estimates are counted apart.
 *
 *   error = predicted − actual (minutes): positive = the truck came earlier
 *   than said, negative = later. "Typical miss" is the average of |error|.
 */
import { Prisma, type PrismaClient } from '@prisma/client';

export const HORIZONS = [
  { id: 'under_1h', label: 'Under 1 h before', max: 60 },
  { id: '1_3h', label: '1–3 h before', max: 180 },
  { id: '3_6h', label: '3–6 h before', max: 360 },
  { id: 'over_6h', label: 'Over 6 h before', max: Infinity },
] as const;

export interface EtaAccuracyRow {
  horizon: (typeof HORIZONS)[number]['id'];
  label: string;
  predictions: number;
  stops: number;
  /** Average of |predicted − actual|, minutes. */
  typicalMissMin: number | null;
  /** Average of (predicted − actual): negative = trucks arrive later than said. */
  biasMin: number | null;
  /** 9 in 10 predictions were within this many minutes. */
  p90Min: number | null;
  /** Share of predictions within 15 minutes. */
  within15Pct: number | null;
}

export interface EtaAccuracy {
  days: number;
  rows: EtaAccuracyRow[];
  overall: Omit<EtaAccuracyRow, 'horizon' | 'label'>;
  /** Straight-line estimates (no road route) in the same window — not in the rows above. */
  estimates: number;
}

const round1 = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);

export async function loadEtaAccuracy(db: PrismaClient, days = 30): Promise<EtaAccuracy> {
  const since = new Date(Date.now() - days * 86_400_000);
  const base = Prisma.sql`
    FROM "EtaPrediction" p
    JOIN "TripStop" s ON s.id = p."stopId"
    WHERE s.actual_arrival IS NOT NULL
      AND s.actual_arrival > p."predictedAt"
      AND s.actual_arrival >= ${since}`;
  const stats = Prisma.sql`
      COUNT(*)::int AS predictions,
      COUNT(DISTINCT x.stop)::int AS stops,
      AVG(ABS(x.err))::float AS miss,
      AVG(x.err)::float AS bias,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY ABS(x.err))::float AS p90,
      AVG(CASE WHEN ABS(x.err) <= 15 THEN 1 ELSE 0 END)::float AS within15`;
  const sub = Prisma.sql`
    SELECT p."stopId" AS stop,
           EXTRACT(EPOCH FROM (s.actual_arrival - p."predictedAt")) / 60 AS ahead,
           EXTRACT(EPOCH FROM (p."predictedArrival" - s.actual_arrival)) / 60 AS err
    ${base} AND p.approx = false`;

  const [byHorizon, overall, estimates] = await Promise.all([
    db.$queryRaw<any[]>`
      SELECT CASE WHEN x.ahead < 60 THEN 'under_1h' WHEN x.ahead < 180 THEN '1_3h' WHEN x.ahead < 360 THEN '3_6h' ELSE 'over_6h' END AS horizon,
      ${stats}
      FROM (${sub}) x GROUP BY 1`,
    db.$queryRaw<any[]>`SELECT ${stats} FROM (${sub}) x`,
    db.$queryRaw<any[]>`SELECT COUNT(*)::int AS n ${base} AND p.approx = true`,
  ]);

  const shape = (r: any) => ({
    predictions: Number(r?.predictions ?? 0),
    stops: Number(r?.stops ?? 0),
    typicalMissMin: round1(r?.miss),
    biasMin: round1(r?.bias),
    p90Min: round1(r?.p90),
    within15Pct: r?.within15 == null ? null : Math.round(Number(r.within15) * 100),
  });
  return {
    days,
    rows: HORIZONS.map((h) => ({ horizon: h.id, label: h.label, ...shape(byHorizon.find((r) => r.horizon === h.id)) })),
    overall: shape(overall[0]),
    estimates: Number(estimates[0]?.n ?? 0),
  };
}
