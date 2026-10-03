import { Router } from 'express';
import { resolveMapsLink, resolveLocationText, searchAddress, reverseGeocode } from '../controllers/geocodingController';
import { authenticateJWT } from '../middlewares/auth';

const router = Router();

router.use(authenticateJWT);

router.get('/resolve-maps-link', resolveMapsLink);
router.get('/resolve-location', resolveLocationText);
router.get('/search', searchAddress);
router.get('/reverse', reverseGeocode);

export default router;
