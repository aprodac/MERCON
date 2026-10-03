import { Router } from 'express';
import { registerDeviceToken, unregisterDeviceToken } from '../controllers/mobileNotificationController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { logoutDevice } from '../controllers/mobilePhoneController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));

router.post('/', registerDeviceToken);
router.post('/logout', logoutDevice);
router.delete('/:token', unregisterDeviceToken);

export default router;
