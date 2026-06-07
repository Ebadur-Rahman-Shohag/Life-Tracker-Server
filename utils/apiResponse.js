/**
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {string} [clientMessage]
 */
export function sendServerError(res, err, clientMessage = 'Server error') {
  const isDev = process.env.NODE_ENV !== 'production';
  // eslint-disable-next-line no-console
  console.error(err);
  if (isDev) {
    return res.status(500).json({ message: clientMessage, error: err instanceof Error ? err.message : String(err) });
  }
  return res.status(500).json({ message: clientMessage });
}
