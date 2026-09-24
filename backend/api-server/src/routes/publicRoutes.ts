import { Router } from 'express';
import { getPublicTripEvidence } from '../controllers/publicController';

const router = Router();

// Unauthenticated public route for WhatsApp evidence sharing & client verification
router.get('/evidence-gallery', getPublicTripEvidence);

export default router;
