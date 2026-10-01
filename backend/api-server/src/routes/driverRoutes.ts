import { Router } from 'express';
import { getDrivers, getDriverById, createDriver, updateDriver, deleteDriver , bulkDeleteDrivers, bulkUpdateDriverStatus, bulkImportDrivers, getDriverUsage, getDriverStats, setDriverPassword, exportDrivers, getDriverPayouts } from '../controllers/driverController';
import { upsertDriverVehiclePreference } from '../controllers/fleetDispatchController';
import { getDriverSalaries, createDriverSalary, updateDriverSalary, deleteDriverSalary } from '../controllers/vehicleCostController';
import { getDriversPhoneStatus, getDriverPhone, sendTestPush } from '../controllers/driverPhoneController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { storeInlineImages } from '../middlewares/inlineImages';
import { createDriverBody, updateDriverBody, listQuery, bulkImportDriversBody, setDriverPasswordBody, idParam, driverSalaryBody, updateDriverSalaryBody, nestedIdParams } from '../schemas';

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
router.get('/phone-status', getDriversPhoneStatus);
router.get('/', validate({ query: listQuery }), getDrivers);
router.post('/', validate({ body: createDriverBody }), storeInlineImages('avatar_url'), createDriver);
router.get('/:id', getDriverById);
router.get('/:id/usage', getDriverUsage);
router.get('/:id/phone', validate({ params: idParam }), getDriverPhone);
router.post('/:id/test-push', validate({ params: idParam }), sendTestPush);
router.post('/:id/assignments', upsertDriverVehiclePreference);
router.get('/:id/salaries', validate({ params: idParam }), getDriverSalaries);
router.post('/:id/salaries', validate({ params: idParam, body: driverSalaryBody }), createDriverSalary);
router.patch('/:id/salaries/:itemId', validate({ params: nestedIdParams, body: updateDriverSalaryBody }), updateDriverSalary);
router.delete('/:id/salaries/:itemId', validate({ params: nestedIdParams }), deleteDriverSalary);
router.post('/:id/set-password', validate({ params: idParam, body: setDriverPasswordBody }), setDriverPassword);
router.patch('/:id', validate({ body: updateDriverBody }), storeInlineImages('avatar_url'), updateDriver);
router.delete('/:id', deleteDriver);

export default router;
