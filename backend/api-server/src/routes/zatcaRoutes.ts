import { Router } from 'express';
import { activateZatcaProduction, connectZatca, getZatcaStatus, resetZatca, updateZatcaProfile } from '../controllers/zatcaController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { zatcaConnectBody, zatcaProfileBody, zatcaResetBody } from '../schemas/zatcaSchemas';

const router = Router();

// The client's own Admin (or Aprodac, via isSuperAdmin) connects their VAT
// registration to ZATCA. Operators never see or change it.
router.use(authenticateJWT);
router.use(authorizeRoles('Admin'));
router.use(requireModuleEnabled('zatca'));

router.get('/', getZatcaStatus);
router.put('/profile', validate({ body: zatcaProfileBody }), updateZatcaProfile);
router.post('/connect', validate({ body: zatcaConnectBody }), connectZatca);
router.post('/production', activateZatcaProduction);
router.post('/reset', validate({ body: zatcaResetBody }), resetZatca);

export default router;
