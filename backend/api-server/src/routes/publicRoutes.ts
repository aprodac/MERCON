import { Router } from 'express';
import { getPublicTripEvidence } from '../controllers/publicController';
import { getPublicShare } from '../controllers/operatorInboxController';

const router = Router();

// Unauthenticated public route for WhatsApp evidence sharing & client verification
router.get('/evidence-gallery', getPublicTripEvidence);
// A forwarded driver update: only the photos chosen for that forward, until the link expires.
router.get('/shares/:token', getPublicShare);

export default router;
