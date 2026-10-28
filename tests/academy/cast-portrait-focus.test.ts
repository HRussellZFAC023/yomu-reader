import { ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH } from '../../src/academy/domain/cast-portrait-focus.generated';
import { ACADEMY_CAST_STANDARDIZATION_MANIFEST } from '../../src/academy/domain/cast-standardization-manifest';

describe('Academy cast conversational focus', () => {
    it('maps every production sprite to a bounded portrait treatment', () => {
        expect(Object.keys(ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH)).toHaveLength(
            ACADEMY_CAST_STANDARDIZATION_MANIFEST.length,
        );
        for (const slot of ACADEMY_CAST_STANDARDIZATION_MANIFEST) {
            const focus = ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH[
                slot.assetPath as keyof typeof ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH
            ];
            expect(focus, slot.assetPath).toBeDefined();
            expect(focus.scale, slot.assetPath).toBeGreaterThanOrEqual(1);
            expect(focus.scale, slot.assetPath).toBeLessThanOrEqual(2.2);
            expect(focus.translateYPercent, slot.assetPath).toBeGreaterThanOrEqual(-12);
            expect(focus.translateYPercent, slot.assetPath).toBeLessThanOrEqual(2);
        }
    });

    it('keeps every expression in a cast family at one stable conversational scale', () => {
        const focusByCast = new Map<string, string>();
        for (const slot of ACADEMY_CAST_STANDARDIZATION_MANIFEST) {
            const focus = ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH[
                slot.assetPath as keyof typeof ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH
            ];
            const signature = `${focus.scale}:${focus.translateYPercent}`;
            const existing = focusByCast.get(slot.castId);
            if (existing) expect(signature, slot.castId).toBe(existing);
            else focusByCast.set(slot.castId, signature);
        }
        expect(focusByCast.size).toBe(30);
    });

    it('uses Rie-sensei as the slightly closer conversational baseline', () => {
        const rie = ACADEMY_CAST_STANDARDIZATION_MANIFEST.find(
            slot => slot.castId === 'rie' && slot.expression === 'neutral',
        )!;
        const focus = ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH[
            rie.assetPath as keyof typeof ACADEMY_CAST_PORTRAIT_FOCUS_BY_PATH
        ];
        expect(focus.scale).toBe(1.2);
        expect(focus.translateYPercent).toBeLessThan(0);
    });
});
