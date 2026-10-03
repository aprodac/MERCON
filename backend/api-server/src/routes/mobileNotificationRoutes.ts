import { Router } from 'express';
import { getMobileNotifications, markMobileNotificationRead } from '../controllers/mobileNotificationController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { markNotificationOpened, touchDriverDevice } from '../controllers/mobilePhoneController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));
router.use(touchDriverDevice);

router.get('/', getMobileNotifications);
router.post('/:id/read', markMobileNotificationRead);
router.post('/:id/opened', markNotificationOpened);

export default router;
