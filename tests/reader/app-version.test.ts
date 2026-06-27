import { describe, expect, it } from 'vitest';

import { compareYomuVersions, latestYomuVersionFromVersionJson, yomuVersionFromBuildId } from '../../src/reader/app/version';

describe('Yomu version helpers', () => {
    it('extracts the package version from hosted new-tab build ids', () => {
        expect(yomuVersionFromBuildId('1.4.131-abcdef123456', 'abcdef123456')).toBe('1.4.131');
        expect(yomuVersionFromBuildId('1.4.131-abcdef123456')).toBe('1.4.131');
        expect(latestYomuVersionFromVersionJson({ appHash: 'abcdef123456', buildId: '1.4.131-abcdef123456' })).toBe('1.4.131');
    });

    it('compares semantic versions for update status', () => {
        expect(compareYomuVersions('1.4.130', '1.4.131')).toBe(-1);
        expect(compareYomuVersions('1.4.131', '1.4.131')).toBe(0);
        expect(compareYomuVersions('1.4.132', '1.4.131')).toBe(1);
        expect(compareYomuVersions('dev', '1.4.131')).toBeNull();
    });
});
