import { Router } from 'express';
import {
  listBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  transferFundsHandler,
} from '../controllers/bankAccountController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', listBankAccounts);
router.post('/', createBankAccount);
router.post('/transfer', transferFundsHandler);
router.get('/:id', getBankAccountById);
router.put('/:id', updateBankAccount);

export default router;
