import { Router } from 'express';
import {
  getTrips, getTripById, createTrip, updateTripStatus,
  dispatchTrip, replaceDriver, pickupArrive, pickupVerify, deliveryVerify,
  bulkDeleteTrips, bulkUpdateTripStatus, bulkAssignTrips, getUnsettledCompletedTrips, updateTripFinancials,
  logStopDelay, confirmEvidenceTime, bulkImportTrips, updateTripStop, getMonthlyTripBoard, shareTripMediaToWhatsApp
} from '../controllers/tripController';
import { exportTrips } from '../controllers/tripExportController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createTripBody, listQuery, logStopDelayBody, confirmEvidenceTimeBody, bulkImportTripsBody, updateTripStopBody } from '../schemas';

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
router.post('/bulk-import', validate({ body: bulkImportTripsBody }), bulkImportTrips);


router.get('/', validate({ query: listQuery }), getTrips);
// Dedicated streaming export — must appear before /:id to avoid capture
router.get('/export', exportTrips);
router.post('/', validate({ body: createTripBody }), createTrip);
router.get('/:id', getTripById);
router.patch('/:id/status', updateTripStatus);
router.patch('/:id/financials', updateTripFinancials);

// Phase 1: Dispatch & Assignment
router.post('/:id/dispatch', dispatchTrip);
router.post('/:id/replace-driver', replaceDriver);

// Why a stop ran late — operator-filled, drivers never see this.
router.patch('/:id/stops/:stopId/delay', validate({ body: logStopDelayBody }), logStopDelay);

// Confirm/correct the real time an EXTERNAL_APP evidence screenshot happened
// at. No frozen-trip restriction — see confirmEvidenceTime's own comment.
router.patch('/:id/stops/:stopId/confirm-time', validate({ body: confirmEvidenceTimeBody }), confirmEvidenceTime);

// Correct where a stop is (label, address, lane endpoint, pin). Allowed while
// the trip is still running — a wrong address is exactly what needs fixing
// mid-trip — and refused once it's completed, invoiced or cancelled.
router.patch('/:id/stops/:stopId', validate({ body: updateTripStopBody }), updateTripStop);

// Phase 2: Driver Workflow
router.post('/:id/pickup/arrive', pickupArrive);
router.post('/:id/pickup/verify', pickupVerify);
router.post('/:id/delivery/verify', deliveryVerify);

// Phase 3: Operator WhatsApp Media Dispatch
router.post('/:id/share-whatsapp', shareTripMediaToWhatsApp);


export default router;

