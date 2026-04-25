/** Fails at process load if production is misconfigured. */
export function assertProductionJwtConfig() {
  if (process.env.NODE_ENV === 'production' && !getJwtSecretFromEnv()) {
    throw new Error('JWT_SECRET is required when NODE_ENV is production');
  }
}

function getJwtSecretFromEnv() {
  const s = process.env.JWT_SECRET;
  return s != null && String(s).trim() !== '' ? String(s).trim() : null;
}

const DEV_PLACEHOLDER = 'dev-jwt-secret-not-for-production';

/**
 * @returns {string} signing secret; throws in production if missing
 */
export function getJwtSecret() {
  const fromEnv = getJwtSecretFromEnv();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return DEV_PLACEHOLDER;
}
