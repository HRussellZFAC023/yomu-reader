const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../../package.json');
const { greasyForkLibraryUrls } = require('./greasyfork-libraries.cjs');

const ROOT = path.join(__dirname, '..', '..');
const USERSCRIPT_RELATIVE_PATH = 'dist/yomu.user.js';
const READER_CSS_RELATIVE_PATH = 'dist/yomu.css';
const DIST_USERSCRIPT_PATH = path.join(ROOT, USERSCRIPT_RELATIVE_PATH);
const DIST_READER_CSS_PATH = path.join(ROOT, READER_CSS_RELATIVE_PATH);
const DOCS_USERSCRIPT_PATH = path.join(ROOT, 'docs', 'public', 'yomu.user.js');
const USERSCRIPT_METADATA_END = '// ==/UserScript==';
const BUNDLED_DEPENDENCY_NOTICE_MARKER = 'Bundled dependency';
const GREASY_FORK_SIZE_LIMIT_BYTES = 2_000_000;
const GREASY_FORK_SIZE_WARNING_RATIO = 0.9;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, value) {
  fs.writeFileSync(file, value);
}

function fileExists(file) {
  return fs.existsSync(file);
}

function readBuiltUserscript() {
  return readText(DIST_USERSCRIPT_PATH);
}

function byteLengthUtf8(value) {
  return Buffer.byteLength(value, 'utf8');
}

function formatCount(value) {
  return value.toLocaleString();
}

function userscriptMetadataValues(code, key) {
  const pattern = new RegExp(`^// @${escapeRegExp(key)}\\s+(.+)$`, 'gm');
  return Array.from(code.matchAll(pattern), match => match[1].trim());
}

function allowedRequireUrls() {
  const packageAllowlist = pkg.yomu?.allowedRequireUrls;
  const envAllowlist = process.env.YOMU_ALLOWED_USERSCRIPT_REQUIRE_URLS;
  return [
    ...(Array.isArray(packageAllowlist) ? packageAllowlist : []),
    ...(envAllowlist ? envAllowlist.split(',') : []),
    ...greasyForkLibraryUrls(),
  ].map(url => String(url).trim()).filter(Boolean);
}

function isAllowedRequireUrl(url) {
  const bareUrl = urlWithoutHash(url);
  const allowed = allowedRequireUrls();
  return allowed.includes(url)
    || (hasTampermonkeySriHash(url) && (allowed.includes(bareUrl) || isImmutableFirstPartyLibraryUrl(bareUrl)));
}

// Content-addressed first-party companion publication URLs
// (…/greasyfork/<known-basename>.<12-hex-content-hash>.user.js). These are the
// immutable forms of the same first-party libraries; the byte-level integrity
// is enforced separately by the mandatory #sha256= fragment (checked above)
// and by verify-userscript's exact-URL assertion against dist content.
function isImmutableFirstPartyLibraryUrl(bareUrl) {
  const { GREASY_FORK_LIBRARIES, greasyForkLibraryDir } = require('./greasyfork-libraries.cjs');
  return GREASY_FORK_LIBRARIES.some(library => {
    const baseName = library.fileName.replace(/\.user\.js$/, '');
    const pattern = new RegExp(`^https://yomureader\\.com/${greasyForkLibraryDir}/${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[0-9a-f]{12}\\.user\\.js$`);
    return pattern.test(bareUrl);
  });
}

function assertNoRemoteExecutableMetadata(code) {
  const requireUrls = userscriptMetadataValues(code, 'require');
  const disallowedRequireUrls = requireUrls.filter(url => !isAllowedRequireUrl(url));
  if (disallowedRequireUrls.length) {
    fail(`userscript must not download unapproved remote executed code with @require; found: ${disallowedRequireUrls.join(', ')}. Add first-party Greasy Fork library URLs to package.json yomu.allowedRequireUrls only after review.`);
  }
}

function urlWithoutHash(url) {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function hasTampermonkeySriHash(url) {
  // Tampermonkey accepts SRI-style `sha256-<hash>`; Greasy Fork's checker
  // expects `sha256=<hash>`. Allow both separators.
  return /#sha(?:256|384|512)[-=][A-Za-z0-9+/=]+(?:[?#].*)?$/.test(url);
}

function assertNoRemoteExecutableLoaders(code) {
  const disallowed = [
    [/\bimport\s*\(/, 'dynamic import()'],
    [/\beval\s*\(/, 'eval()'],
    [/\bFunction\s*\(/, 'Function constructor'],
    [/createElement\(["']script["']\)[\s\S]{0,800}\.src\s*=/, 'script element src loader'],
  ];
  for (const [pattern, label] of disallowed) {
    if (pattern.test(code)) {
      fail(`userscript must not load or evaluate executable code at runtime; found ${label}.`);
    }
  }
}

function failIfGreasyForkSizeExceeded(size) {
  if (size > GREASY_FORK_SIZE_LIMIT_BYTES) {
    fail(`${USERSCRIPT_RELATIVE_PATH} is ${formatCount(size)} bytes, over Greasy Fork's 2 MB script limit (${formatCount(GREASY_FORK_SIZE_LIMIT_BYTES)} bytes). Run npm run size:greasyfork-plan to refresh the policy-safe companion-script extraction budget.`);
  }
}

function warnIfNearGreasyForkSizeLimit(size) {
  const remaining = GREASY_FORK_SIZE_LIMIT_BYTES - size;
  if (size > GREASY_FORK_SIZE_LIMIT_BYTES) {
    console.warn(`Warning: ${USERSCRIPT_RELATIVE_PATH} is ${formatCount(size)} bytes, over Greasy Fork's 2 MB script limit (${formatCount(GREASY_FORK_SIZE_LIMIT_BYTES)} bytes) by ${formatCount(Math.abs(remaining))} bytes. Greasy Fork publishing remains blocked by the publish script.`);
    return;
  }
  if (size > GREASY_FORK_SIZE_LIMIT_BYTES * GREASY_FORK_SIZE_WARNING_RATIO) {
    console.warn(`Warning: ${USERSCRIPT_RELATIVE_PATH} is ${formatCount(size)} bytes, above 90% of Greasy Fork's 2 MB script limit (${formatCount(remaining)} bytes remaining).`);
  }
}

function packageVersion() {
  return pkg.version || 'dev';
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

module.exports = {
  BUNDLED_DEPENDENCY_NOTICE_MARKER,
  DIST_READER_CSS_PATH,
  DIST_USERSCRIPT_PATH,
  DOCS_USERSCRIPT_PATH,
  GREASY_FORK_SIZE_LIMIT_BYTES,
  READER_CSS_RELATIVE_PATH,
  ROOT,
  USERSCRIPT_METADATA_END,
  USERSCRIPT_RELATIVE_PATH,
  assertNoRemoteExecutableLoaders,
  assertNoRemoteExecutableMetadata,
  byteLengthUtf8,
  fail,
  failIfGreasyForkSizeExceeded,
  fileExists,
  formatCount,
  packageJson: pkg,
  packageVersion,
  readBuiltUserscript,
  readText,
  userscriptMetadataValues,
  warnIfNearGreasyForkSizeLimit,
  writeText,
};
