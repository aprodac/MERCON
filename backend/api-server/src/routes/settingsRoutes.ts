import { Router } from 'express';
import { getPublicSettings, getSettings, updateSettings, updateTimezone, updateSupportWhatsapp, getSystemHealth, getAuditLogs } from '../controllers/settingsController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles, requireSuperAdmin } from '../middlewares/rbac';
import { updateDriverAppMinVersion } from '../controllers/driverPhoneController';

const router = Router();

// Unauthenticated: the login page needs branding before anyone is signed in.
router.get('/public', getPublicSettings);

router.use(authenticateJWT);
router.get('/', getSettings);

// Superadmin diagnostics & audit logs
router.get('/health', requireSuperAdmin, getSystemHealth);
router.get('/audit-logs', requireSuperAdmin, getAuditLogs);

// Timezone is operational config the client's own Admin owns
router.put('/timezone', authorizeRoles('Admin'), updateTimezone);
router.put('/support-whatsapp', authorizeRoles('Admin'), updateSupportWhatsapp);
router.put('/driver-app-version', authorizeRoles('Admin'), updateDriverAppMinVersion);

router.put('/', requireSuperAdmin, updateSettings);

export default router;
