// Child process: must exit non-zero (throws before import hoisting issues)
process.env.NODE_ENV = 'production';
delete process.env.JWT_SECRET;
const { getJwtSecret } = await import('../utils/jwtConfig.js');
getJwtSecret();
