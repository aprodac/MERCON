import { Router } from 'express';
import {
  getBills,
  getBillById,
  createDraftBill,
  updateDraftBill,
  deleteDraftBill,
  approveBillHandler,
  recordBillPaymentHandler,
  voidBillHandler,
} from '../controllers/billController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getBills);
router.post('/', createDraftBill);
router.get('/:id', getBillById);
router.patch('/:id', updateDraftBill);
router.delete('/:id', deleteDraftBill);
router.post('/:id/approve', approveBillHandler);
router.post('/:id/payments', recordBillPaymentHandler);
router.post('/:id/void', voidBillHandler);

export default router;
