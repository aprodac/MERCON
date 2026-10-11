import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { authorizeRoles } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import {
  getTrackingLinkDetail, getTrackingLinks, linkParams, listLinksQuery, patchTrackingLink, replaceTrackingLinkHandler,
  revokeTrackingLinkHandler, updateLinkBody,
} from '../controllers/trackingLinksController';

// Links page (operator app): customer tracking links — trip (/t/) and customer-wide (/c/).
const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles('Admin', 'Operator'));

router.get('/', validate({ query: listLinksQuery }), getTrackingLinks);
router.get('/:kind/:id', validate({ params: linkParams }), getTrackingLinkDetail);
router.patch('/:kind/:id', validate({ params: linkParams, body: updateLinkBody }), patchTrackingLink);
router.post('/:kind/:id/revoke', validate({ params: linkParams }), revokeTrackingLinkHandler);
router.post('/:kind/:id/replace', validate({ params: linkParams }), replaceTrackingLinkHandler);

export default router;
