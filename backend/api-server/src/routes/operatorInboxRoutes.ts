import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { getDocumentExpiries, getDriverUpdates, shareDriverUpdate, shareDriverUpdateBody } from '../controllers/operatorInboxController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.get('/driver-updates', getDriverUpdates);
router.post('/driver-updates/share', validate({ body: shareDriverUpdateBody }), shareDriverUpdate);
router.get('/document-expiries', getDocumentExpiries);

export default router;
