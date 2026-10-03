import { NextFunction, Request, Response } from 'express';
import { storeInlineImage } from '../services/inlineImage';

/** Replaces base64 images in the given body fields with `/uploads/...` links before the handler saves them. */
export const storeInlineImages = (...fields: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const field of fields) {
        if (req.body && field in req.body) {
          req.body[field] = await storeInlineImage(req.body[field]);
        }
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not save the image' } });
    }
  };
