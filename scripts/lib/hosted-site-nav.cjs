// Stamps the site navigation into the standalone hosted shells.
//
// docs/public/pdf-reader/index.html and docs/public/video-player/index.html are
// static documents served outside the VitePress theme, so no theme code can
// reach them and they used to carry their own copy of the nav. That copy had
// drifted: it pointed Study and Stats at the old /newtab/ route, called Help
// 'Support', and had never heard of Get started, Guides, Tools, API, FAQ,
// Privacy or Membership.
//
// Both pages now hold a marked block that this file rewrites from
// src/reader/app/site-nav.ts, the same list the docs nav and the Study shell
// read. Same shape as scripts/lib/hosted-appearance-boot.cjs: esbuild is the
// only way a .cjs build step can read a TypeScript module, and it is already
// how the pre-paint accent snippet gets here.
const { join } = require('node:path');
const { buildSync } = require('esbuild');

const ROOT = join(__dirname, '..', '..');
const ENTRY_POINT = join(ROOT, 'src', 'reader', 'app', 'site-nav.ts');
const START_MARKER = '<!-- yomu:site-nav:start -->';
const END_MARKER = '<!-- yomu:site-nav:end -->';
// The shells sit one directory below the site root and must resolve there under
// a local docs preview as well as on yomureader.com, so their links stay
// relative. The Study app passes the absolute docs origin instead.
const SHELL_BASE = '../';
const INDENT = ' '.repeat(12);

let markup;

/** @returns {string} the nav as `<a>` elements, one per line, indented for the shells. */
function hostedSiteNavMarkup() {
  if (markup) return markup;
  const result = buildSync({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: ['es2020'],
    write: false,
    legalComments: 'none',
  });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  const rendered = module.exports.hostedShellNavMarkup(SHELL_BASE, INDENT);
  if (!rendered.includes('data-site-nav-item')) throw new Error('Site nav markup produced no entries');
  markup = rendered;
  return markup;
}

/**
 * Replaces the marked block in an HTML document with the current nav.
 * @param {string} html
 * @returns {string | undefined} the rewritten document, or undefined if unmarked
 */
function stampSiteNav(html) {
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${html.slice(0, start)}${START_MARKER}\n${hostedSiteNavMarkup()}\n${INDENT}${html.slice(end)}`;
}

module.exports = { hostedSiteNavMarkup, stampSiteNav };
