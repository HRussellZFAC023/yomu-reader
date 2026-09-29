const { buildSync } = require('esbuild');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

function buildHostedAppearanceSettings(root) {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [join(root, 'src/reader/settings/hosted-appearance-settings.ts')],
    bundle: true, write: false, format: 'esm', target: 'es2022', minify: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
  });
  const source = result.outputFiles[0].text;
  return { source, revision: createHash('sha256').update(source).digest('hex').slice(0, 12) };
}

module.exports = { buildHostedAppearanceSettings };
