import { Router } from 'express';
import { getCustomers, getCustomerSummary, getCustomerById, getCustomerStatement, createCustomer, updateCustomer, deleteCustomer, bulkImportCustomers } from '../controllers/customerController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { storeInlineImages } from '../middlewares/inlineImages';
import { createCustomerBody, updateCustomerBody, listQuery, idParam } from '../schemas';
import { getCustomerTrackingLink, trackingLinkBody } from '../controllers/trackingController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', validate({ query: listQuery }), getCustomers);
router.get('/summary', getCustomerSummary);
router.post('/import', bulkImportCustomers);
router.post('/', validate({ body: createCustomerBody }), storeInlineImages('logo_url'), createCustomer);
router.get('/:id/statement', validate({ params: idParam }), getCustomerStatement);
// The customer-wide tracking page link (all their trucks on the road); renew issues a new one.
router.post('/:id/tracking-link', validate({ params: idParam, body: trackingLinkBody }), getCustomerTrackingLink);
router.get('/:id', validate({ params: idParam }), getCustomerById);
router.patch('/:id', validate({ params: idParam, body: updateCustomerBody }), storeInlineImages('logo_url'), updateCustomer);
router.delete('/:id', validate({ params: idParam }), deleteCustomer);

export default router;
