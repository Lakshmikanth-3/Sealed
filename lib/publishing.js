// Validate all cost-affecting publishing options before any inference request.
export function publishingOptions(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Publishing request must be an object');
  const ttlSeconds = body.ttlSeconds ?? 86400;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 604800) throw new Error('Share lifetime must be between 5 minutes and 7 days');
  if (body.aiConsent !== undefined && typeof body.aiConsent !== 'boolean') throw new Error('AI consent must be an explicit boolean');
  return { ttlSeconds, aiConsent: body.aiConsent === true };
}
