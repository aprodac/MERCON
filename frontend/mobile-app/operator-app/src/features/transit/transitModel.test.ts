/**
 * Transit times helpers. Run: npx tsx src/features/transit/transitModel.test.ts
 */
import { TONE, onTimeTone, overText, routeMatches, savedTransitMinutes, toneFor } from './transitModel';

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

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
