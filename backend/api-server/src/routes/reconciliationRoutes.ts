import { Router } from 'express';
import {
  reconcileBankAccountHandler,
  listReconciliations,
  getReconciliationById,
} from '../controllers/reconciliationController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', listReconciliations);
router.post('/', reconcileBankAccountHandler);
router.get('/:id', getReconciliationById);

export default router;
