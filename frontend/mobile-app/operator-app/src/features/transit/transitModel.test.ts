/**
 * Transit times helpers. Run: npx tsx src/features/transit/transitModel.test.ts
 */
import { ANY_SIZE, TONE, anySizeKey, onTimeTone, overText, quotationRouteMatches, quotationRoutes, routeMatches, savedTransitMinutes, toneFor } from './transitModel';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) { failed++; console.error(`✗ ${name}`, detail ?? ''); } else console.log(`✓ ${name}`);
}

// ── Tones: same bands as the API (15 min grace, 1 h amber) ──
check('15 min over is green', toneFor(195, 180) === TONE.green);
check('16 min over is amber', toneFor(196, 180) === TONE.amber);
check('60 min over is amber', toneFor(240, 180) === TONE.amber);
check('61 min over is red', toneFor(241, 180) === TONE.red);
check('early is green', toneFor(120, 180) === TONE.green);
check('no plan, no tone', toneFor(120, null) === null);
check('on time 80% green, 60% amber, 59% red', onTimeTone(80) === TONE.green && onTimeTone(60) === TONE.amber && onTimeTone(59) === TONE.red);
check('on time unknown', onTimeTone(null) === null);
check('over text', overText(210, 180) === '+30 min' && overText(115, 180) === '−1h 05' && overText(180, 180) === 'on plan', [overText(210, 180), overText(115, 180)]);

// ── Search ──
const r = { from: 'Riyadh  Warehouse', to: 'Jeddah Port' };
check('empty search matches', routeMatches(r, '  '));
check('words from both ends, any case', routeMatches(r, 'riyadh PORT'));
check('extra spaces ignored', routeMatches(r, 'riyadh   warehouse'));
check('a missing word does not match', !routeMatches(r, 'riyadh dammam'));

// ── Saved time lookup (what Create trip plans with) ──
const saved = [
  { origin_key: 'riyadh warehouse', destination_key: 'jeddah port', leg: 'out', truck_class: '10 TON', planned_minutes: 600 },
  { origin_key: 'jeddah port', destination_key: 'riyadh warehouse', leg: 'return', truck_class: '10 TON', planned_minutes: 630 },
];
check('saved out leg, names normalised', savedTransitMinutes(saved, 'out', ' Riyadh  Warehouse ', 'JEDDAH PORT', '10 TON') === 600);
check('saved return leg', savedTransitMinutes(saved, 'return', 'Jeddah Port', 'Riyadh Warehouse', '10 TON') === 630);
check('other size not used', savedTransitMinutes(saved, 'out', 'Riyadh Warehouse', 'Jeddah Port', '20 TON') === null);
check('reverse direction not used for the way out', savedTransitMinutes(saved, 'out', 'Jeddah Port', 'Riyadh Warehouse', '10 TON') === null);
check('no route yet', savedTransitMinutes(saved, 'out', '', 'Jeddah Port', '10 TON') === null);

// ── One time for every truck size ──
const anySaved = [...saved, { origin_key: 'abha', destination_key: 'jizan', leg: 'out', truck_class: ANY_SIZE, planned_minutes: 150 }];
check('all-sizes time plans any size', savedTransitMinutes(anySaved, 'out', 'Abha', 'Jizan', '40 FEET') === 150);
check('a size\'s own time beats the all-sizes one', savedTransitMinutes([...anySaved, { origin_key: 'abha', destination_key: 'jizan', leg: 'out', truck_class: '5 TON', planned_minutes: 140 }], 'out', 'Abha', 'Jizan', '5 TON') === 140);
check('any-size key', anySizeKey('out|abha|jizan|5 TON') === 'out|abha|jizan|ANY');

// ── Quotations tab: each route once ──
const leg = (key: string, over: Partial<{ estimatedMin: number | null; estimateSource: 'road' | 'approx' | 'duty' | null; savedMin: number | null; actualAvgMin: number | null; trips: number; leg: 'out' | 'return'; from: string; to: string }> = {}) => {
  const [l, from, to] = key.split('|');
  return { key, leg: l as 'out' | 'return', from, to, via: 0, estimatedMin: 600, estimateSource: 'road' as const, savedMin: null, actualAvgMin: null, trips: 0, ...over };
};
const qs = [
  { number: 2, name: 'Daily 5T', legs: [leg('out|riyadh|jeddah|5 TON', { actualAvgMin: 620, trips: 2 }), leg('return|jeddah|riyadh|5 TON')] },
  { number: 3, name: 'Daily 10T', legs: [leg('out|riyadh|jeddah|10 TON', { savedMin: 660, actualAvgMin: 680, trips: 2 })] },
  { number: 4, name: 'Again 5T', legs: [leg('out|riyadh|jeddah|5 TON', { actualAvgMin: 620, trips: 2 })] },
  { number: 5, name: '10 h', legs: [leg('out|riyadh|jeddah|10 TON', { estimatedMin: 600, estimateSource: 'duty' })] },
];
const rs = quotationRoutes(qs);
const rj = rs.find((r) => r.id === 'out|riyadh|jeddah')!;
check('same places in two sizes / quotations are one route; duty line apart', rs.length === 3, rs.map((r) => r.id));
check('given TT is the saved time when any size has one', rj.givenMin === 660 && rj.saved, rj);
check('actual averages the sizes, the same leg counted once', rj.trips === 4 && rj.actualAvgMin === 650, rj);
check('it lists its quotations', rj.quotes.join(',') === '#2,#3,#4', rj.quotes);
check('saves against every size', rj.key === 'out|riyadh|jeddah|ANY');
check('search by quotation number', quotationRouteMatches(rj, '#3') && !quotationRouteMatches(rj, 'dammam'));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
