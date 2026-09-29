import { Router } from 'express';
import {
  createSettlement,
  getPayable,
  getSettlement,
  getSettlementQueue,
  listSettlements,
  voidSettlementHandler,
} from '../controllers/driverSettlementController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

// Before '/:id' so these aren't read as ids
router.get('/queue', getSettlementQueue);
router.get('/payable', getPayable);
router.get('/', listSettlements);
router.post('/', createSettlement);
router.get('/:id', getSettlement);
router.post('/:id/void', voidSettlementHandler);

export default router;
