import { Router } from 'express';
import { getProfile } from '../controllers/mobileProfileController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { touchDriverDevice } from '../controllers/mobilePhoneController';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));
router.use(touchDriverDevice);

router.get('/', getProfile);

export default router;
