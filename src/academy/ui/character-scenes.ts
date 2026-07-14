import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { copyButton, copyElement, element, screenFrame } from './dom';
import { createAcademySprite } from './sprite';

export { renderAakashMeetScreen } from './aakash-directions-scene';

export function renderRieUnlockScreen(language: AcademyLanguage, onContinue: () => void): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-character-unlock-screen academy-rie-unlock-screen',
        plate: 'classroom',
        eyebrow: 'rieUnlockEyebrow',
        title: 'rieUnlockTitle',
        body: 'rieUnlockBody',
    });
    panel.classList.add('academy-guide-panel', 'academy-character-unlock-panel');
    const rie = rieGuide(language);
    const spokenLine = content.querySelector<HTMLElement>('.academy-lede');
    if (spokenLine) spokenLine.dataset.speaker = 'rie';
    const bond = copyElement('p', 'academy-relationship-seal academy-unlock-seal', language, 'relationshipFirstPage');
    const next = copyButton(language, 'rieUnlockContinue', 'academy-button academy-button-primary');
    next.addEventListener('click', onContinue);
    content.append(bond, next);
    panel.prepend(rie);
    return screen;
}

export function renderAakashMemory(language: AcademyLanguage, onReturn: () => void): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-aakash-memory-screen',
        plate: 'rainyDirections',
        eyebrow: 'aakashMeetEyebrow',
        title: 'aakashMemoryTitle',
        body: 'aakashMemoryBody',
    });
    const cast = screen.querySelector<HTMLImageElement>('.academy-background img');
    if (cast) {
        cast.dataset.character = 'aakash';
        cast.dataset.cast = 'rie aakash';
    }
    const line = element('blockquote', 'academy-memory-line academy-memory-line-japanese');
    line.lang = 'ja';
    line.dataset.yomuRuntimeSurface = 'aakash-memory-line';
    line.textContent = 'この道をまっすぐ行って、右です。';
    const close = copyButton(language, 'aakashMemoryReturn', 'academy-button academy-button-primary');
    close.addEventListener('click', onReturn);
    content.append(line, close);
    return screen;
}

function rieGuide(language: AcademyLanguage): HTMLElement {
    const cutout = element('div', 'academy-guide-cutout');
    cutout.dataset.speakerStage = 'rie';
    cutout.append(createAcademySprite({
        characterId: 'rie',
        alt: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        className: 'academy-guide-character academy-character-rie',
        expressions: { neutral: { still: ACADEMY_ASSETS.rie } },
    }));
    return cutout;
}
