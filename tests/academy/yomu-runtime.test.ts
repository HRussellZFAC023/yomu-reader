import { academyRuntimeAssetCandidates } from '../../src/academy/integration/yomu-runtime';

describe('Academy hosted Yomu runtime', () => {
    it('prefers the Reader bundle next to the hosted Academy before fallbacks', () => {
        expect(academyRuntimeAssetCandidates('yomu.user.js', 'https://example.test/academy/')).toEqual([
            'https://example.test/yomu.user.js',
            'https://example.test/academy/yomu.user.js',
            'https://example.test/yomu-reader/yomu.user.js',
        ]);
    });
});
