import fs from 'node:fs';
import path from 'node:path';
import { createAcademyVnStage, type AcademyVnCastMember } from '../../src/academy/ui/vn-stage';

const expressions = {
    neutral: { still: '/rie-neutral.png' },
    happy: { still: '/rie-happy.png', animated: '/rie-happy.webp' },
    repair: { still: '/rie-repair.png' },
} as const;

function rie(expression: AcademyVnCastMember['expression'] = 'neutral'): AcademyVnCastMember {
    return {
        characterId: 'rie',
        displayName: 'Rie-sensei',
        alt: 'Rie-sensei holding the class handout',
        position: 'left',
        expression,
        expressions,
    };
}

afterEach(() => document.body.replaceChildren());

describe('Academy VN stage', () => {
    it('renders a full-bleed plate and visible speaker sprite without panel-shell markup', () => {
        const stage = createAcademyVnStage({ label: 'Classroom scene' });
        stage.setDirection({
            plate: { id: 'classroom-rain', wide: '/classroom-wide.webp', mobile: '/classroom-mobile.webp' },
            focus: { x: 62, y: 44 },
        });
        stage.setCast([rie()]);
        stage.setLine({
            id: 'line:look',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: '見てください。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
        });

        expect(stage.element.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src).toContain('/classroom-wide.webp');
        expect(stage.element.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.srcset).toContain('/classroom-mobile.webp');
        expect(stage.element.querySelector('[data-character="rie"] img')?.getAttribute('alt')).toContain('Rie-sensei');
        expect(stage.element.querySelector('[data-character="rie"]')?.getAttribute('data-speaking')).toBe('true');
        expect(stage.element.querySelector('.academy-vn-dialogue')?.getAttribute('data-tail')).toBe('left');
        expect(stage.element.querySelector('.academy-panel')).toBeNull();
    });

    it('keeps readings off until the per-line control wakes the shared annotation root', () => {
        const onChange = vi.fn();
        const stage = createAcademyVnStage();
        stage.setLine({
            id: 'line:repeat',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: 'もう一度お願いします。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings', onChange },
        });
        const japanese = stage.element.querySelector<HTMLElement>('[data-vn-annotation-root]')!;
        const toggle = stage.element.querySelector<HTMLButtonElement>('.academy-vn-reading-toggle')!;

        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(japanese.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        toggle.click();
        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBeUndefined();
        expect(japanese.dataset.yomuRuntimeSurface).toBe('academy-dialogue');
        expect(japanese.dataset.yomuFuriganaMode).toBe('all');
        expect(toggle.textContent).toBe('Hide readings');
        expect(onChange).toHaveBeenCalledWith(true);

        japanese.innerHTML = '<ruby>一度<rt>いちど</rt></ruby>';
        toggle.click();
        expect(japanese.textContent).toBe('もう一度お願いします。');
        expect(japanese.querySelector('ruby')).toBeNull();
        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBe('');
    });

    it('never mounts a translation until the caller marks that support as earned', () => {
        const stage = createAcademyVnStage();
        const line = {
            id: 'line:listen',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: '聞いてください。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
            translation: 'Please listen.',
        } as const;

        stage.setLine(line);
        expect(stage.element.textContent).not.toContain('Please listen.');
        expect(stage.element.querySelector('.academy-vn-translation')).toBeNull();

        stage.setLine({ ...line, translationEarned: true });
        expect(stage.element.querySelector('.academy-vn-translation')?.textContent).toBe('Please listen.');
    });

    it('mounts one literal foreground object and one response surface with owned cleanup', () => {
        const stage = createAcademyVnStage();
        const oldDispose = vi.fn();
        const finalDispose = vi.fn();
        const actionDispose = vi.fn();
        const firstPaper = document.createElement('figure');
        firstPaper.dataset.object = 'worksheet';
        const journal = document.createElement('figure');
        journal.dataset.object = 'journal';
        const response = document.createElement('form');
        response.dataset.response = 'spoken-recall';

        stage.setObject({ element: firstPaper, dispose: oldDispose });
        stage.setObject({ element: journal, dispose: finalDispose });
        stage.setAction({ element: response, dispose: actionDispose });

        expect(oldDispose).toHaveBeenCalledOnce();
        expect(stage.element.querySelector('[data-object="worksheet"]')).toBeNull();
        expect(stage.element.querySelector('.academy-vn-object-slot > [data-object="journal"]')).toBe(journal);
        expect(stage.element.querySelector('.academy-vn-action-slot > [data-response="spoken-recall"]')).toBe(response);

        document.body.append(stage.element);
        stage.dispose();
        expect(finalDispose).toHaveBeenCalledOnce();
        expect(actionDispose).toHaveBeenCalledOnce();
        expect(stage.element.isConnected).toBe(false);
        expect(() => stage.setLine(null)).toThrow('disposed');
    });

    it('updates an existing character expression instead of duplicating the speaker', () => {
        const stage = createAcademyVnStage();
        stage.setCast([rie()]);
        const initialPicture = stage.element.querySelector<HTMLPictureElement>('[data-character="rie"] picture')!;

        stage.setCast([rie('happy')]);

        const picture = stage.element.querySelector<HTMLPictureElement>('[data-character="rie"] picture')!;
        expect(picture).toBe(initialPicture);
        expect(stage.element.querySelectorAll('.academy-vn-sprite-slot[data-character="rie"]')).toHaveLength(1);
        expect(picture.dataset.expression).toBe('happy');
        expect(picture.querySelector('img')?.src).toContain('/rie-happy.png');
    });

    it('defines responsive full-bleed, angular-paper and reduced-motion contracts', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/vn-stage.css'), 'utf8');
        expect(css).toMatch(/\.academy-vn-stage\s*\{[^}]*min-width:\s*320px;[^}]*min-height:\s*100dvh;/s);
        expect(css).toMatch(/\.academy-vn-dialogue\s*\{[^}]*clip-path:\s*polygon/s);
        expect(css).toMatch(/@media \(max-width: 700px\)/);
        expect(css).toMatch(/@media \(min-width: 1100px\)/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;/);
        expect(css).not.toContain('.academy-panel');
    });
});
