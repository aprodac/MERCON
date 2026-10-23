import { Router } from 'express';
import { getCurrentTrip, getTripHistory, getScheduledTrips, updateTripStatus, uploadTripPhoto, getTripRoute, getMobileTripDetails, recordDriverLocation, startTripLog, undoTripLogEntry } from '../controllers/mobileTripController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';
import { driverPlaceLogEntry } from '../controllers/mobileTripLogPlaceController';
import { driverArriveAtStop } from '../controllers/mobileTripArriveController';
import { acknowledgeTrip, getPendingAcknowledgements, touchDriverDevice } from '../controllers/mobilePhoneController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));
router.use(touchDriverDevice);

router.get('/current', getCurrentTrip);
router.get('/history', getTripHistory);
router.get('/scheduled', getScheduledTrips);
router.get('/pending-acknowledgements', getPendingAcknowledgements);
router.get('/:id', getMobileTripDetails);
// Road route to the trip's next stop. Provider-neutral: the app asks MERCON,
// MERCON asks whichever routing provider is configured.
router.get('/:id/route', getTripRoute);
router.post('/:id/status', updateTripStatus);
router.post('/:id/photo', upload.single('file'), uploadTripPhoto);
router.post('/:id/location', recordDriverLocation);
router.post('/:id/acknowledge', acknowledgeTrip);
// Customer-app trips run as a trip log: start, then screenshots only (POST /:id/photo with operation=log).
router.post('/:id/log/start', startTripLog);
// "Arrived" at a stop, before its screenshot.
router.post('/:id/log/arrive', driverArriveAtStop);
router.delete('/:id/log/:entry', undoTripLogEntry);
// Which stop a send was made at — a planned one, or one the office didn't set.
router.post('/:id/log/:entry/stop', driverPlaceLogEntry);

export default router;
