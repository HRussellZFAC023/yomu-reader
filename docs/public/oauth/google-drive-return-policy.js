const TRUSTED_HTTPS_ROUTES = new Map([
  ['https://yomureader.com', '/study/'],
  ['https://hrussellzfac023.github.io', '/yomu-reader/study/'],
]);
const AUTHORIZATION_STATE_PATTERN = /^[0-9a-f]{48}$/;

/** The production broker may return credentials only to canonical HTTPS Study settings. */
export function isTrustedYomuSettingsReturnUrl(value) {
  const url = parsedUrl(value);
  if (!url) return false;
  return isCredentialFreeSettingsUrl(url, value)
    && TRUSTED_HTTPS_ROUTES.get(url.origin) === url.pathname;
}

/** Revalidates persisted broker state so pre-upgrade or tampered transactions cannot receive tokens. */
export function isTrustedYomuOAuthTransaction(value, returnedState, expectedClientId) {
  if (!isPlainTransactionRecord(value)) return false;
  return [
    Object.keys(value).sort().join(',') === 'clientId,returnUrl,state',
    AUTHORIZATION_STATE_PATTERN.test(returnedState),
    value.state === returnedState,
    value.clientId === expectedClientId,
    isTrustedYomuSettingsReturnUrl(value.returnUrl),
  ].every(Boolean);
}

function parsedUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isCredentialFreeSettingsUrl(url, originalValue) {
  return [
    !url.username,
    !url.password,
    !String(originalValue).split('#', 1)[0].includes('?'),
    !url.hash || url.hash === '#settings=backup',
  ].every(Boolean);
}

function isPlainTransactionRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
