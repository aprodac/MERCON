import { Router } from 'express';
import {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
  bulkImportLocations,
  pinLocationHandler,
} from '../controllers/locationController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { bulkImportLocationsBody, pinBody } from '../schemas';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', getLocations);
router.post('/', createLocation);
// City/lane-endpoint workbook import — rows are parsed from the .xlsx in the
// browser and posted as JSON, same contract as /rate-cards/import.
router.post('/import', validate({ body: bulkImportLocationsBody }), bulkImportLocations);
router.get('/:id', getLocationById);
router.put('/:id', updateLocation);
router.patch('/:id', updateLocation);
// Pin exactly — also re-pins the open trip stops still using the old guess.
router.post('/:id/pin', validate({ body: pinBody }), pinLocationHandler);
router.delete('/:id', deleteLocation);

export default router;
