import { Router } from 'express';
import {
  createAdvance,
  listAdvances,
  getAdvanceById,
  applyAdvanceHandler,
  voidAdvanceHandler,
} from '../controllers/advanceController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', listAdvances);
router.post('/', createAdvance);
router.get('/:id', getAdvanceById);
router.post('/:id/apply', applyAdvanceHandler);
router.post('/:id/void', voidAdvanceHandler);

export default router;
