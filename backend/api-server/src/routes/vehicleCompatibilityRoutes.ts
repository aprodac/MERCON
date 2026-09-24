import { Router } from 'express';
import { getAllCompatibilityRules, upsertCompatibilityRule } from '../controllers/vehicleCompatibilityController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getAllCompatibilityRules);
router.post('/', authorizeRoles('Admin', 'Operator'), upsertCompatibilityRule);
router.put('/', authorizeRoles('Admin', 'Operator'), upsertCompatibilityRule);

export default router;
