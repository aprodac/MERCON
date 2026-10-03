import { Router } from 'express';
import {
  getExpenses,
  getExpenseSummary,
  getExpenseLedger,
  postExpenseLedger,
  postUnpostedExpenses,
  getExpenseLedgerSetup,
  updateExpenseLedgerSetup,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenseController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('expenses'));

router.get('/', getExpenses);
// Before '/:id', which would otherwise match it
router.get('/summary', getExpenseSummary);
router.get('/ledger/setup', getExpenseLedgerSetup);
// Which accounts expenses post to, and bulk posting: Admin only
router.put('/ledger/setup', authorizeRoles('Admin'), updateExpenseLedgerSetup);
router.post('/ledger/post-unposted', authorizeRoles('Admin'), postUnpostedExpenses);
router.post('/', createExpense);
router.get('/:id', getExpenseById);
router.patch('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.get('/:id/ledger', getExpenseLedger);
router.post('/:id/ledger', postExpenseLedger);

export default router;
