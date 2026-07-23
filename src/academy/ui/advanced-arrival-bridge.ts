import './advanced-arrival-bridge.css';

import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { AdvancedEntryPlan, AdvancedEntryMode } from '../content/advanced-entry';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import { minnaTrueFalseListeningPlugin } from '../minigames/minna-true-false-listening';
import { backButton, copyButton, copyElement, element, screenFrame } from './dom';
import { createAcademySprite } from './sprite';

export interface AdvancedArrivalBridgeOptions {
    readonly language: AcademyLanguage;
    readonly plan: AdvancedEntryPlan;
    readonly onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onContinue: () => void;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
    readonly onBack?: () => void;
}

export function renderAdvancedArrivalBridge(options: AdvancedArrivalBridgeOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-advanced-arrival-screen',
        plate: 'classroom',
        eyebrow: 'advancedEntryEyebrow',
        title: 'advancedEntryTitle',
        body: 'advancedEntryBody',
    });
    screen.dataset.band = options.plan.band;
    screen.dataset.entryMode = options.plan.mode;
    screen.dataset.storyProgression = 'preserve';
    screen.dataset.learningCheck = 'n3-listening';
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(options.language));

    const mode = copyElement('p', 'academy-advanced-entry-mode', options.language, modeCopy(options.plan.mode));
    mode.dataset.adaptiveReason = options.plan.recommendation.reasons.join(' ');
    const continuity = copyElement('p', 'academy-placement-continuity-note', options.language, 'advancedEntryContinuity');
    const teaching = element('section', 'academy-advanced-entry-teaching');
    teaching.append(
        copyElement('h2', '', options.language, 'advancedEntryTeachingTitle'),
        copyElement('p', '', options.language, options.plan.mode === 'guided' || options.plan.mode === 'repair'
            ? 'advancedEntryTeachingBody'
            : 'advancedEntryIndependentBody'),
    );
    const activityHost = element('div', 'academy-activity-host academy-advanced-entry-activity');
    const completion = element('div', 'academy-source-completion');
    const runtime = createActivityRuntime([minnaTrueFalseListeningPlugin]);
    const controller = runtime.mount(options.plan.activity, {
        language: options.language,
        replace(view) { activityHost.replaceChildren(view); },
        announce(message) {
            const live = activityHost.querySelector<HTMLElement>('[role="status"]');
            if (live) live.setAttribute('aria-label', message);
        },
    }, async evaluation => {
        await options.onEvaluation(evaluation);
        if (evaluation.result.outcome !== 'pass') return;
        const note = copyElement('p', 'academy-success-note', options.language, 'advancedEntryComplete');
        const next = copyButton(options.language, 'advancedEntryContinue', 'academy-button academy-button-primary');
        next.addEventListener('click', options.onContinue);
        completion.replaceChildren(note, next);
        next.focus();
    });

    const audio = activityHost.querySelector<HTMLAudioElement>('audio');
    let listening = false;
    const stopListening = () => {
        if (!listening) return;
        listening = false;
        options.onListeningStop?.();
    };
    if (audio) {
        audio.dataset.audioDelivery = 'source-recording';
        audio.addEventListener('play', () => {
            if (listening) return;
            listening = true;
            options.onListeningStart?.();
        });
        ['pause', 'ended', 'error'].forEach(event => audio.addEventListener(event, stopListening));
    }

    const back = options.onBack ? backButton(options.language) : null;
    back?.addEventListener('click', options.onBack!);
    content.append(mode, continuity, teaching, activityHost, completion, ...(back ? [back] : []));
    screen.addEventListener('academy:dispose', () => {
        if (audio && !audio.paused) audio.pause();
        stopListening();
        controller.dispose();
    }, { once: true });
    return screen;
}

function modeCopy(mode: AdvancedEntryMode): AcademyCopyKey {
    if (mode === 'test-out') return 'advancedEntryModeTestOut';
    if (mode === 'repair') return 'advancedEntryModeRepair';
    if (mode === 'independent') return 'advancedEntryModeIndependent';
    return 'advancedEntryModeGuided';
}

function rieGuide(language: AcademyLanguage): HTMLElement {
    const cutout = element('div', 'academy-guide-cutout');
    cutout.dataset.speakerStage = 'rie';
    const neutral = { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.neutral } as const;
    const encouraging = { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.encouraging } as const;
    cutout.append(createAcademySprite({
        characterId: 'rie',
        alt: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        className: 'academy-guide-character academy-character-rie',
        expressions: { neutral, encouraging, happy: encouraging, repair: neutral },
    }));
    return cutout;
}
