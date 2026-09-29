import { Router } from 'express';
import {
  inspectUploadedTemplate,
  listReportTemplates,
  getReportTemplate,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  previewReportTemplate,
  generateReportTemplate,
} from '../controllers/reportTemplateController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireModuleEnabled } from '../middlewares/rbac';
import { uploadSpreadsheet } from '../middlewares/uploadSpreadsheet';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));
router.use(requireModuleEnabled('company-reports'));

// Upload → inspection JSON + suggested mapping. Does not persist.
router.post('/inspect', uploadSpreadsheet.single('file'), inspectUploadedTemplate);

router.get('/', listReportTemplates);
router.get('/:id', getReportTemplate);
router.post('/', uploadSpreadsheet.single('file'), createReportTemplate);
router.patch('/:id', uploadSpreadsheet.single('file'), updateReportTemplate);
router.delete('/:id', deleteReportTemplate);

// Body: { invoiceId } for an invoice's trips, or { startDate, endDate } for the
// format's customer over a date range.
router.post('/:id/preview', previewReportTemplate);
router.post('/:id/generate', generateReportTemplate);

export default router;
