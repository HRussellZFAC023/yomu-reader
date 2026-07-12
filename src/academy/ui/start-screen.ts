import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import type { JlptBand, StartingRoute } from '../domain/learner-record';
import { copyButton, copyElement, element, screenFrame } from './dom';

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
    onChoose: (route: StartingRoute) => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-start-screen',
        plate: 'classroom',
        eyebrow: 'startEyebrow',
        title: 'startTitle',
        body: 'startBody',
    });
    const choices = element('div', 'academy-route-choices');
    STARTS.forEach(([route, title, body]) => {
        const button = copyButton(language, title, 'academy-route-choice');
        button.dataset.startRoute = route;
        button.append(copyElement('span', 'academy-route-description', language, body));
        button.addEventListener('click', () => onChoose(route));
        choices.append(button);
    });
    content.append(choices);
    return screen;
}

export function renderManualBandScreen(
    language: AcademyLanguage,
    onChoose: (band: JlptBand) => void,
    onBack: () => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-band-screen',
        plate: 'classroom',
        title: 'manualTitle',
        body: 'manualBody',
    });
    const choices = element('div', 'academy-band-choices');
    BANDS.forEach(([band, label]) => {
        const button = copyButton(language, label, 'academy-band-choice');
        button.dataset.band = band;
        button.addEventListener('click', () => onChoose(band));
        choices.append(button);
    });
    const back = copyButton(language, 'back', 'academy-button academy-button-quiet');
    back.addEventListener('click', onBack);
    content.append(choices, back);
    return screen;
}

export { BANDS as ACADEMY_BANDS };
