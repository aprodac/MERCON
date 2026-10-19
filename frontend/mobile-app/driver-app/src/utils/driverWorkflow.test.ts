/**
 * Which step the driver app thinks he is on. Run: npx tsx src/utils/driverWorkflow.test.ts
 * Cases are the two live round trips a driver could not finish (Oct 2026):
 * the office typed in a stop's departure time while he was still on that step.
 */
import { getEffectiveWorkflowState } from '@mercon/shared-types';
import type { MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { driverIsReturnLoading, driverWorkflowState, isAtOutboundLoading, isOnReturnLeg } from './driverWorkflow';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) { failed++; console.error(`✗ ${name}`, detail ?? ''); } else console.log(`✓ ${name}`);
}

const stop = (seq: number, leg: number, type: string, arr: string | null, dep: string | null) =>
  ({ id: `s${seq}`, stop_sequence: seq, leg_index: leg, stop_type: type, location_name: type, actual_arrival: arr, actual_departure: dep }) as any;

// TRP-0017 as it was: driver at the final drop-off, the office had typed in its departure.
const trp17 = {
  id: 't17', status: 'InTransit', driver_workflow_state: 'ARRIVED_AT_FINAL_DELIVERY',
  stops: [
    stop(1, 0, 'Pickup', '2026-10-14T16:29:18Z', '2026-10-14T16:28:56Z'),
    stop(2, 0, 'Dropoff', '2026-10-15T07:38:57Z', '2026-10-15T13:54:27Z'),
    stop(3, 1, 'Pickup', null, '2026-10-15T14:27:54Z'),
    stop(4, 1, 'Dropoff', '2026-10-16T04:59:07Z', '2026-10-16T05:58:09.000Z'),
  ],
} as unknown as MobileTrip;

// TRP-0018 as it was: driver at return loading, the office had typed in its departure.
const trp18 = {
  id: 't18', status: 'Loading', driver_workflow_state: 'RETURN_LOADING',
  stops: [
    stop(1, 0, 'Pickup', '2026-10-17T04:55:03Z', '2026-10-17T04:54:06.000Z'),
    stop(2, 0, 'Dropoff', '2026-10-17T04:54:06.000Z', '2026-10-17T04:58:27Z'),
    stop(3, 1, 'Pickup', '2026-10-17T04:58:27Z', '2026-10-17T05:01:12.000Z'),
    stop(4, 1, 'Dropoff', null, null),
  ],
} as unknown as MobileTrip;

// The bug, reproduced with the old rule.
check('old rule: TRP-0017 read as COMPLETED while the server had it InTransit', getEffectiveWorkflowState(trp17 as any) === 'COMPLETED');
check('old rule: TRP-0018 read as past return loading', getEffectiveWorkflowState(trp18 as any) !== 'RETURN_LOADING', getEffectiveWorkflowState(trp18 as any));

// The fix.
check('TRP-0017: still at the final delivery (can press Complete)', driverWorkflowState(trp17) === 'ARRIVED_AT_FINAL_DELIVERY');
check('TRP-0018: still at return loading (can take photos and continue)', driverWorkflowState(trp18) === 'RETURN_LOADING');

check('TRP-0018: return loading screen (leg 2)', driverIsReturnLoading(trp18));

// TRP-0038: phone still says round-1 loading after round 1 was delivered.
const trp38 = {
  id: 't38', status: 'Loading', driver_workflow_state: 'ARRIVED_AT_PICKUP',
  stops: [
    stop(1, 0, 'Pickup', '2026-10-18T04:00:00Z', '2026-10-18T05:00:00Z'),
    stop(2, 0, 'Dropoff', '2026-10-18T09:00:00Z', '2026-10-18T10:00:00Z'),
    stop(3, 1, 'Pickup', null, null),
    stop(4, 1, 'Dropoff', null, null),
  ],
} as unknown as MobileTrip;
check('TRP-0038: stale round-1 loading → return loading', driverWorkflowState(trp38) === 'RETURN_LOADING' && driverIsReturnLoading(trp38));
const fresh = { ...trp38, stops: [stop(1, 0, 'Pickup', 'x', null), stop(2, 0, 'Dropoff', null, null), stop(3, 1, 'Pickup', null, null), stop(4, 1, 'Dropoff', null, null)] } as unknown as MobileTrip;
check('round 1 loading stays round 1 loading', driverWorkflowState(fresh) === 'ARRIVED_AT_PICKUP' && !driverIsReturnLoading(fresh));

// Finished only when the server says so.
check('server Completed → COMPLETED', driverWorkflowState({ ...trp17, status: 'Completed' } as MobileTrip) === 'COMPLETED');
check('Invoiced → COMPLETED', driverWorkflowState({ ...trp17, status: 'Invoiced' } as MobileTrip) === 'COMPLETED');

// Old trip with no state from the driver, all stamped, server still open → final delivery, never "done".
const legacy = { ...trp17, driver_workflow_state: null } as unknown as MobileTrip;
check('no driver state + stamped + open → final delivery', driverWorkflowState(legacy) === 'ARRIVED_AT_FINAL_DELIVERY');
const oneWay = {
  id: 'o1', status: 'InTransit', driver_workflow_state: null,
  stops: [stop(1, 0, 'Pickup', 'x', 'x'), stop(2, 0, 'Dropoff', 'x', 'x')],
} as unknown as MobileTrip;
check('one-way, stamped, open → delivery', driverWorkflowState(oneWay) === 'ARRIVED_AT_DELIVERY');

// Screen rules.
check('RETURN_LOADING is on the return leg', isOnReturnLeg('RETURN_LOADING'));
check('ARRIVED_AT_RETURN_STOP_2 is on the return leg', isOnReturnLeg('ARRIVED_AT_RETURN_STOP_2'));
check('ARRIVED_AT_DELIVERY is not on the return leg', !isOnReturnLeg('ARRIVED_AT_DELIVERY'));
check('LOADING is at the outbound loading', isAtOutboundLoading('LOADING'));
check('IN_TRANSIT is past the outbound loading', !isAtOutboundLoading('IN_TRANSIT'));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
