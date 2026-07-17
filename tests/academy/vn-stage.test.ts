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

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

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

    it('keeps one page-wide readings state across dialogue lines and registered surfaces', () => {
        const onChange = vi.fn();
        const stage = createAcademyVnStage();
        const paperLine = document.createElement('span');
        paperLine.textContent = '教室で使う言葉';
        stage.registerReadingSurface(paperLine);
        stage.setLine({
            id: 'line:repeat',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: 'もう一度お願いします。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings', onChange },
        });
        const japanese = stage.element.querySelector<HTMLElement>('[data-vn-annotation-root]')!;
        const toggle = stage.element.querySelector<HTMLButtonElement>('.academy-vn-reading-toggle')!;

        expect(stage.element.querySelector<HTMLElement>('.academy-vn-line-tools')?.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(japanese.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        toggle.click();
        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBeUndefined();
        expect(japanese.dataset.yomuRuntimeSurface).toBe('academy-dialogue');
        expect(japanese.dataset.yomuFuriganaMode).toBe('all');
        expect(paperLine.dataset.yomuFuriganaMode).toBe('all');
        expect(toggle.textContent).toBe('読');
        expect(toggle.getAttribute('aria-label')).toBe('Hide readings');
        expect(onChange).toHaveBeenCalledWith(true);

        stage.setLine({
            id: 'line:next',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: '聞いてください。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
        });
        expect(japanese.dataset.yomuFuriganaMode).toBe('all');
        expect(toggle.getAttribute('aria-pressed')).toBe('true');

        japanese.innerHTML = '<ruby>一度<rt>いちど</rt></ruby>';
        toggle.click();
        expect(japanese.textContent).toBe('聞いてください。');
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
        const translation = stage.element.querySelector<HTMLElement>('.academy-vn-translation')!;
        const toggle = stage.element.querySelector<HTMLButtonElement>('.academy-vn-translation-toggle')!;
        expect(translation.textContent).toBe('Please listen.');
        expect(translation.hidden).toBe(true);
        expect(toggle.textContent).toBe('訳');
        expect(toggle.disabled).toBe(false);
        toggle.click();
        expect(translation.hidden).toBe(false);
        expect(toggle.getAttribute('aria-label')).toBe('Hide translation');

        stage.setLine({
            id: 'line:next',
            japanese: 'もう一度。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
            translation: 'One more time.',
            translationEarned: true,
        });
        expect(stage.element.querySelector<HTMLElement>('.academy-vn-translation')?.hidden).toBe(false);
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
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

    it('crossfades consecutive expression selections without duplicating the speaker', () => {
        const stage = createAcademyVnStage();
        stage.setCast([rie()]);
        const initialPicture = stage.element.querySelector<HTMLPictureElement>('[data-character="rie"] picture')!;
        const slot = stage.element.querySelector<HTMLElement>('[data-character="rie"]')!;

        stage.setCast([rie('happy')]);

        const picture = stage.element.querySelector<HTMLPictureElement>('[data-character="rie"] picture')!;
        expect(picture).toBe(initialPicture);
        expect(stage.element.querySelectorAll('.academy-vn-sprite-slot[data-character="rie"]')).toHaveLength(1);
        expect(picture.dataset.expression).toBe('happy');
        expect(picture.querySelector('img')?.src).toContain('/rie-happy.png');
        expect(picture.dataset.expressionTransition).toBe('true');
        expect(slot.dataset.poseTransition).toBe('expression');
        expect(slot.dataset.poseTransitionStyle).toBe('dissolve');
        expect(slot.style.getPropertyValue('--academy-vn-pose-duration')).toBe('220ms');
        expect(slot.querySelectorAll('.academy-vn-portrait-outgoing')).toHaveLength(1);
        expect(slot.querySelector<HTMLImageElement>('.academy-vn-portrait-outgoing img')?.src).toContain('/rie-neutral.png');
        expect(slot.querySelector('.academy-vn-portrait-outgoing')?.getAttribute('aria-hidden')).toBe('true');

        stage.setCast([rie('repair')]);
        expect(picture.querySelector('img')?.src).toContain('/rie-repair.png');
        expect(slot.querySelectorAll('.academy-vn-portrait-outgoing')).toHaveLength(1);
        expect(slot.querySelector<HTMLImageElement>('.academy-vn-portrait-outgoing img')?.src).toContain('/rie-happy.png');
    });

    it('selects a new angle without creating a portrait overlay and keeps the dialogue tail aligned', () => {
        const stage = createAcademyVnStage();
        stage.setCast([rie()]);
        stage.setLine({
            id: 'line:move',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: 'こちらです。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
        });

        stage.setCast([{ ...rie(), position: 'right' }]);

        const slot = stage.element.querySelector<HTMLElement>('[data-character="rie"]')!;
        expect(slot.dataset.poseTransition).toBe('angle');
        expect(slot.dataset.position).toBe('right');
        expect(slot.querySelector('.academy-vn-portrait-outgoing')).toBeNull();
        expect(stage.element.querySelector<HTMLElement>('.academy-vn-dialogue')?.dataset.tail).toBe('right');
    });

    it('cleans a pose swap when CSS completion events are cancelled', () => {
        vi.useFakeTimers();
        try {
            const stage = createAcademyVnStage();
            stage.setCast([rie()]);
            stage.setCast([rie('happy')]);
            const slot = stage.element.querySelector<HTMLElement>('[data-character="rie"]')!;

            expect(slot.dataset.poseTransition).toBe('expression');
            expect(slot.querySelector('.academy-vn-portrait-outgoing')).not.toBeNull();
            vi.advanceTimersByTime(270);
            expect(slot.dataset.poseTransition).toBeUndefined();
            expect(slot.querySelector('.academy-vn-portrait-outgoing')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('opens the full dialogue history as a modal and restores scene focus and semantics on close', () => {
        const stage = createAcademyVnStage();
        document.body.append(stage.element);
        stage.setLine({
            id: 'line:one',
            speakerName: 'Rie-sensei',
            japanese: 'みてください。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
            translation: 'Please look.',
            translationEarned: true,
        });
        stage.setLine({
            id: 'line:two',
            speakerName: 'Learner',
            japanese: 'はい。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
            translation: 'Yes.',
            translationEarned: true,
        });
        stage.setLine({
            id: 'line:aside',
            speakerName: 'Learner',
            japanese: 'もう一度。',
            reading: { available: false, showLabel: 'Readings', hideLabel: 'Hide readings' },
        });

        const log = stage.element.querySelector<HTMLElement>('.academy-vn-log-panel')!;
        const logButton = stage.element.querySelector<HTMLButtonElement>('.academy-vn-log-button')!;
        const readingButton = stage.element.querySelector<HTMLButtonElement>('.academy-vn-reading-toggle')!;
        const translationButton = stage.element.querySelector<HTMLButtonElement>('.academy-vn-translation-toggle')!;
        const sceneHeader = stage.element.querySelector<HTMLElement>('.academy-vn-dialogue-header')!;
        const logHeader = stage.element.querySelector<HTMLElement>('.academy-vn-log-header')!;
        const toolbar = stage.element.querySelector<HTMLElement>('.academy-vn-line-tools')!;
        const plate = stage.element.querySelector<HTMLElement>('.academy-vn-plate')!;
        const dialogue = stage.element.querySelector<HTMLElement>('.academy-vn-dialogue')!;
        expect(log.hidden).toBe(true);
        expect(toolbar.parentElement).toBe(sceneHeader);
        expect(readingButton.disabled).toBe(true);
        expect(translationButton.disabled).toBe(true);
        logButton.focus();
        logButton.click();

        expect(log.hidden).toBe(false);
        expect(log.getAttribute('role')).toBe('dialog');
        expect(log.getAttribute('aria-modal')).toBe('true');
        expect(log.textContent).toContain('Rie-sensei');
        expect(log.textContent).toContain('みてください。');
        expect(log.textContent).toContain('Please look.');
        expect(log.textContent).toContain('はい。');
        expect(log.textContent).toContain('Yes.');
        expect(log.querySelectorAll('.academy-vn-log-entry')).toHaveLength(3);
        expect([...log.querySelectorAll<HTMLElement>('.academy-vn-log-translation')].every(entry => entry.hidden)).toBe(true);
        expect(toolbar.parentElement).toBe(logHeader);
        expect(toolbar.closest('[inert]')).toBeNull();
        expect(stage.element.querySelectorAll('.academy-vn-reading-toggle')).toHaveLength(1);
        expect(readingButton.disabled).toBe(false);
        expect(translationButton.disabled).toBe(false);
        expect(logButton.textContent).toBe('\u00d7');
        expect(logButton.getAttribute('aria-label')).toBe('Close dialogue log');
        expect(document.activeElement).toBe(logButton);
        expect(dialogue.inert).toBe(true);
        expect(plate.getAttribute('aria-hidden')).toBe('true');

        translationButton.click();
        expect([...log.querySelectorAll<HTMLElement>('.academy-vn-log-translation')].every(entry => !entry.hidden)).toBe(true);
        readingButton.click();
        const loggedJapanese = [...log.querySelectorAll<HTMLElement>('.academy-vn-log-japanese')];
        expect(loggedJapanese[0]?.dataset.yomuFuriganaMode).toBe('all');
        expect(loggedJapanese[2]?.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(stage.element.querySelector<HTMLElement>('.academy-vn-japanese')?.dataset.jpdbReaderSurfaceIgnore).toBe('');

        translationButton.focus();
        translationButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(document.activeElement).toBe(logButton);
        logButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(document.activeElement).toBe(translationButton);

        log.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(log.hidden).toBe(true);
        expect(dialogue.inert).toBe(false);
        expect(plate.getAttribute('aria-hidden')).toBe('true');
        expect(toolbar.parentElement).toBe(sceneHeader);
        expect(stage.element.querySelectorAll('.academy-vn-reading-toggle')).toHaveLength(1);
        expect(logButton.getAttribute('aria-label')).toBe('Dialogue log');
        expect(readingButton.disabled).toBe(true);
        expect(translationButton.disabled).toBe(true);
        expect(document.activeElement).toBe(logButton);

        logButton.blur();
        logButton.click();
        logButton.click();
        expect(log.hidden).toBe(true);
        expect(document.activeElement).toBe(logButton);

        logButton.click();
        log.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(log.hidden).toBe(true);
    });

    it('returns focus to the Log trigger and keeps an open history current', () => {
        const stage = createAcademyVnStage();
        document.body.append(stage.element);
        stage.setLine({
            id: 'line:one',
            japanese: '最初の行です。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
        });

        const action = document.createElement('button');
        action.textContent = 'Continue';
        stage.setAction({ element: action });
        const log = stage.element.querySelector<HTMLElement>('.academy-vn-log-panel')!;
        const logButton = stage.element.querySelector<HTMLButtonElement>('.academy-vn-log-button')!;
        action.focus();
        logButton.click();

        stage.setLine({
            id: 'line:two',
            japanese: '次の行です。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
        });
        expect(log.querySelectorAll('.academy-vn-log-entry')).toHaveLength(2);
        expect(log.textContent).toContain('次の行です。');

        log.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.activeElement).toBe(logButton);
    });

    it('keeps the speaker and global support controls in separate non-overlapping regions', () => {
        const stage = createAcademyVnStage();
        stage.setCast([rie(), { ...rie(), characterId: 'learner', displayName: 'Mina', position: 'right' }]);
        stage.setLine({
            id: 'line:layout',
            speakerId: 'learner',
            speakerName: 'Mina',
            japanese: 'もう一度お願いします。',
            reading: { showLabel: 'Show readings', hideLabel: 'Hide readings' },
        });

        const header = stage.element.querySelector('.academy-vn-dialogue-header')!;
        const toolbar = stage.element.querySelector('.academy-vn-line-tools')!;
        expect([...header.children]).toEqual([
            stage.element.querySelector('.academy-vn-speaker'),
            stage.element.querySelector('.academy-vn-line-tools'),
        ]);
        expect(stage.element.querySelector('.academy-vn-dialogue-content .academy-vn-line-tools')).toBeNull();
        expect(stage.element.querySelectorAll('.academy-vn-line-tools')).toHaveLength(1);
        expect(toolbar.getAttribute('role')).toBe('toolbar');
        expect(toolbar.getAttribute('aria-label')).toBe('Dialogue support');
        expect(stage.element.dataset.castSize).toBe('2');
        expect(stage.element.querySelector('[data-character="learner"]')?.getAttribute('data-position')).toBe('right');
    });

    it('applies performance frames, finite emphasis and the text reveal lifecycle', () => {
        const stage = createAcademyVnStage({ reducedMotion: false });
        stage.setCast([rie(), {
            ...rie(),
            characterId: 'learner',
            displayName: 'Mina',
            alt: 'Mina listening to Rie-sensei',
            position: 'right',
        }]);
        const slot = stage.element.querySelector<HTMLElement>('[data-character="rie"]')!;
        const listener = stage.element.querySelector<HTMLElement>('[data-character="learner"]')!;

        expect(slot.dataset.vnPerformer).toBe('');
        expect(slot.dataset.performancePresence).toBe('inactive');
        expect(slot.dataset.performanceMotion).toBe('entrance');

        stage.setLine({
            id: 'line:performance',
            speakerId: 'rie',
            speakerName: 'Rie-sensei',
            japanese: '始めましょう。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
            emphasis: 'jump',
        });

        const text = stage.element.querySelector<HTMLElement>('.academy-vn-japanese')!;
        expect(slot.dataset.performancePresence).toBe('active');
        expect(slot.dataset.performanceColor).toBe('full');
        expect(slot.style.getPropertyValue('--academy-vn-performance-lift')).toBe('12px');
        expect(slot.dataset.performanceMotion).toBe('jump');
        expect(listener.dataset.performancePresence).toBe('inactive');
        expect(listener.dataset.performanceColor).toBe('desaturated');
        expect(listener.style.getPropertyValue('--academy-vn-performance-lift')).toBe('0px');
        expect(text.dataset.performanceText).toBe('revealing');
        expect(text.textContent).toBe('始');

        stage.completeTextReveal();
        expect(text.dataset.performanceText).toBeUndefined();
        expect(text.textContent).toBe('始めましょう。');
    });

    it('reveals wrapped Japanese in one sequential character flow', () => {
        vi.useFakeTimers();
        const stage = createAcademyVnStage({ reducedMotion: false });
        stage.setLine({
            id: 'line:wrapped',
            japanese: '一行目から\n二行目へ進みます。',
            translation: 'The sentence continues from the first line into the second.',
            translationEarned: true,
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
        });

        const text = stage.element.querySelector<HTMLElement>('.academy-vn-japanese')!;
        const translation = stage.element.querySelector<HTMLElement>('.academy-vn-translation')!;
        expect(text.textContent).toBe('一');
        expect(translation.dataset.waitingForLine).toBe('');

        vi.advanceTimersByTime(240);
        expect(text.textContent?.startsWith('一行')).toBe(true);
        expect(text.textContent).not.toContain('二行目');

        vi.runAllTimers();
        expect(text.textContent).toBe('一行目から\n二行目へ進みます。');
        expect(text.dataset.performanceText).toBeUndefined();
        expect(translation.dataset.waitingForLine).toBeUndefined();
    });

    it('gives spoken text a short lead-in and pauses at sentence boundaries', () => {
        vi.useFakeTimers();
        const stage = createAcademyVnStage({ reducedMotion: false });
        stage.setLine({
            id: 'line:cadence',
            japanese: 'はい。次です。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
        });

        const text = stage.element.querySelector<HTMLElement>('.academy-vn-japanese')!;
        expect(text.textContent).toBe('は');
        vi.advanceTimersByTime(100);
        expect(text.textContent).toBe('は');
        vi.advanceTimersByTime(160);
        expect(text.textContent).toContain('。');
        const atBoundary = text.textContent;
        vi.advanceTimersByTime(250);
        expect(text.textContent).toBe(atBoundary);
        vi.runAllTimers();
        expect(text.textContent).toBe('はい。次です。');
    });

    it('routes only verified semantic SFX after learner interaction', () => {
        const playSfx = vi.fn();
        const stage = createAcademyVnStage({ audio: { playSfx }, reducedMotion: true });
        stage.setLine({
            id: 'line:one',
            japanese: '一。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
            sfx: ['speaker.arrival'],
        });
        expect(playSfx).not.toHaveBeenCalled();

        stage.element.dispatchEvent(new Event('pointerdown'));
        stage.setLine({
            id: 'line:two',
            japanese: '二。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
        });
        stage.setCast([rie()]);

        expect(playSfx).toHaveBeenCalledOnce();
        expect(playSfx).toHaveBeenCalledWith('scene.advance');
    });

    it('suppresses lift, motion and animated text reveal for reduced motion', () => {
        const stage = createAcademyVnStage({ reducedMotion: true });
        stage.setCast([rie()]);
        stage.setLine({
            id: 'line:quiet',
            speakerId: 'rie',
            japanese: 'ゆっくり。',
            reading: { showLabel: 'Readings', hideLabel: 'Hide readings' },
            emphasis: 'jump',
        });
        stage.setCast([{ ...rie('happy'), position: 'right' }]);

        const slot = stage.element.querySelector<HTMLElement>('[data-character="rie"]')!;
        expect(stage.element.dataset.reducedMotion).toBe('');
        expect(slot.dataset.performanceMotion).toBeUndefined();
        expect(slot.dataset.poseTransition).toBeUndefined();
        expect(slot.dataset.position).toBe('right');
        expect(slot.querySelector('.academy-vn-portrait-outgoing')).toBeNull();
        expect(slot.querySelector<HTMLImageElement>('.academy-vn-sprite img')?.src).toContain('/rie-happy.png');
        expect(slot.style.getPropertyValue('--academy-vn-performance-lift')).toBe('0px');
        expect(stage.element.querySelector<HTMLElement>('.academy-vn-japanese')?.dataset.performanceText).toBeUndefined();
        vi.spyOn(stage.element, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 320, height: 640, right: 320, bottom: 640, x: 0, y: 0, toJSON: () => ({}),
        });
        stage.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 640, bubbles: true }));
        expect(stage.element.style.getPropertyValue('--academy-vn-parallax-x')).toBe('');
        expect(stage.element.style.getPropertyValue('--academy-vn-parallax-y')).toBe('');
    });

    it('keeps Back and the active action as separate navigation controls', () => {
        const onBack = vi.fn();
        const stage = createAcademyVnStage({ backLabel: 'Back to plan', onBack });
        const action = document.createElement('button');
        action.className = 'academy-vn-primary-action';
        action.textContent = 'Continue';
        stage.setAction({ element: action });

        const navigation = stage.element.querySelector<HTMLElement>('.academy-vn-navigation')!;
        const back = navigation.querySelector<HTMLButtonElement>('.academy-vn-back')!;
        expect([...navigation.children]).toEqual([back, stage.element.querySelector('.academy-vn-action-slot')]);
        expect(navigation.dataset.actionEmpty).toBe('false');
        expect(back.getAttribute('aria-label')).toBe('Back to plan');
        back.click();
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('defines responsive full-bleed, angular-paper and reduced-motion contracts', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/vn-stage.css'), 'utf8');
        const phoneCss = css.slice(
            css.indexOf('@media (max-width: 700px)'),
            css.indexOf('@media (min-width: 1100px)'),
        );
        expect(css).toMatch(/\.academy-vn-stage\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*100dvh;/s);
        expect(css).toMatch(/\.academy-vn-sprite-slot\s*\{[^}]*left:\s*50%;[^}]*translate:\s*calc\(-50% \+ var\(--academy-vn-slot-x\)\) 0;[^}]*transition:[^}]*translate var\(--academy-vn-pose-duration/s);
        expect(css).toMatch(/\.academy-vn-sprite-slot\[data-position="left"\]\s*\{[^}]*--academy-vn-slot-x:\s*-26vw;/s);
        expect(css).toMatch(/\.academy-vn-sprite-slot\[data-position="right"\]\s*\{[^}]*--academy-vn-slot-x:\s*26vw;/s);
        expect(css).toMatch(/\.academy-vn-dialogue\s*\{[^}]*clip-path:\s*polygon/s);
        expect(css).toMatch(/\.academy-vn-log-panel\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
        expect(css).toMatch(/\.academy-vn-log-panel\s*\{[^}]*overflow:\s*hidden;[^}]*overscroll-behavior:\s*contain;/s);
        expect(css).toMatch(/\.academy-vn-dialogue-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
        expect(css).toMatch(/\.academy-vn-dialogue-content\s*\{[^}]*overflow-y:\s*auto;/s);
        expect(css).toMatch(/\.academy-vn-navigation\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);[^}]*gap:\s*14px;/s);
        expect(css).toContain('color-scheme: light only');
        expect(css).toContain('.academy-vn-stage[data-cast-size="2"]');
        expect(css).toMatch(/\.academy-vn-log-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
        expect(css).toMatch(/\.academy-vn-log-entries\s*\{[^}]*overflow-y:\s*auto;/s);
        expect(css).toMatch(/\.academy-vn-log-button:focus-visible,[\s\S]*outline:\s*3px solid/s);
        expect(css).toMatch(/@media \(max-width: 700px\)/);
        expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-vn-log-button,[\s\S]*width:\s*44px;[\s\S]*height:\s*44px;/);
        expect(phoneCss).toContain('--academy-vn-slot-x: -12vw');
        expect(phoneCss).toContain('--academy-vn-slot-x: 12vw');
        expect(phoneCss).toContain('--academy-vn-slot-x: -20vw');
        expect(phoneCss).toContain('--academy-vn-slot-x: 20vw');
        expect(phoneCss).toMatch(/--academy-vn-mobile-dialogue-height:\s*min\(48dvh, 390px\);/);
        expect(phoneCss).toMatch(/\.academy-vn-object-slot\s*\{[^}]*bottom:\s*calc\([\s\S]*--academy-vn-mobile-dialogue-height[\s\S]*--academy-vn-mobile-object-clearance/s);
        expect(phoneCss).toMatch(/\.academy-vn-dialogue\s*\{[^}]*bottom:\s*var\(--academy-vn-mobile-dialogue-bottom\);[^}]*max-height:\s*var\(--academy-vn-mobile-dialogue-height\);/s);
        expect(phoneCss).toMatch(/\.academy-vn-stage\[data-cast-size="2"\] \.academy-vn-sprite-slot\[data-position\]\s*\{[^}]*left:\s*50%;[^}]*right:\s*auto;/s);
        expect(phoneCss).not.toMatch(/(?:left|right):\s*-(?:18|9)vw/);
        expect(css).toMatch(/@media \(min-width: 1100px\)/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;/);
        expect(css).toMatch(/\.academy-vn-stage\[data-reduced-motion\][\s\S]*transition:\s*none;/);
        expect(css).toMatch(/\.academy-vn-portrait-outgoing\s*\{[^}]*animation:\s*academy-vn-portrait-swap-out var\(--academy-vn-pose-duration, 220ms\)/s);
        expect(css).not.toContain('.academy-panel');
    });
});
