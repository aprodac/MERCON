import { Router } from 'express';
import {
  getTrips, getTripById, createTrip, updateTripStatus,
  dispatchTrip, replaceDriver, pickupArrive, pickupVerify, deliveryVerify,
  bulkDeleteTrips, bulkUpdateTripStatus, bulkAssignTrips, getUnsettledCompletedTrips, updateTripFinancials, reviewTripCharges,
  logStopDelay, confirmEvidenceTime, confirmTripTimes, bulkImportTrips, updateTripStop, pinStop, updateTripStopsRoute, addExtraStopCharge, getMonthlyTripBoard, shareTripMediaToWhatsApp, sameDayCheck
} from '../controllers/tripController';
import { exportTrips } from '../controllers/tripExportController';
import { getTripTrackingLink, getTripTrackingLinks, trackingLinkBody, trackingLinksBody } from '../controllers/trackingController';
import { idParam } from '../schemas';
import { getTripDriverTrail } from '../controllers/driverPhoneController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createTripBody, listQuery, logStopDelayBody, confirmEvidenceTimeBody, confirmTripTimesBody, bulkImportTripsBody, updateTripStopBody, updateTripStopsRouteBody, extraStopChargeBody, pinBody, reviewTripChargesBody, tripStepBackBody } from '../schemas';
import { getProgressSteps, restoreStepBackPhotosHandler, stepBack, stepForward } from '../controllers/tripStepBackController';

import { getDriverRecommendations, getVehicleRecommendations } from '../controllers/fleetDispatchController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.get('/recommendations/drivers', getDriverRecommendations);
router.get('/recommendations/vehicles', getVehicleRecommendations);
router.get('/unsettled', getUnsettledCompletedTrips);
// Literal paths first — `/:id` would otherwise capture "monthly" as a trip id.
// A whole month grouped company → day, for the monthly-commitment board.
router.get('/monthly', getMonthlyTripBoard);
router.post('/bulk-delete', bulkDeleteTrips);
router.post('/bulk-update-status', bulkUpdateTripStatus);
router.post('/bulk-assign', bulkAssignTrips);
// Customer tracking links for several trips at once (trip list share).
router.post('/tracking-links', validate({ body: trackingLinksBody }), getTripTrackingLinks);
// Create Trip: does the driver already have a trip that day?
router.post('/same-day-check', sameDayCheck);
router.post('/bulk-import', validate({ body: bulkImportTripsBody }), bulkImportTrips);


router.get('/', validate({ query: listQuery }), getTrips);
// Dedicated streaming export — must appear before /:id to avoid capture
router.get('/export', exportTrips);
router.post('/', validate({ body: createTripBody }), createTrip);
router.get('/:id', getTripById);
// What the driver was sent for this trip, whether it reached the phone, and what they did.
router.get('/:id/driver-trail', getTripDriverTrail);
router.patch('/:id/status', updateTripStatus);
// Undo the driver's progress back to an earlier step (driver tapped ahead by mistake).
router.get('/:id/progress-steps', validate({ params: idParam }), getProgressSteps);
router.post('/:id/step-back', validate({ params: idParam, body: tripStepBackBody }), stepBack);
router.post('/:id/step-back/restore-photos', validate({ params: idParam }), restoreStepBackPhotosHandler);
// The reverse: move the trip on one step for the driver.
router.post('/:id/step-forward', validate({ params: idParam }), stepForward);
router.patch('/:id/financials', updateTripFinancials);
router.post('/:id/charge-review', validate({ body: reviewTripChargesBody }), reviewTripCharges);

// Phase 1: Dispatch & Assignment
router.post('/:id/dispatch', dispatchTrip);
router.post('/:id/replace-driver', replaceDriver);

// Why a stop ran late — operator-filled, drivers never see this.
router.patch('/:id/stops/:stopId/delay', validate({ body: logStopDelayBody }), logStopDelay);

// Confirm/correct the real time an EXTERNAL_APP evidence screenshot happened
// at. No frozen-trip restriction — see confirmEvidenceTime's own comment.
router.patch('/:id/stops/:stopId/confirm-time', validate({ body: confirmEvidenceTimeBody }), confirmEvidenceTime);
// Same, for every stop of the trip at once (customer apps show all stops on one screen).
router.patch('/:id/confirm-times', validate({ body: confirmTripTimesBody }), confirmTripTimes);

router.put('/:id/stops', validate({ body: updateTripStopsRouteBody }), updateTripStopsRoute);
// After adding a stop to an existing trip: optional extra-stop charge (TripCharge) and driver payout raise.
router.post('/:id/extra-stop', validate({ body: extraStopChargeBody }), addExtraStopCharge);

// Correct where a stop is (label, address, lane endpoint, pin). Allowed while
// the trip is still running — a wrong address is exactly what needs fixing
// mid-trip — and refused once it's completed, invoiced or cancelled.
router.patch('/:id/stops/:stopId', validate({ body: updateTripStopBody }), updateTripStop);
// Pin a stop exactly (and its customer location + other open trips going there).
router.post('/:id/stops/:stopId/pin', validate({ body: pinBody }), pinStop);

// Phase 2: Driver Workflow
router.post('/:id/pickup/arrive', pickupArrive);
router.post('/:id/pickup/verify', pickupVerify);
router.post('/:id/delivery/verify', deliveryVerify);

// Phase 3: Operator WhatsApp Media Dispatch
router.post('/:id/share-whatsapp', shareTripMediaToWhatsApp);
// The customer tracking link for this trip (created on first ask; renew issues a new one).
router.post('/:id/tracking-link', validate({ params: idParam, body: trackingLinkBody }), getTripTrackingLink);

export default router;

