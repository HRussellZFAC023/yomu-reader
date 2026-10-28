const { execFileSync } = require('node:child_process');
const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const {
  greasyForkLibraryPath,
  userscriptRequireLibraries,
} = require('./greasyfork-libraries.cjs');

const BUDGET_RELATIVE_PATH = 'config/ci/userscript-weight.json';

function userscriptWeightReport(root) {
  const userscriptPath = join(root, 'dist', 'yomu.user.js');
  const code = readFileSync(userscriptPath, 'utf8');
  const files = [{ relativePath: 'dist/yomu.user.js', bytes: statSync(userscriptPath).size }];
  for (const requireUrl of metadataValues(code, 'require')) {
    const library = userscriptLibraryForUrl(requireUrl);
    if (!library) {
      throw new Error(`Cannot measure unconditional @require: ${requireUrl}`);
    }
    const relativePath = `dist/${greasyForkLibraryPath(library.fileName)}`;
    files.push({ relativePath, bytes: statSync(join(root, relativePath)).size });
  }
  const budget = JSON.parse(readFileSync(join(root, BUDGET_RELATIVE_PATH), 'utf8'));
  return {
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    maxInjectedBytes: budget.maxInjectedBytes,
    previousMaxInjectedBytes: previousBudgetCeiling(root),
  };
}

function userscriptLibraryForUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== 'https://yomureader.com') return null;
  const fileName = url.pathname.split('/').at(-1);
  return userscriptRequireLibraries().find(library => {
    const baseName = library.fileName.replace(/\.user\.js$/, '');
    return fileName === library.fileName
      || new RegExp(`^${escapeRegExp(baseName)}\\.[0-9a-f]{12}\\.user\\.js$`).test(fileName);
  }) ?? null;
}

function previousBudgetCeiling(root) {
  const ceilings = [];
  for (const ref of ['HEAD', 'HEAD^']) {
    try {
      const value = execFileSync('git', ['show', `${ref}:${BUDGET_RELATIVE_PATH}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const parsed = JSON.parse(value);
      if (Number.isSafeInteger(parsed.maxInjectedBytes)) ceilings.push(parsed.maxInjectedBytes);
    } catch {
      // The first commit introducing the ratchet has no historical ceiling.
    }
  }
  return ceilings.length > 0 ? Math.min(...ceilings) : null;
}

function metadataValues(code, key) {
  const pattern = new RegExp(`^// @${escapeRegExp(key)}\\s+(.+)$`, 'gm');
  return Array.from(code.matchAll(pattern), match => match[1].trim());
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

module.exports = {
  BUDGET_RELATIVE_PATH,
  userscriptWeightReport,
};
