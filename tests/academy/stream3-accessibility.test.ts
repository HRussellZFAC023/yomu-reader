import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import fs from 'node:fs';
import path from 'node:path';

const progress = {
    completedScenes: ['scene:arrival'],
    completedEncounterIds: ['encounter:arrival'],
    metCharacterIds: ['rie', 'aakash', 'felix'],
    worldVisits: { courtyard: 1, classroom: 1 },
} as const;

describe('Stream 3 Academy accessibility', () => {
    it('keeps the shell as the only main landmark and navigation taps out of lookup', () => {
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'courtyard',
            route: 'campus',
            progress,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
        });

        const stage = screen.querySelector<HTMLElement>('.academy-world-stage')!;
        const exits = [...screen.querySelectorAll<HTMLButtonElement>('.academy-world-exit')];
        expect(stage.tagName).toBe('DIV');
        expect(screen.querySelector('main')).toBeNull();
        expect(exits.length).toBeGreaterThan(0);
        expect(exits.every(exit => exit.dataset.jpdbReaderSurfaceIgnore === '')).toBe(true);
    });

    it('keeps mobile lesson navigation actions separated and paper headings inside their sheet', () => {
        const lessonCss = fs.readFileSync(path.resolve('src/academy/ui/lesson-activity-chapter.css'), 'utf8');
        const proofCss = fs.readFileSync(path.resolve('src/academy/styles/lesson-zero-proof.css'), 'utf8');

        expect(lessonCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-lesson-activity-navigation\s*\{[^}]*flex-direction:\s*column;[^}]*gap:\s*16px;/);
        expect(lessonCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-lesson-language-tool\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
        expect(lessonCss).toMatch(/\.academy-activity-chapter-next,[\s\S]*\.academy-lesson-activity-continue\s*\{[^}]*width:\s*100%;/);
        expect(proofCss).toMatch(/\.academy-lesson-zero-handout figcaption\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s);
        expect(proofCss).toMatch(/\.academy-lesson-zero-proof \{[^}]*--academy-vn-mobile-dialogue-height:\s*min\(61dvh, 520px\);/s);
    });
});
