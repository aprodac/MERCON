/** POST /push-receipts/:id/:sig — see services/pushReceipts. No login; the signature is the permission. */
import { Router } from 'express';
import { checkPushReceiptSignature, recordPushReceived } from '../services/pushReceipts';
import { isUuid } from '../utils/uuid';
import { logger } from '../utils/logger';

const router = Router();

router.post('/:id/:sig', async (req, res) => {
  const { id, sig } = req.params;
  if (!isUuid(id) || !checkPushReceiptSignature(id, sig)) return res.status(403).end();
  try {
    await recordPushReceived(id);
    res.status(204).end();
  } catch (err) {
    logger.warn({ err, id }, 'push receipt failed');
    res.status(500).end();
  }
});

export default router;
