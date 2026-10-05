import rateLimit from 'express-rate-limit';

/**
 * Throttles unauthenticated, credential-guessable endpoints: login (web +
 * mobile) and password-reset requests. Without this, both are brute-forceable
 * (mobile login in particular compares a driver's license number in plaintext
 * with no per-account lockout) and password-reset can be hit repeatedly to
 * spam every Admin/Operator with notifications.
 *
 * Each call returns a fresh limiter instance — reusing one instance across
 * routes shares its counter (keyed by IP by default) between them, so
 * exhausting one endpoint's budget would also lock out an unrelated one on
 * the same IP.
 */
export const createAuthRateLimit = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'development' ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
});

const dev = process.env.NODE_ENV === 'development';

/**
 * Login guessing, from one address: 20 failed tries in 15 minutes, then a pause.
 * Only failures count, so an office full of people signing in on one network
 * never trips it. (Per address since `trust proxy` — before that every visitor
 * looked like nginx and one guesser could lock the whole company out.)
 */
export const createLoginIpLimit = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: dev ? 1000 : 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
});

/**
 * Login guessing against one account, from anywhere: 10 failed tries in 15
 * minutes locks that username / phone for the rest of the window. `field` is
 * the body field holding it (`username` on the web, `phone_primary` on mobile).
 * Requests without it fall through to the validator untouched.
 */
export const createLoginAccountLimit = (field: string) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: dev ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !String(req.body?.[field] ?? '').trim(),
  keyGenerator: (req) => `acct:${String(req.body?.[field] ?? '').trim().toLowerCase().replace(/[\s-]/g, '')}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts on this account. Please try again later.' } },
});

/**
 * The public tracking page polls about twice a minute per open tab. This only
 * caps abuse (someone hammering tokens or the routing behind them), per
 * visitor address — an office of viewers shares one, so it stays generous.
 */
export const createPublicTrackingRateLimit = () => rateLimit({
  windowMs: 60 * 1000,
  limit: dev ? 1000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } },
});
