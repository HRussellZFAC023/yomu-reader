#!/usr/bin/env node
// Builds the GitHub release body for `vX.Y.Z`: the version's CHANGELOG.md
// section followed by install pointers. The Release workflow runs this as
// `node scripts/release-notes.mjs X.Y.Z` and publishes `release-notes.md`.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const FIREFOX_ADD_ONS_URL = 'https://addons.mozilla.org/firefox/addon/yomu-reader/';

/** The release body for `version`, taken from the full CHANGELOG.md text. */
export function buildReleaseNotes(changelog, version) {
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = changelog.match(new RegExp(`## \\[${escaped}\\][\\s\\S]*?(?=\\n## \\[|$)`));
    return (match?.[0] ?? `## ${version}\n\nSee CHANGELOG.md for details.`)
        + '\n\nInstall/update userscript: https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js\n'
        + '\nYomu Gaming desktop apps (Linux x64 AppImage, Windows portable, macOS zips) are attached by the Release Yomu Gaming workflow and may appear shortly after this release is published.\n'
        + '\n**Linux:** a downloaded AppImage is not yet allowed to run. Mark it executable first (file properties, or `chmod +x yomu-gaming-*.AppImage`); `--appimage-extract-and-run` starts it on a system without FUSE.\n'
        + '\nRelease assets include the compiled userscript, Chrome extension ZIP, Firefox XPI, its reviewer source bundle, Safari Web Extension ZIP, the full compiler project bundle, a submission guide with review/audit notes, and (from the desktop build workflow) the Yomu Gaming desktop packages plus checksums.\n'
        + `\n**Firefox users:** install from [Firefox Add-ons](${FIREFOX_ADD_ONS_URL}). The Firefox XPI below is unsigned, so Firefox reports it as unverified; it is only for developers and store reviewers.\n`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const version = process.argv[2];
    if (!version) throw new Error('Usage: node scripts/release-notes.mjs <version>');
    writeFileSync('release-notes.md', buildReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version));
}
