import { Router } from 'express';
import {
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
} from '../controllers/financeReportsController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/reports/trial-balance', getTrialBalance);
router.get('/reports/profit-and-loss', getProfitAndLoss);
router.get('/reports/balance-sheet', getBalanceSheet);

export default router;
