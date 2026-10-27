import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

describe('aggregate runtime Settings launcher boundary', () => {

    it('keeps the built aggregate runtime launcher-only while retaining its offline services', () => {
        const artifact = readFileSync(
            path.join(repoRoot, 'docs/public/greasyfork/yomu-runtime.user.js'),
            'utf8',
        );
        const settingsSurface = readFileSync(
            path.join(repoRoot, 'docs/public/greasyfork/yomu-settings-surface.user.js'),
            'utf8',
        );
        const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version as string;

        expect(artifact).not.toContain('class SettingsDialogController');
        expect(artifact).not.toContain('class SettingsRestoreCoordinator');
        expect(artifact).not.toContain('class SettingsCloudSyncCoordinator');
        expect(artifact).toContain('const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;');
        expect(settingsSurface).toContain(`const CURRENT_YOMU_VERSION = "${packageVersion}"`);
        expect(artifact).toContain('class LookupModalAccessibility');
        expect(artifact).toContain('function installAcademyReaderSrsSync');
    });
});
