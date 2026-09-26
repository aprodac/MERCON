import { Router } from 'express';
import { raiseEmergency, getEmergencyContact } from '../controllers/mobileEmergencyController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Driver'));

router.post('/', upload.array('photos', 4), raiseEmergency);
// Operator phone for the driver's "Call operator" button.
router.get('/contact', getEmergencyContact);

export default router;
