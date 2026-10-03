import { Router } from 'express';
import { getPublicTripEvidence } from '../controllers/publicController';
import { getPublicShare } from '../controllers/operatorInboxController';
import { getPublicFleetTracking, getPublicTracking, getTrackingPreviewTags, getTrackingPreviewCard } from '../controllers/trackingController';
import { createPublicTrackingRateLimit } from '../middlewares/rateLimit';

const router = Router();

// Unauthenticated public route for WhatsApp evidence sharing & client verification
router.get('/evidence-gallery', getPublicTripEvidence);
// A forwarded driver update: only the photos chosen for that forward, until the link expires.
router.get('/shares/:token', getPublicShare);
// The customer tracking page: live truck position, ETA and stops for one trip.
router.get('/track/:token', createPublicTrackingRateLimit(), getPublicTracking);
// The customer-wide tracking page: every truck of one customer on the road.
router.get('/fleet/:token', createPublicTrackingRateLimit(), getPublicFleetTracking);
// WhatsApp link-preview tags for /t/ and /c/ pages (read by the web container's nginx).
router.get('/og/:kind/:token', createPublicTrackingRateLimit(), getTrackingPreviewTags);
// The white preview card image those tags point at.
router.get('/og/:kind/:token/card.png', createPublicTrackingRateLimit(), getTrackingPreviewCard);

export default router;
