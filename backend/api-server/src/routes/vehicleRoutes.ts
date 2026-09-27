import { Router } from 'express';
import { getVehicles, getVehicleById, createVehicle, updateVehicle, deleteVehicle , bulkDeleteVehicles, bulkUpdateVehicleStatus, getVehicleFinancials, getFleetFinancials, bulkImportVehicles, getVehicleUsage, getVehicleStats, getPhysicalGpsStatusSummary } from '../controllers/vehicleController';
import { getFleetLiveMap, getFleetLiveRoute, getFleetLiveTripMedia, getFleetLiveTripOverview } from '../controllers/fleetLiveMapController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createVehicleBody, updateVehicleBody, listQuery, idParam, bulkImportVehiclesBody } from '../schemas';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.post('/bulk-delete', bulkDeleteVehicles);
router.post('/bulk-update-status', bulkUpdateVehicleStatus);
// Fleet workbook import — see the note on the drivers equivalent.
router.post('/import', validate({ body: bulkImportVehiclesBody }), bulkImportVehicles);

// Registered before `/:id` so the literal path isn't captured as an id.
router.get('/stats', getVehicleStats);
router.get('/icces-summary', getPhysicalGpsStatusSummary);
router.get('/live-map', getFleetLiveMap);
router.get('/live-map/route', getFleetLiveRoute);
router.get('/live-map/trips/:id/media', validate({ params: idParam }), getFleetLiveTripMedia);
router.get('/live-map/trips/:id/overview', validate({ params: idParam }), getFleetLiveTripOverview);
router.get('/', validate({ query: listQuery }), getVehicles);
router.post('/', validate({ body: createVehicleBody }), createVehicle);
// Must be registered before `/:id` so the literal path isn't captured as an id.
router.get('/financials/fleet', getFleetFinancials);
router.get('/:id/financials', validate({ params: idParam }), getVehicleFinancials);
router.get('/:id', validate({ params: idParam }), getVehicleById);
router.get('/:id/usage', validate({ params: idParam }), getVehicleUsage);
router.patch('/:id', validate({ params: idParam, body: updateVehicleBody }), updateVehicle);
router.put('/:id', validate({ params: idParam, body: updateVehicleBody }), updateVehicle);
router.delete('/:id', validate({ params: idParam }), deleteVehicle);

export default router;
