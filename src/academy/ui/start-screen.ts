import { academyText, type AcademyCopyKey, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { JlptBand, StartingRoute } from '../domain/learner-record';
import { backButton, copyElement, element, screenFrame } from './dom';
import { createAcademySprite } from './sprite';

const STARTS: readonly [StartingRoute, AcademyCopyKey, AcademyCopyKey][] = [
    ['lesson-zero', 'startLessonZero', 'startLessonZeroBody'],
    ['manual-band', 'startManual', 'startManualBody'],
    ['placement-mock', 'startMock', 'startMockBody'],
];

const BANDS: readonly [JlptBand, AcademyCopyKey, AcademyCopyKey][] = [
    ['n5', 'bandN5', 'bandN5Body'],
    ['n4', 'bandN4', 'bandN4Body'],
    ['n3', 'bandN3', 'bandN3Body'],
    ['n2', 'bandN2', 'bandN2Body'],
    ['n1', 'bandN1', 'bandN1Body'],
];

export function renderStartScreen(
    language: AcademyLanguage,
    onChoose: (route: StartingRoute) => void | Promise<void>,
    onPreview?: (route: StartingRoute) => void,
): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-start-screen',
        plate: 'classroom',
        eyebrow: 'startEyebrow',
        title: 'startTitle',
        body: 'startBody',
    });
    screen.dataset.academyRoute = 'start';
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(language));
    const choices = element('div', 'academy-route-choices');
    const error = copyElement('p', 'academy-start-choice-error', language, 'startChoiceError');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const buttons: HTMLButtonElement[] = [];
    let choosing = false;
    STARTS.forEach(([route, title, body], index) => {
        const button = element('button', 'academy-route-choice');
        button.type = 'button';
        button.dataset.startRoute = route;
        button.setAttribute('aria-label', `${academyText(language, title)}. ${academyText(language, body)}`);
        const number = element('span', 'academy-route-number');
        number.textContent = String(index + 1).padStart(2, '0');
        number.setAttribute('aria-hidden', 'true');
        button.append(
            number,
            copyElement('span', 'academy-route-title', language, title),
            copyElement('span', 'academy-route-description', language, body),
        );
        button.addEventListener('focus', () => onPreview?.(route));
        button.addEventListener('click', async () => {
            if (choosing) return;
            choosing = true;
            screen.dataset.choicePending = route;
            error.hidden = true;
            buttons.forEach(choice => { choice.disabled = true; });
            try {
                await onChoose(route);
            } catch {
                choosing = false;
                delete screen.dataset.choicePending;
                buttons.forEach(choice => { choice.disabled = false; });
                error.hidden = false;
                button.focus();
            }
        });
        buttons.push(button);
        choices.append(button);
    });
    content.append(choices, error);
    return screen;
}

export function renderManualBandScreen(
    language: AcademyLanguage,
    onChoose: (band: JlptBand) => void | Promise<void>,
    onBack: () => void | Promise<void>,
    onPreview?: (band: JlptBand) => void,
): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-band-screen',
        plate: 'classroom',
        title: 'manualTitle',
        body: 'manualBody',
    });
    screen.dataset.academyRoute = 'manual-band';
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(language));
    const choices = element('div', 'academy-band-choices');
    const hint = copyElement('p', 'academy-band-hint', language, 'manualHint');
    const error = copyElement('p', 'academy-start-choice-error', language, 'manualChoiceError');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const buttons: HTMLButtonElement[] = [];
    let choosing = false;
    BANDS.forEach(([band, title, body]) => {
        const button = element('button', 'academy-band-choice');
        button.type = 'button';
        button.dataset.band = band;
        button.setAttribute('aria-label', `${band.toUpperCase()}. ${academyText(language, title)}. ${academyText(language, body)}`);
        const code = element('span', 'academy-band-code');
        code.textContent = band.toUpperCase();
        code.setAttribute('aria-hidden', 'true');
        button.append(
            code,
            copyElement('span', 'academy-band-title', language, title),
            copyElement('span', 'academy-band-description', language, body),
        );
        button.addEventListener('focus', () => onPreview?.(band));
        button.addEventListener('click', async () => {
            if (choosing) return;
            choosing = true;
            screen.dataset.choicePending = band;
            error.hidden = true;
            buttons.forEach(choice => { choice.disabled = true; });
            try {
                await onChoose(band);
            } catch {
                choosing = false;
                delete screen.dataset.choicePending;
                buttons.forEach(choice => { choice.disabled = false; });
                error.hidden = false;
                button.focus();
            }
        });
        buttons.push(button);
        choices.append(button);
    });
    const back = backButton(language);
    back.addEventListener('click', () => {
        if (!choosing) void onBack();
    });
    content.append(choices, hint, error, back);
    return screen;
}

export { BANDS as ACADEMY_BANDS };

function rieGuide(language: AcademyLanguage): HTMLElement {
    const cutout = element('div', 'academy-guide-cutout');
    cutout.append(createAcademySprite({
        characterId: 'rie',
        alt: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        className: 'academy-guide-character',
        expressions: { neutral: { still: ACADEMY_ASSETS.rie } },
    }));
    return cutout;
}
