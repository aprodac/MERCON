// Route → stops / legs now live in @mercon/shared-types so the operator app
// builds exactly the same trip. Re-exported here for existing imports.
export { buildStopsFromSlot, routeLegsFromSlot } from '@mercon/shared-types';
export type { TripSlotRoute as MapSlotToStopsInput } from '@mercon/shared-types';
