import { Router } from 'express';
import { getErrorEvents, getErrorEventById, updateErrorEventStatus } from '../controllers/errorEventController';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { updateErrorEventBody } from '../schemas';

const router = Router();

router.use(authenticateJWT, authorizeRoles('Admin'));

router.get('/', getErrorEvents);
router.get('/:id', getErrorEventById);
router.patch('/:id', validate({ body: updateErrorEventBody }), updateErrorEventStatus);

export default router;
