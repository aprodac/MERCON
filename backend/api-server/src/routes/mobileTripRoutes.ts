import { Router } from 'express';
import { getCurrentTrip, getTripHistory, getScheduledTrips, updateTripStatus, uploadTripPhoto, getTripRoute, getMobileTripDetails, recordDriverLocation } from '../controllers/mobileTripController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';
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

export default router;
