import { Router } from 'express';
import {
  getJournalEntries,
  getJournalEntryById,
  getJournalEntryActivity,
  createDraftJournalEntry,
  updateDraftJournalEntry,
  deleteDraftJournalEntry,
  postJournalEntryHandler,
  voidJournalEntryHandler,
} from '../controllers/journalEntryController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('finance'));

router.get('/', getJournalEntries);
router.post('/', createDraftJournalEntry);
router.get('/:id/activity', getJournalEntryActivity);
router.get('/:id', getJournalEntryById);
router.patch('/:id', updateDraftJournalEntry);
router.delete('/:id', deleteDraftJournalEntry);
router.post('/:id/post', postJournalEntryHandler);
router.post('/:id/void', voidJournalEntryHandler);

export default router;
