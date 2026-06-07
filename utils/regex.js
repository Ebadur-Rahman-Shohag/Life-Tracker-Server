/** Escape a string for safe use as a literal inside a MongoDB $regex. */
export function escapeRegexString(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
