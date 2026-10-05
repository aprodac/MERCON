import { Router } from 'express';
import { mobileLogin } from '../controllers/mobileAuthController';
import { createLoginAccountLimit, createLoginIpLimit } from '../middlewares/rateLimit';

const router = Router();

router.post('/login', createLoginIpLimit(), createLoginAccountLimit('phone_primary'), mobileLogin);

export default router;
