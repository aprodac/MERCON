import { Router } from 'express';
import {
  getAccountingPeriods,
  createAccountingPeriod,
  closeAccountingPeriod,
  lockAccountingPeriod,
  reopenAccountingPeriod,
  getAccountingPeriodActivity,
  closeFiscalYearHandler,
} from '../controllers/accountingPeriodController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getAccountingPeriods);
router.post('/', createAccountingPeriod);
router.post('/close-fiscal-year', authorizeRoles('Admin'), closeFiscalYearHandler);
router.post('/:id/close', authorizeRoles('Admin'), closeAccountingPeriod);
router.post('/:id/reopen', authorizeRoles('Admin'), reopenAccountingPeriod);
router.post('/:id/lock', authorizeRoles('Admin'), lockAccountingPeriod);
router.get('/:id/activity', getAccountingPeriodActivity);

export default router;

