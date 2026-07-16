import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { constructedResponseActivityPlugin, type ConstructedResponseActivityModel } from '../activities/constructed-response';
import { ACADEMY_ASSETS } from '../assets';
import { createActivityRuntime, type ActivityController, type ActivityEvaluation } from '../domain/activity-runtime';
import { createAcademyVnStage, type AcademyVnLine, type AcademyVnSlotContent } from './vn-stage';

export interface AakashMeetScreenOptions {
    readonly language: AcademyLanguage;
    readonly activity: ConstructedResponseActivityModel;
    readonly completed: boolean;
    readonly onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onSupportUse?: (support: Readonly<{ activityId: string; supportKind: 'hint'; choiceId: string }>) => void | Promise<void>;
    readonly onContinue: () => void;
}

/** A complete character beat behind the existing AcademyApp interface. */
export function renderAakashMeetScreen(options: AakashMeetScreenOptions): HTMLElement {
    const lifecycle = new AbortController();
    const stage = createAcademyVnStage({ label: options.language === 'ja' ? '雨の中の道案内' : 'Directions in the rain' });
    const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
    let controller: ActivityController | null = null;
    let passed = options.completed;

    stage.element.classList.add('academy-aakash-directions-vn');
    stage.element.dataset.academyScreen = 'aakash-directions-vn';
    stage.element.dataset.sceneTransition = 'rainy-directions';
    stage.setDirection({
        plate: {
            id: 'cafe-rain',
            wide: ACADEMY_ASSETS.locations.cafe.wide,
            mobile: ACADEMY_ASSETS.locations.cafe.mobile,
            label: options.language === 'ja' ? '雨のカフェ前' : 'Outside the cafe in the rain',
        },
        transition: 'dissolve',
        focus: { x: 52, y: 48 },
    });
    stage.setCast([{
        characterId: 'aakash',
        displayName: 'Aakash',
        alt: options.language === 'ja' ? '雨の中で道を尋ねるAakash' : 'Aakash asking for directions in the rain',
        position: 'left',
        expression: 'neutral',
        expressions: { neutral: { still: ACADEMY_ASSETS.characters.aakash } },
    }]);

    const reading = (id: string): AcademyVnLine['reading'] => ({
        showLabel: options.language === 'ja' ? '読み方' : 'Readings',
        hideLabel: options.language === 'ja' ? '読み方を隠す' : 'Hide readings',
        onChange(visible) {
            if (!visible) return;
            void options.onSupportUse?.({ activityId: options.activity.id, supportKind: 'hint', choiceId: `reading:${id}` });
        },
    });

    const setQuestion = (): void => {
        stage.setLine({
            id: 'aakash-directions:question',
            speakerId: 'aakash',
            speakerName: 'Aakash',
            japanese: 'カフェはどこですか。',
            reading: reading('question'),
        });
    };

    const showResolution = (): void => {
        passed = true;
        stage.setLine({
            id: 'aakash-directions:thanks',
            speakerId: 'aakash',
            speakerName: 'Aakash',
            japanese: '分かりました。ありがとうございます。',
            reading: reading('thanks'),
            ...(options.language === 'en'
                ? { translation: 'Got it. Thank you.', translationEarned: true }
                : {}),
        });
        stage.setAction(continueAction(options, lifecycle.signal));
    };

    const mountResponse = (): void => {
        const hostElement = document.createElement('div');
        hostElement.className = 'academy-aakash-response-host';
        controller = runtime.mount(options.activity, {
            language: options.language,
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) {
                stage.element.dispatchEvent(new CustomEvent('academy:announce', { bubbles: true, detail: { message } }));
            },
            recordSupportUse: options.onSupportUse,
        }, async evaluation => {
            await options.onEvaluation(evaluation);
            if (evaluation.result.outcome !== 'pass' || passed) return;
            passed = true;
            stage.setLine({
                id: 'aakash-directions:thanks',
                speakerId: 'aakash',
                speakerName: 'Aakash',
                japanese: '分かりました。ありがとうございます。',
                reading: reading('thanks'),
                ...(options.language === 'en'
                    ? { translation: 'Got it. Thank you.', translationEarned: true }
                    : {}),
            });
            const action = continueButton(options, lifecycle.signal);
            hostElement.replaceChildren(action);
            action.focus();
        });
        stage.setAction({
            element: hostElement,
            dispose() {
                controller?.dispose();
                controller = null;
            },
        });
        controller.focus();
    };

    setQuestion();
    if (options.completed) showResolution();
    else mountResponse();
    stage.element.addEventListener('academy:dispose', () => lifecycle.abort(), { once: true });

    return stage.element;
}

function continueAction(options: AakashMeetScreenOptions, signal: AbortSignal): AcademyVnSlotContent {
    return { element: continueButton(options, signal) };
}

function continueButton(options: AakashMeetScreenOptions, signal: AbortSignal): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-vn-primary-action academy-aakash-continue';
    button.textContent = academyText(options.language, 'aakashContinue');
    button.addEventListener('click', options.onContinue, { once: true, signal });
    return button;
}
