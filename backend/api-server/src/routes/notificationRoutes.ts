import { Router } from 'express';
import {
  getNotifications,
  logoutUserDevice,
  markAsRead,
  registerUserDevice,
  sendBulkCommunication,
} from '../controllers/notificationController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);
router.post('/bulk-send', sendBulkCommunication);
// Operator app: push token for this phone (Admin/Operator only, per router.use above)
router.post('/devices', registerUserDevice);
router.post('/devices/logout', logoutUserDevice);

export default router;
