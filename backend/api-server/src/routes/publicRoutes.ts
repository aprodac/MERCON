import { Router } from 'express';
import { getPublicTripEvidence } from '../controllers/publicController';
import { getPublicShare } from '../controllers/operatorInboxController';
import { getPublicTracking } from '../controllers/trackingController';
import { createPublicTrackingRateLimit } from '../middlewares/rateLimit';

const router = Router();

// Unauthenticated public route for WhatsApp evidence sharing & client verification
router.get('/evidence-gallery', getPublicTripEvidence);
// A forwarded driver update: only the photos chosen for that forward, until the link expires.
router.get('/shares/:token', getPublicShare);
// The customer tracking page: live truck position, ETA and stops for one trip.
router.get('/track/:token', createPublicTrackingRateLimit(), getPublicTracking);

export default router;
