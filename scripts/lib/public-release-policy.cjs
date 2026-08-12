const GREASY_FORK_SCRIPT_ID = 581653;
const GREASY_FORK_SCRIPT_SLUG = encodeURIComponent('よむ');
const GREASY_FORK_UPDATE_BASE = `https://update.greasyfork.org/scripts/${GREASY_FORK_SCRIPT_ID}/${GREASY_FORK_SCRIPT_SLUG}`;
const USERSCRIPT_DISTRIBUTION_METADATA = Object.freeze({
  downloadURL: `${GREASY_FORK_UPDATE_BASE}.user.js`,
  updateURL: `${GREASY_FORK_UPDATE_BASE}.meta.js`,
});

function liveStudyRouteUrl(origin, route) {
  const base = `${String(origin).replace(/\/+$/, '')}/`;
  return new URL(route, base).href;
}

function liveStudyAliasUrl(origin, smokeId) {
  const url = new URL(liveStudyRouteUrl(origin, 'newtab/'));
  url.searchParams.set('yomu-smoke', String(smokeId));
  return url.href;
}

function liveStudyUrl(origin) {
  return liveStudyRouteUrl(origin, 'study/');
}

function liveHostedAnkiBridgeUrl(origin, smokeId) {
  const url = new URL(liveStudyUrl(origin));
  url.searchParams.set('yomu-anki-bridge-smoke', String(smokeId));
  return url.href;
}

function isLiveStudyAppUrl(value) {
  try {
    return new URL(value).pathname.endsWith('/study/app.js');
  } catch {
    return false;
  }
}

function isApprovedDistributionMetadata(values, expected) {
  return values.length === 0 || (values.length === 1 && values[0] === expected);
}

function distributionMetadataViolation(code, metadataValues, [key, expected]) {
  const values = metadataValues(code, key);
  return isApprovedDistributionMetadata(values, expected) ? [] : [{ key, expected, values }];
}

function userscriptDistributionMetadataViolations(code, metadataValues) {
  return Object.entries(USERSCRIPT_DISTRIBUTION_METADATA)
    .flatMap(entry => distributionMetadataViolation(code, metadataValues, entry));
}

module.exports = {
  GREASY_FORK_UPDATE_BASE,
  USERSCRIPT_DISTRIBUTION_METADATA,
  isLiveStudyAppUrl,
  liveHostedAnkiBridgeUrl,
  liveStudyAliasUrl,
  liveStudyUrl,
  userscriptDistributionMetadataViolations,
};
