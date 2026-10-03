import { Router } from 'express';
import { getPublicSettings, getSettings, updateSettings, updateTimezone, updateSupportWhatsapp, getSystemHealth, getAuditLogs, updateAssistantConfig } from '../controllers/settingsController';
import { validate } from '../middlewares/validate';
import { assistantConfigBody } from '../schemas';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireSuperAdmin } from '../middlewares/rbac';
import { updateDriverAppMinVersion } from '../controllers/driverPhoneController';
import { getDataCleanupPreview, runDataCleanup } from '../controllers/dataCleanupController';

const router = Router();

// Unauthenticated: the login page needs branding before anyone is signed in.
router.get('/public', getPublicSettings);

router.use(authenticateJWT);
router.get('/', getSettings);

// Superadmin diagnostics & audit logs
router.get('/health', requireSuperAdmin, getSystemHealth);
router.get('/audit-logs', requireSuperAdmin, getAuditLogs);
// Clear test / demo data from a dev deployment (refused on non-dev databases)
router.get('/data-cleanup', requireSuperAdmin, getDataCleanupPreview);
router.post('/data-cleanup', requireSuperAdmin, runDataCleanup);

// Timezone is operational config the client's own Admin owns
router.put('/timezone', authorizeRoles('Admin'), updateTimezone);
router.put('/support-whatsapp', authorizeRoles('Admin'), updateSupportWhatsapp);
router.put('/assistant', authorizeRoles('Admin'), validate({ body: assistantConfigBody }), updateAssistantConfig);
router.put('/driver-app-version', authorizeRoles('Admin'), updateDriverAppMinVersion);

router.put('/', requireSuperAdmin, updateSettings);

export default router;
