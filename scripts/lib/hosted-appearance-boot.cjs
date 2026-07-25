// Bundles src/reader/core/hosted-appearance-boot.ts into an inline <head>
// snippet. Every hosted surface stamps the output of this one builder, so the
// pre-paint accent can never drift from the accent the runtime re-applies.
const { join } = require('node:path');
const { buildSync } = require('esbuild');

const ROOT = join(__dirname, '..', '..');
const ENTRY_POINT = join(ROOT, 'src', 'reader', 'core', 'hosted-appearance-boot.ts');
const START_MARKER = '/* yomu:appearance-boot:start */';
const END_MARKER = '/* yomu:appearance-boot:end */';

const snippets = new Map();

/**
 * @param {'docs' | 'surface'} mode
 * @returns {string} minified IIFE, safe to inline inside a <script> element.
 */
function hostedAppearanceBootSnippet(mode) {
  const cached = snippets.get(mode);
  if (cached) return cached;
  const result = buildSync({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2020'],
    write: false,
    legalComments: 'none',
    define: { __YOMU_APPEARANCE_MODE__: JSON.stringify(mode) },
  });
  const code = result.outputFiles[0].text.trim();
  // Inline scripts end at the first `</script>`; the bundle has no business
  // containing one, but never let a future edit break every hosted page.
  if (code.includes('</script')) throw new Error('Appearance boot snippet must not contain a script end tag');
  snippets.set(mode, code);
  return code;
}

/**
 * Replaces the marked block in an HTML document with the current snippet.
 * @param {string} html
 * @param {'docs' | 'surface'} mode
 */
function stampAppearanceBoot(html, mode) {
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${html.slice(0, start)}${START_MARKER}${hostedAppearanceBootSnippet(mode)}${html.slice(end)}`;
}

module.exports = { END_MARKER, START_MARKER, hostedAppearanceBootSnippet, stampAppearanceBoot };
