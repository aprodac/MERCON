/**
 * GET /media/s/<exp>/<sig>/<kind>-<id>-<hash> — a truck photo, driver photo or
 * customer logo stored inline, sent as an image (see services/inlineImages).
 * No login, like /uploads: the signature is the permission. Phones and
 * browsers may cache it for the link's hour.
 */
import { Router } from 'express';
import { loadInlineImage } from '../services/inlineImages';
import { logger } from '../utils/logger';

const router = Router();

router.get('/s/:exp/:sig/:name', async (req, res) => {
  try {
    const r = await loadInlineImage(req.params.exp, req.params.sig, req.params.name);
    if (r.status !== 'ok') {
      res.set('Cache-Control', 'no-store');
      return res.status(r.status === 'not_found' ? 404 : 403).end();
    }
    // Overrides the API router's no-store: the picture behind a link never changes.
    res.set('Cache-Control', 'private, max-age=3600, immutable');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.type(r.contentType).send(r.body);
  } catch (err) {
    logger.warn({ err }, 'inline image failed');
    res.status(500).end();
  }
});

export default router;
