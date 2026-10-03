import { Router } from 'express';
import {
  getDocuments, getDocumentById, uploadDocument, updateDocumentStatus, deleteDocument,
  bulkDeleteDocuments, bulkUpdateDocumentStatus, bulkDownloadDocuments, bulkMoveDocumentsToFolder,
  getOwnerFolder, getOwnerFolders, addDocumentFile, deleteDocumentFile
} from '../controllers/documentController';
import { importLocalTrucksDocs, importUploadedTrucksDocsFolder, uploadRawFileChunk } from '../controllers/batchImportController';
import { extractAllDocumentsOcr, extractSingleDocumentOcr, syncLocalDocumentRecords, autoAssignUnlinkedDocs, previewAutoAssignUnlinkedDocs, confirmAutoAssignDocs } from '../controllers/bulkOcrController';
import { createImport, appendImportFiles, getImport, updateImportItem, confirmImport, listImports, discardImport, triggerImportAnalysis } from '../controllers/documentImportController';
import { getTrashedDocuments, restoreDocuments, purgeDocuments, updateDocument, getDocumentVersions, getDocumentActivity } from '../controllers/documentLibraryController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'SuperAdmin', 'Operator'));
router.use(requireModuleEnabled('documents'));
router.get('/preview-auto-assign', previewAutoAssignUnlinkedDocs);
router.post('/confirm-auto-assign', confirmAutoAssignDocs);
router.post('/auto-assign-unlinked', autoAssignUnlinkedDocs);
router.post('/batch-truck-docs-local', importLocalTrucksDocs);
router.post('/batch-upload-folder', upload.array('files', 500), importUploadedTrucksDocsFolder);
router.post('/upload-raw-chunk', uploadRawFileChunk);
router.post('/bulk-ocr-extract', extractAllDocumentsOcr);
router.post('/sync-local-records', syncLocalDocumentRecords);
router.post('/:id/ocr-extract', extractSingleDocumentOcr);
router.post('/bulk-delete', bulkDeleteDocuments);
router.post('/bulk-update-status', bulkUpdateDocumentStatus);
router.post('/bulk-download', bulkDownloadDocuments);
router.post('/bulk-move', bulkMoveDocumentsToFolder);

// Staged import pipeline — files are analysed and confirmed here before any
// Document row exists. Registered before '/:id' so 'imports' isn't captured
// as an id param.
router.post('/imports', upload.array('files', 200), createImport);
router.post('/imports/:id/files', upload.array('files', 200), appendImportFiles);
router.get('/imports', listImports);
router.get('/imports/:id', getImport);
router.post('/imports/:id/analyze', triggerImportAnalysis);
router.patch('/imports/:id/items/:itemId', updateImportItem);
router.post('/imports/:id/confirm', confirmImport);
router.delete('/imports/:id', discardImport);

// Owner-first document checklist for one Driver/Vehicle/etc — must be
// registered before '/:id' so 'owner-folder' isn't captured as an id param.
router.get('/owner-folder', getOwnerFolder);
router.get('/owner-folders', getOwnerFolders);

// Recently deleted — restorable for 30 days, then purged (services/documentTrash.ts)
router.get('/trash', getTrashedDocuments);
router.post('/restore', restoreDocuments);
router.post('/purge', purgeDocuments);

// List all documents (filterable by entity_type, entity_id, doc_type, status, expiring_within_days)
router.get('/', getDocuments);

// Get a single document
router.get('/:id', getDocumentById);
router.get('/:id/versions', getDocumentVersions);
router.get('/:id/activity', getDocumentActivity);

// Edit details (type, number, dates, confidentiality, folder)
router.patch('/:id', updateDocument);

// Upload a new document — 'file' (single) or 'files' (several pages of one document)
router.post('/', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 50 }]), uploadDocument);

// Update document status (Verified, Rejected, PendingReview, Expired)
router.patch('/:id/status', updateDocumentStatus);

// Append/remove a file on a multi-file-capable document
router.post('/:id/files', upload.single('file'), addDocumentFile);
router.delete('/:id/files/:fileId', deleteDocumentFile);

// Soft delete → Recently deleted
router.delete('/:id', deleteDocument);

export default router;
