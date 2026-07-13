import { describe, expect, it } from 'vitest';
import {
    academyReaderCompanionFiles,
    academyReaderCompanionServices,
} from '../../src/academy/integration/yomu-runtime-companions';

describe('Academy Reader runtime contract', () => {
    it('loads every split service companion before the hosted core', () => {
        expect(academyReaderCompanionFiles()).toEqual([
            'greasyfork/yomu-ui-copy.user.js',
            'greasyfork/yomu-settings-surface.user.js',
            'greasyfork/yomu-kanji-study.user.js',
            'greasyfork/yomu-anki.user.js',
        ]);
        expect(academyReaderCompanionServices()).toEqual([
            'localization',
            'local-dictionary',
            'translation',
            'grammar',
            'mining',
            'anki',
        ]);
    });
});
