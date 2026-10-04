import { NextFunction, Request, Response } from 'express';
import {
  checkSignedLink,
  logLinkError,
  privateFileNames,
  stringifyWithSignedLinks,
  unsignInPlace,
  uploadNamesIn,
} from '../services/fileLinks';

const SIGNED_PATH = /^\/s\/(\d{9,12})\/([A-Za-z0-9_-]{16,64})\/([A-Za-z0-9._~%-]+)$/;
const PLAIN_PATH = /^\/([A-Za-z0-9._~%-]+)$/;

const REFUSED =
  'This document link is not valid or has expired. Open the document again from the MERCON app or dashboard.';

function refuse(res: Response) {
  res.status(403).type('text/plain').set('Cache-Control', 'no-store').send(REFUSED);
}

function decodeName(raw: string): string | null {
  try {
    const name = decodeURIComponent(raw);
    return /^[A-Za-z0-9._~ -]+$/.test(name) && !name.includes('..') ? name : null;
  } catch {
    return null;
  }
}

/**
 * Mounted on /uploads before express.static. A signed link (/s/<exp>/<sig>/<file>)
 * is checked and rewritten to the plain path for the static handler; a plain
 * link to a private document is refused. Fails closed when the private-file
 * lookup errors.
 */
export async function uploadsGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const signed = SIGNED_PATH.exec(req.path);
  if (signed) {
    const [, exp, sig, rawName] = signed;
    const name = decodeName(rawName);
    if (!name || checkSignedLink(exp, sig, name) !== 'ok') return refuse(res);
    req.url = `/${rawName}`;
    // A signed link is per file and per hour: browsers may cache it privately.
    res.set('Cache-Control', 'private, max-age=3600');
    return next();
  }

  const plain = PLAIN_PATH.exec(req.path);
  if (!plain) return next();
  const name = decodeName(plain[1]);
  if (!name) return next();
  try {
    const priv = await privateFileNames([name]);
    if (priv.has(name)) return refuse(res);
    return next();
  } catch (err) {
    logLinkError(err, 'private-file lookup failed; refusing plain link');
    return refuse(res);
  }
}

/**
 * Mounted on the API router.
 * - Requests: signed upload links in a JSON body are put back to "/uploads/<file>",
 *   so an edited record never saves a link that expires.
 * - Responses to signed-in users: links to private documents are signed.
 *   Public routes (no req.user, e.g. the customer tracking pages) are untouched.
 */
export function apiFileLinks(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') unsignInPlace(req.body);

  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!(req as any).user || body === null || typeof body !== 'object') return sendJson(body);
    const names = uploadNamesIn(body);
    if (names.size === 0) return sendJson(body);

    privateFileNames([...names])
      .then((priv) => {
        if (priv.size === 0) return sendJson(body);
        if (!res.get('Content-Type')) res.type('json');
        return res.send(stringifyWithSignedLinks(body, priv));
      })
      .catch((err) => {
        // Can't tell which are private: sign them all so the user can still open them.
        logLinkError(err, 'private-file lookup failed; signing every upload link');
        if (!res.get('Content-Type')) res.type('json');
        res.send(stringifyWithSignedLinks(body, names));
      });
    return res;
  }) as Response['json'];

  next();
}
