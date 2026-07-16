import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { createAcademyVnStage } from './vn-stage';

export interface DayEndSceneOptions {
    readonly language: AcademyLanguage;
    readonly onReturn: () => void;
}

/** A reversible pause in the Academy day. It records navigation, not completion. */
export function renderDayEndScene(options: DayEndSceneOptions): HTMLElement {
    const actionLifecycle = new AbortController();
    const stage = createAcademyVnStage({ label: academyText(options.language, 'dayEndStageLabel') });
    stage.element.dataset.academyScreen = 'day-end';
    stage.element.dataset.academyRoute = 'day-end';
    stage.setDirection({
        plate: {
            id: 'classroom-day-end',
            wide: ACADEMY_ASSETS.locations.classroom.wide,
            mobile: ACADEMY_ASSETS.locations.classroom.mobile,
            label: academyText(options.language, 'dayEndStageLabel'),
        },
        transition: 'dissolve',
        focus: { x: 52, y: 46 },
    });
    stage.setCast([{
        characterId: 'rie',
        displayName: academyText(options.language, 'journalRie'),
        alt: academyText(options.language, 'dayEndRieAlt'),
        position: 'left',
        expression: 'happy',
        expressions: {
            neutral: { still: ACADEMY_ASSETS.rie },
            happy: { still: ACADEMY_ASSETS.rie },
        },
    }]);
    stage.setLine({
        id: 'day-end:goodbye',
        speakerId: 'rie',
        speakerName: academyText(options.language, 'journalRie'),
        japanese: academyText(options.language, 'dayEndLine'),
        reading: {
            showLabel: academyText(options.language, 'readingShow'),
            hideLabel: academyText(options.language, 'readingHide'),
        },
        ...(options.language === 'en'
            ? { translation: academyText(options.language, 'dayEndSupport'), translationEarned: true }
            : {}),
    });

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'academy-vn-primary-action academy-day-end-return';
    action.textContent = academyText(options.language, 'dayEndReturn');
    action.addEventListener('click', options.onReturn, { once: true, signal: actionLifecycle.signal });
    stage.setAction({ element: action, dispose: () => actionLifecycle.abort() });
    return stage.element;
}
