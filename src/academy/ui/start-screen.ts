import { academyText, type AcademyCopyKey, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { JlptBand, StartingRoute } from '../domain/learner-record';
import { backButton, copyButton, copyElement, element, screenFrame } from './dom';
import { createAcademySprite } from './sprite';

const STARTS: readonly [StartingRoute, AcademyCopyKey, AcademyCopyKey][] = [
    ['lesson-zero', 'startLessonZero', 'startLessonZeroBody'],
    ['manual-band', 'startManual', 'startManualBody'],
    ['placement-mock', 'startMock', 'startMockBody'],
];

const BANDS: readonly [JlptBand, AcademyCopyKey][] = [
    ['n5', 'bandN5'],
    ['n4', 'bandN4'],
    ['n3', 'bandN3'],
    ['n2', 'bandN2'],
    ['n1', 'bandN1'],
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
    onChoose: (band: JlptBand) => void,
    onBack: () => void,
): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-band-screen',
        plate: 'classroom',
        title: 'manualTitle',
        body: 'manualBody',
    });
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(language));
    const choices = element('div', 'academy-band-choices');
    BANDS.forEach(([band, label]) => {
        const button = copyButton(language, label, 'academy-band-choice');
        button.dataset.band = band;
        button.addEventListener('click', () => onChoose(band));
        choices.append(button);
    });
    const back = backButton(language);
    back.addEventListener('click', onBack);
    content.append(choices, back);
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
