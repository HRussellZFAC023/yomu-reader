import { describe, expect, it } from 'vitest';

import {
    populateStudyTargetSelect,
    studyTargetOptions,
} from '../../src/reader/app/study-target-picker';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';

describe('shared study-target picker', () => {
    it('keeps all 33 targets labelled with their readiness and reason', () => {
        const options = studyTargetOptions('en');
        const japanese = options.find(option => option.id === 'ja');
        const spanish = options.find(option => option.id === 'es');

        expect(options).toHaveLength(33);
        // The two labels now differ by DEPTH, not by whether a language can be
        // studied at all. Measured 2026-08-02: every target has the whole
        // read-mine-review loop, so telling a Spanish learner "Reading and lookup"
        // described a product that was already better than that.
        expect(japanese).toMatchObject({
            readiness: 'full',
            disabled: false,
            reason: 'Lookup, readings, grammar, audio, OCR, handwriting and study are ready for this target.',
        });
        expect(japanese?.label).toContain('Full Yomu support');
        expect(spanish).toMatchObject({
            readiness: 'full',
            disabled: false,
            reason: 'Lookup, readings, grammar, audio, OCR, handwriting and study are ready for this target.',
        });
        expect(spanish?.label).toContain('Español');
        expect(spanish?.label).toContain('Full Yomu support');
        for (const option of options) {
            expect(option.reason, `${option.id} reason`).toContain('study');
        }
    });

    it('keeps planned targets named, reasoned, and disabled', () => {
        const planned = {
            ...LEARNING_TARGET_ROSTER.find(target => target.id === 'es')!,
            studyTargetReadiness: 'planned' as const,
        };

        expect(studyTargetOptions('en', [planned])).toEqual([
            expect.objectContaining({
                id: 'es',
                readiness: 'planned',
                disabled: true,
                reason: 'Support is planned.',
            }),
        ]);
    });

    it('populates an accessible native select with the requested target selected', () => {
        const picker = document.createElement('select');
        populateStudyTargetSelect(picker, 'en', 'es');
        const spanish = picker.querySelector<HTMLOptionElement>('option[value="es"]')!;

        expect(picker.options).toHaveLength(33);
        expect(spanish.selected).toBe(true);
        expect(spanish.lang).toBe('es');
        expect(spanish.dir).toBe('ltr');
        expect(spanish.dataset.studyTargetReadiness).toBe('full');
        expect(spanish.getAttribute('aria-label')).toBe(`${spanish.textContent}. ${spanish.title}`);
    });
});
