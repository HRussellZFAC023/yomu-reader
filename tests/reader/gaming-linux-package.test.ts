import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { buildReleaseNotes } from '../../scripts/release-notes.mjs';
import {
    GAMING_LINUX_EXECUTABLE_NAME,
    gamingBuilderConfig,
    gamingPackageManifest,
} from '../../scripts/lib/gaming-package-config.mjs';

const config = gamingBuilderConfig({
    electronVersion: '38.8.6',
    iconPng: 'dist-gaming/yomu-icon-512.png',
    iconIcns: 'dist-gaming/yomu-icon.icns',
    appDir: 'dist-gaming/package-source',
    outputDir: 'dist-gaming/packages',
});

describe('Yomu Gaming Linux package', () => {
    // "AppImage refuses to open": electron-builder's default AppImage runtime loads
    // libfuse.so.2, which current Ubuntu, Fedora and Mint installs do not ship.
    it('builds the AppImage on the static runtime, which needs no libfuse2', () => {
        expect(config.toolsets.appimage).not.toBe('0.0.0');
        expect(config.toolsets.appimage).toMatch(/^1\.\d+\.\d+$/);
    });

    it('gives the window the same app id as its desktop entry', () => {
        const manifest = gamingPackageManifest({ version: '2.0.12' });
        expect(config.linux.executableName).toBe(GAMING_LINUX_EXECUTABLE_NAME);
        expect(manifest.desktopName).toBe(`${GAMING_LINUX_EXECUTABLE_NAME}.desktop`);
        expect(config.linux.syncDesktopName).toBe(true);
    });

    it('tells Linux players how to start the AppImage they downloaded', () => {
        const notes: string = buildReleaseNotes('## [2.0.13] - 2026-10-07\n\n- Fix.\n', '2.0.13');
        expect(notes).toContain('chmod +x yomu-gaming-*.AppImage');
        expect(notes).toContain('--appimage-extract-and-run');
        // The Firefox pointer stays the last paragraph, right above the asset list.
        expect(notes.trimEnd().split('\n\n').at(-1)).toContain('addons.mozilla.org');
    });
});
