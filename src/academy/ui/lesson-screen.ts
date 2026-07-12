import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { choiceActivityPlugin } from '../activities/choice';
import { createOpeningKanjiActivity, kanjiWritingActivityPlugin } from '../activities/kanji-writing';
import type { VerticalSliceContent } from '../content/vertical-slice';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import type { JlptBand } from '../domain/learner-record';
import type { KanjiWritingModel } from '../integration/yomu-bridge';
import { copyButton, copyElement, element, screenFrame } from './dom';

export type LessonFork = 'sound' | 'text' | 'speaking';

export function renderArrivalBridge(
    language: AcademyLanguage,
    band: JlptBand,
    onContinue: () => void,
): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-bridge-screen',
        plate: 'classroom',
        eyebrow: 'bridgeEyebrow',
        title: 'bridgeTitle',
        body: 'bridgeBody',
    });
    panel.classList.add('academy-panel-with-character');
    const rie = characterImage(language);
    const bandBadge = element('strong', 'academy-band-badge');
    bandBadge.textContent = band.toUpperCase();
    const button = copyButton(language, 'bridgeContinue', 'academy-button academy-button-primary');
    button.addEventListener('click', onContinue);
    content.append(bandBadge, button);
    panel.prepend(rie);
    return screen;
}

export function renderLessonFork(
    language: AcademyLanguage,
    selected: LessonFork | undefined,
    onChoose: (fork: LessonFork) => void,
): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-lesson-fork-screen',
        plate: 'classroom',
        eyebrow: 'lessonForkEyebrow',
        title: 'lessonForkTitle',
        body: 'lessonForkBody',
    });
    panel.classList.add('academy-panel-with-character');
    panel.prepend(characterImage(language));
    const choices = element('div', 'academy-fork-grid');
    const forks = [
        ['sound', 'forkSound', 'forkSoundBody'],
        ['text', 'forkText', 'forkTextBody'],
        ['speaking', 'forkSpeaking', 'forkSpeakingBody'],
    ] as const;
    forks.forEach(([fork, title, body]) => {
        const button = copyButton(language, title, 'academy-route-choice academy-fork-choice');
        button.dataset.fork = fork;
        button.toggleAttribute('aria-pressed', selected === fork);
        button.append(copyElement('span', 'academy-route-description', language, body));
        button.addEventListener('click', () => onChoose(fork));
        choices.append(button);
    });
    content.append(choices);
    return screen;
}

export function renderSourceActivityScreen(
    language: AcademyLanguage,
    sourceContent: VerticalSliceContent,
    onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>,
    onContinue: () => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-source-screen',
        plate: 'classroom',
        eyebrow: 'sourceEyebrow',
        title: 'sourceTitle',
        body: 'sourceBody',
    });
    const activityHost = element('div', 'academy-activity-host');
    const completion = element('div', 'academy-source-completion');
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = runtime.mount(sourceContent.activity, {
        replace(view) { activityHost.replaceChildren(view); },
        announce(message) {
            const live = activityHost.querySelector<HTMLElement>('[role="status"]');
            if (live) live.setAttribute('aria-label', message);
        },
    }, async evaluation => {
        await onEvaluation(evaluation);
        if (evaluation.result.outcome !== 'pass') return;
        const note = copyElement('p', 'academy-success-note', language, 'sourceComplete');
        const next = copyButton(language, 'sourceContinue', 'academy-button academy-button-primary');
        next.addEventListener('click', onContinue);
        completion.replaceChildren(note, next);
    });
    const source = element('details', 'academy-source-record');
    source.append(copyElement('summary', '', language, 'sourceRecordSummary'));
    const line = copyElement('p', '', language, 'sourceRecordLine');
    const sourceText = element('blockquote', 'academy-source-quote');
    void sourceContent.sourceLibrary.getQuestion('source-question:classroom-phrase-09').then(question => {
        sourceText.textContent = language === 'ja' ? question.prompt.ja : `${question.prompt.ja} — ${question.prompt.en}`;
        sourceText.lang = language === 'ja' ? 'ja' : '';
    });
    source.append(line, sourceText);
    content.append(activityHost, completion, source);
    screen.addEventListener('academy:dispose', () => controller.dispose(), { once: true });
    return screen;
}

export function renderKanjiDeskScreen(
    language: AcademyLanguage,
    trace: KanjiWritingModel,
    onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>,
    onContinue: () => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-kanji-desk-screen',
        plate: 'writingStudio',
        eyebrow: 'kanjiDeskEyebrow',
        title: 'kanjiDeskTitle',
        body: 'kanjiDeskBody',
    });
    const activityHost = element('div', 'academy-activity-host');
    const completion = element('div', 'academy-source-completion');
    const runtime = createActivityRuntime([kanjiWritingActivityPlugin]);
    const controller = runtime.mount(createOpeningKanjiActivity(trace, language), {
        replace(view) { activityHost.replaceChildren(view); },
        announce(message) {
            const live = activityHost.querySelector<HTMLElement>('[role="status"]');
            if (live) live.setAttribute('aria-label', message);
        },
    }, async evaluation => {
        await onEvaluation(evaluation);
        if (!evaluation.result.errorTags.includes('kanji-writing-complete')) return;
        const note = copyElement('p', 'academy-success-note', language, 'kanjiDeskComplete');
        const next = copyButton(language, 'kanjiDeskContinue', 'academy-button academy-button-primary');
        next.addEventListener('click', onContinue);
        completion.replaceChildren(note, next);
    });
    content.append(activityHost, completion);
    screen.addEventListener('academy:dispose', () => controller.dispose(), { once: true });
    return screen;
}

export function renderOpeningMemory(language: AcademyLanguage, onClose: () => void): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-memory-screen',
        plate: 'classroom',
        title: 'memoryTitle',
        body: 'memoryBody',
    });
    panel.classList.add('academy-panel-with-character');
    panel.prepend(characterImage(language));
    const line = element('blockquote', 'academy-memory-line');
    line.lang = 'ja';
    line.textContent = '「こんばんは。ここ、空いていますよ。」';
    const support = element('p', 'academy-support');
    support.lang = 'en';
    support.textContent = '“Good evening. This seat is free.”';
    const close = copyButton(language, 'memoryReturn', 'academy-button academy-button-primary');
    close.addEventListener('click', onClose);
    content.append(line, support, close);
    return screen;
}

function characterImage(language: AcademyLanguage): HTMLImageElement {
    const image = element('img', 'academy-character academy-character-rie');
    image.src = ACADEMY_ASSETS.rie;
    image.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    return image;
}
