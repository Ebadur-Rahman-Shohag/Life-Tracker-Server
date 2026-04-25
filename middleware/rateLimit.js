import rateLimit from 'express-rate-limit';

/** Lighter cap for all /api traffic */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many requests' },
});

/** Stricter cap for /api/auth (login/register) */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts' },
});
