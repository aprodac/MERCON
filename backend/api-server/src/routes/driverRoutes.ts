import { Router } from 'express';
import { getDrivers, getDriverById, createDriver, updateDriver, deleteDriver , bulkDeleteDrivers, bulkUpdateDriverStatus, bulkImportDrivers, getDriverUsage, getDriverStats, setDriverPassword, exportDrivers, getDriverPayouts } from '../controllers/driverController';
import { upsertDriverVehiclePreference } from '../controllers/fleetDispatchController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createDriverBody, updateDriverBody, listQuery, bulkImportDriversBody, setDriverPasswordBody, idParam } from '../schemas';

const router = Router();

// Protect all driver routes
router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.post('/bulk-delete', bulkDeleteDrivers);
router.post('/bulk-update-status', bulkUpdateDriverStatus);
// Fleet workbook import — rows are parsed from the .xlsx in the browser and
// posted as JSON, same contract as /trips/bulk-import.
router.post('/import', validate({ body: bulkImportDriversBody }), bulkImportDrivers);


// Registered before `/:id` so the literal path isn't captured as an id.
router.get('/stats', getDriverStats);
router.get('/export', exportDrivers);
router.get('/payouts', getDriverPayouts);
router.get('/', validate({ query: listQuery }), getDrivers);
router.post('/', validate({ body: createDriverBody }), createDriver);
router.get('/:id', getDriverById);
router.get('/:id/usage', getDriverUsage);
router.post('/:id/assignments', upsertDriverVehiclePreference);
router.post('/:id/set-password', validate({ params: idParam, body: setDriverPasswordBody }), setDriverPassword);
router.patch('/:id', validate({ body: updateDriverBody }), updateDriver);
router.delete('/:id', deleteDriver);

export default router;
