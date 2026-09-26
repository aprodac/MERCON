import { Router } from 'express';
import {
  getInvoices,
  getInvoiceById,
  createDraftInvoice,
  updateDraftInvoice,
  deleteDraftInvoice,
  issueInvoiceHandler,
  recordInvoicePaymentHandler,
  voidInvoiceHandler,
} from '../controllers/invoiceController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getInvoices);
router.post('/', createDraftInvoice);
router.get('/:id', getInvoiceById);
router.patch('/:id', updateDraftInvoice);
router.delete('/:id', deleteDraftInvoice);
router.post('/:id/issue', issueInvoiceHandler);
router.post('/:id/payments', recordInvoicePaymentHandler);
router.post('/:id/void', voidInvoiceHandler);

export default router;
