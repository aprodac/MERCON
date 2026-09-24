import { Router } from 'express';
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../controllers/accountController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getAccounts);
router.post('/', createAccount);
router.get('/:id', getAccountById);
router.patch('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
