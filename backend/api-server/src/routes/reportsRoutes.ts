import { Router } from 'express';
import { getSummary, getFleetPerformance, getDriverPerformance, getRevenueReport, getCustomReport } from '../controllers/reportsController';
import { getDelayLog, getDelayGrid, getDelayAnalysis } from '../controllers/delayReportsController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

// Dashboard summary KPIs + trip distribution + monthly revenue chart
router.get('/summary', getSummary);

// Gated Reports module sub-routes
router.use(requireModuleEnabled('reports'));

// Fleet utilization per vehicle
router.get('/fleet', getFleetPerformance);

// Driver performance metrics
router.get('/drivers', getDriverPerformance);

// Revenue breakdown by month — this *is* the invoice report, so it needs
// invoices on top of the router-level 'reports' gate.
router.get('/revenue', requireModuleEnabled('invoices'), getRevenueReport);

// Instant Custom Reports
router.get('/custom', getCustomReport);

// Delay reporting. All three take the same filters (date range, customer,
// driver, vehicle, reason) so one filter bar on the page drives every view.
router.get('/delays', getDelayLog);
router.get('/delays/grid', getDelayGrid);
router.get('/delays/analysis', getDelayAnalysis);

export default router;
