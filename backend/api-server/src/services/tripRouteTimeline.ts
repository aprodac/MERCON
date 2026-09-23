/**
 * Thin re-export layer around @mercon/shared-types for backend trip route timeline
 * and stop workflow evaluation logic.
 */

export {
  type TripStopLike,
  type TripStopLike as TripStop,
  type TripLike,
  type TripLike as MobileTrip,
  type TimelineStop,
  type AuthoritativeActiveStop,
  type TimelineTarget,
  type LegEndpoints,
  type DriverWorkflowState,
  DRIVER_WORKFLOW_STATES,
  isRoundTripCategory,
  isRoundTrip,
  stopLabel,
  stopAddress,
  parseTripRouteNodes,
  buildTripRouteTimeline,
  getEffectiveWorkflowState,
  resolveAuthoritativeActiveStop,
  parseStopWorkflowState,
  getLegIntermediateDbStops,
  targetFromWorkflowState,
  findTimelineIndex,
  getLegStops,
  getLegEndpoints,
  getIntermediateStops,
  getOutboundIntermediateStops,
  getReturnIntermediateStops,
} from '@mercon/shared-types';
