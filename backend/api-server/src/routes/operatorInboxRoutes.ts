import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { getDocumentExpiries, getDriverUpdates, getTripDriverUpdates, shareDriverUpdate, shareDriverUpdateBody } from '../controllers/operatorInboxController';
import { idParam } from '../schemas';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.get('/driver-updates', getDriverUpdates);
router.post('/driver-updates/share', validate({ body: shareDriverUpdateBody }), shareDriverUpdate);
router.get('/document-expiries', getDocumentExpiries);
router.get('/trips/:id/driver-updates', validate({ params: idParam }), getTripDriverUpdates);

export default router;
