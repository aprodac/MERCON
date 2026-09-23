import { Router } from 'express';
import { getCustomers, getCustomerById, getCustomerStatement, createCustomer, updateCustomer, deleteCustomer, bulkImportCustomers } from '../controllers/customerController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createCustomerBody, updateCustomerBody, listQuery, idParam } from '../schemas';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', validate({ query: listQuery }), getCustomers);
router.post('/import', bulkImportCustomers);
router.post('/', validate({ body: createCustomerBody }), createCustomer);
router.get('/:id/statement', validate({ params: idParam }), getCustomerStatement);
router.get('/:id', validate({ params: idParam }), getCustomerById);
router.patch('/:id', validate({ params: idParam, body: updateCustomerBody }), updateCustomer);
router.delete('/:id', validate({ params: idParam }), deleteCustomer);

export default router;
