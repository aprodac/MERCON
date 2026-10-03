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
  getInvoiceSummary,
  getUnbilledTrips,
  getInvoiceActivity,
  logInvoiceActivity,
  getInvoiceLedgerSetup,
  updateInvoiceLedgerSetup,
  listCreditNotes,
  createCreditNote,
  voidCreditNoteHandler,
} from '../controllers/invoiceController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getInvoices);
// Before '/:id' so these aren't read as ids
router.get('/summary', getInvoiceSummary);
router.get('/unbilled-trips', getUnbilledTrips);
router.get('/ledger/setup', getInvoiceLedgerSetup);
// Changing where every invoice posts is an Admin decision
router.put('/ledger/setup', authorizeRoles('Admin'), updateInvoiceLedgerSetup);
router.get('/credit-notes', listCreditNotes);
router.post('/credit-notes/:noteId/void', voidCreditNoteHandler);
router.post('/', createDraftInvoice);
router.get('/:id', getInvoiceById);
router.patch('/:id', updateDraftInvoice);
router.delete('/:id', deleteDraftInvoice);
router.post('/:id/issue', issueInvoiceHandler);
router.post('/:id/payments', recordInvoicePaymentHandler);
router.post('/:id/void', voidInvoiceHandler);
router.post('/:id/credit-notes', createCreditNote);
router.get('/:id/activity', getInvoiceActivity);
router.post('/:id/activity', logInvoiceActivity);

export default router;
