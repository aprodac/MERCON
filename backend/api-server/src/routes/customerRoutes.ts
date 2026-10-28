import { Router } from 'express';
import { getCustomers, getCustomerSummary, getCustomerById, getCustomerStatement, createCustomer, updateCustomer, deleteCustomer, bulkImportCustomers } from '../controllers/customerController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { storeInlineImages } from '../middlewares/inlineImages';
import { createCustomerBody, updateCustomerBody, listQuery, idParam } from '../schemas';
import { getTransitSummary, getTransitRoute, getSavedTransits, putPlannedTransit, getQuotationTransits, deletePlannedTransit, getTransitOverview, transitQuery, transitRouteQuery, transitPlannedBody, transitKeyQuery } from '../controllers/transitTimesController';
import { getCustomerTrackingLink, getCustomerTrackingOpens, trackingLinkBody } from '../controllers/trackingController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', validate({ query: listQuery }), getCustomers);
router.get('/summary', getCustomerSummary);
router.get('/transit-overview', getTransitOverview);
router.post('/import', bulkImportCustomers);
router.post('/', validate({ body: createCustomerBody }), storeInlineImages('logo_url'), createCustomer);
router.get('/:id/transit-times', validate({ params: idParam, query: transitQuery }), getTransitSummary);
router.get('/:id/transit-times/route', validate({ params: idParam, query: transitRouteQuery }), getTransitRoute);
router.get('/:id/transit-times/saved', validate({ params: idParam }), getSavedTransits);
router.put('/:id/transit-times/planned', validate({ params: idParam, body: transitPlannedBody }), putPlannedTransit);
router.delete('/:id/transit-times/planned', validate({ params: idParam, query: transitKeyQuery }), deletePlannedTransit);
router.get('/:id/transit-times/quotations', validate({ params: idParam }), getQuotationTransits);
router.get('/:id/statement', validate({ params: idParam }), getCustomerStatement);
router.get('/:id/tracking-opens', validate({ params: idParam }), getCustomerTrackingOpens);
// The customer-wide tracking page link (all their trucks on the road); renew issues a new one.
router.post('/:id/tracking-link', validate({ params: idParam, body: trackingLinkBody }), getCustomerTrackingLink);
router.get('/:id', validate({ params: idParam }), getCustomerById);
router.patch('/:id', validate({ params: idParam, body: updateCustomerBody }), storeInlineImages('logo_url'), updateCustomer);
router.delete('/:id', validate({ params: idParam }), deleteCustomer);

export default router;
