import { Router } from 'express';
import { reportHealth } from '../controllers/mobilePhoneController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));

// Phone snapshot / heartbeat from the driver app (docs/DRIVER_PHONE_AUDIT_PLAN.md)
router.post('/', reportHealth);

export default router;
