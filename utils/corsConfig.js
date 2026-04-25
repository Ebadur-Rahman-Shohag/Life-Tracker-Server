const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://life-tracker-frontend-seven.vercel.app',
];

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getAllowlist() {
  const fromEnv = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
}

const credentialsAndHeaders = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
};

/**
 * @returns {import('cors').CorsOptions}
 */
export function buildCorsOptions() {
  const allowlist = getAllowlist();
  let previewRe = null;
  if (process.env.CORS_VERCEL_PREVIEW_REGEX) {
    try {
      previewRe = new RegExp(process.env.CORS_VERCEL_PREVIEW_REGEX);
    } catch {
      previewRe = null;
    }
  }
  return {
    ...credentialsAndHeaders,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowlist.includes(origin)) {
        return callback(null, true);
      }
      if (!isProduction()) {
        return callback(null, true);
      }
      if (previewRe && previewRe.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  };
}
