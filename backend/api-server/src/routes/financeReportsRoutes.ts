import { Router } from 'express';
import {
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
} from '../controllers/financeReportsController';
import { getARAgeing, getAPAgeing } from '../controllers/ageingReportsController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/reports/trial-balance', getTrialBalance);
router.get('/reports/profit-and-loss', getProfitAndLoss);
router.get('/reports/balance-sheet', getBalanceSheet);
router.get('/reports/ar-ageing', getARAgeing);
router.get('/reports/ap-ageing', getAPAgeing);
router.get('/reports/cash-flow', getCashFlow);
router.get('/reports/general-ledger', getGeneralLedger);

export default router;
