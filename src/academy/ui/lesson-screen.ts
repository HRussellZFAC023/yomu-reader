import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { choiceActivityPlugin } from '../activities/choice';
import { createOpeningKanjiActivity, kanjiWritingActivityPlugin } from '../activities/kanji-writing';
import { createOpeningForkActivity, type LessonFork, type VerticalSliceContent } from '../content/vertical-slice';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import type { JlptBand } from '../domain/learner-record';
import type { Disposable, KanjiWritingModel, PronunciationService } from '../integration/yomu-bridge';
import { copyButton, copyElement, element, screenFrame } from './dom';
import { createAcademySprite, setAcademySpriteExpression } from './sprite';

export type { LessonFork };

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
    panel.classList.add('academy-guide-panel');
    const bandBadge = element('strong', 'academy-band-badge');
    bandBadge.textContent = band.toUpperCase();
    const button = copyButton(language, 'bridgeContinue', 'academy-button academy-button-primary');
    button.addEventListener('click', onContinue);
    content.append(bandBadge, button);
    panel.prepend(rieGuide(language));
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
    });
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(language));
    const choices = element('div', 'academy-fork-grid');
    const forks = [
        ['sound', 'forkSound', 'forkSoundBody'],
        ['text', 'forkText', 'forkTextBody'],
        ['speaking', 'forkSpeaking', 'forkSpeakingBody'],
    ] as const;
    forks.forEach(([fork, title, outcome], index) => {
        const button = element('button', 'academy-route-choice academy-fork-choice');
        button.type = 'button';
        button.dataset.fork = fork;
        button.toggleAttribute('aria-pressed', selected === fork);
        button.setAttribute('aria-label', `${academyText(language, title)}. ${academyText(language, outcome)}`);
        const marker = element('span', 'academy-fork-marker');
        marker.textContent = String(index + 1).padStart(2, '0');
        marker.setAttribute('aria-hidden', 'true');
        button.append(
            marker,
            copyElement('span', 'academy-fork-label', language, title),
            copyElement('span', 'academy-fork-outcome', language, outcome),
        );
        button.addEventListener('click', () => onChoose(fork));
        choices.append(button);
    });
    content.append(choices);
    return screen;
}

export function renderSourceActivityScreen(
    language: AcademyLanguage,
    sourceContent: VerticalSliceContent,
    fork: LessonFork,
    pronunciation: PronunciationService,
    onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>,
    onContinue: () => void,
    returning = false,
    onSupportUse?: (support: Readonly<{ activityId: string; supportKind: 'hint'; choiceId: string }>) => void | Promise<void>,
): HTMLElement {
    const missionRoute = {
        sound: { locationId: 'location:language-lab', plate: 'languageLab' },
        text: { locationId: 'location:library', plate: 'library' },
        speaking: { locationId: 'location:classroom-entrance', plate: 'entrance' },
    } as const satisfies Record<LessonFork, { locationId: string; plate: 'languageLab' | 'library' | 'entrance' }>;
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-source-screen',
        plate: missionRoute[fork].plate,
        eyebrow: 'sourceEyebrow',
        title: 'sourceTitle',
        body: 'sourceBody',
    });
    panel.classList.add('academy-guide-panel');
    const rieStage = rieGuide(language);
    const rieSprite = rieStage.querySelector<HTMLPictureElement>('.academy-sprite');
    panel.prepend(rieStage);
    screen.dataset.fork = fork;
    screen.dataset.locationId = missionRoute[fork].locationId;
    const prelude = element('section', 'academy-fork-prelude');
    prelude.dataset.fork = fork;
    const preludeCopy = fork === 'sound' ? 'sourceForkSoundIntro'
        : fork === 'text' ? 'sourceForkTextIntro'
            : 'sourceForkSpeakingIntro';
    prelude.append(copyElement('p', 'academy-fork-prelude-copy', language, preludeCopy));
    const activityHost = element('div', 'academy-activity-host');
    activityHost.hidden = fork !== 'text';
    const completion = element('div', 'academy-source-completion');
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const activity = createOpeningForkActivity(sourceContent.activity, fork);
    const controller = runtime.mount(activity, {
        replace(view) { activityHost.replaceChildren(view); },
        language,
        recordSupportUse: onSupportUse,
        announce(message) {
            const live = activityHost.querySelector<HTMLElement>('[role="status"]');
            if (live) live.setAttribute('aria-label', message);
        },
        react(reaction) {
            if (reaction.speakerId === 'rie' && rieSprite) setAcademySpriteExpression(rieSprite, reaction.expression);
        },
    }, async evaluation => {
        await onEvaluation(evaluation);
        if (evaluation.result.outcome !== 'pass') return;
        const note = copyElement('p', 'academy-success-note', language, 'sourceComplete');
        const directions = copyElement('p', 'academy-directions-setup', language, 'sourceDirectionsSetup');
        const next = copyButton(language, returning ? 'sourceReturn' : 'sourceContinue', 'academy-button academy-button-primary');
        next.addEventListener('click', onContinue);
        completion.replaceChildren(note, directions, next);
    });
    let playback: Disposable | null = null;
    const revealActivity = () => {
        activityHost.hidden = false;
        prelude.classList.add('is-ready');
        controller.focus();
    };
    if (fork === 'sound') {
        const play = copyButton(language, 'sourceForkSoundPlay', 'academy-button academy-button-secondary');
        const status = element('span', 'academy-field-error');
        status.setAttribute('role', 'status');
        play.addEventListener('click', () => {
            playback?.dispose();
            play.disabled = true;
            status.textContent = '';
            void pronunciation.play('では、教科書の五ページを開いて、二人で話してください。').then(active => {
                playback = active;
                revealActivity();
            }).catch(() => {
                status.textContent = academyText(language, 'sourceForkAudioUnavailable');
                revealActivity();
            }).finally(() => { play.disabled = false; });
        });
        prelude.append(play, status);
    } else if (fork === 'text') {
        const board = element('blockquote', 'academy-fork-board-line');
        board.lang = 'ja';
        board.dataset.yomuRuntimeSurface = 'academy-fork-board';
        board.dataset.yomuFuriganaMode = 'all';
        board.textContent = '教科書の五ページを開いてください。';
        prelude.append(board);
    } else {
        const tried = copyButton(language, 'sourceForkSpeakingTried', 'academy-button academy-button-secondary');
        tried.addEventListener('click', () => {
            tried.disabled = true;
            revealActivity();
        });
        prelude.append(tried);
    }
    const source = element('details', 'academy-source-record');
    source.append(copyElement('summary', '', language, 'sourceRecordSummary'));
    const line = copyElement('p', '', language, 'sourceRecordLine');
    const sourceText = element('blockquote', 'academy-source-quote');
    void sourceContent.sourceLibrary.getQuestion('source-question:classroom-phrase-09').then(question => {
        sourceText.textContent = question.prompt.ja;
        sourceText.lang = 'ja';
        sourceText.dataset.yomuRuntimeSurface = 'academy-source-question';
        sourceText.dataset.yomuFuriganaMode = 'all';
    });
    source.append(line, sourceText);
    content.append(prelude, activityHost, completion, source);
    screen.addEventListener('academy:dispose', () => {
        playback?.dispose();
        controller.dispose();
    }, { once: true });
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
        if (!evaluation.result.errorTags.includes('kanji-reading-recalled')) return;
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
    panel.classList.add('academy-guide-panel');
    panel.prepend(rieGuide(language));
    const line = element('blockquote', 'academy-memory-line');
    line.lang = 'ja';
    line.dataset.speaker = 'rie';
    line.textContent = '「こんばんは。ここ、空いていますよ。」';
    const support = element('p', 'academy-support');
    support.lang = 'en';
    support.textContent = '“Good evening. This seat is free.”';
    const close = copyButton(language, 'memoryReturn', 'academy-button academy-button-primary');
    close.addEventListener('click', onClose);
    content.append(line, support, close);
    return screen;
}

function rieGuide(language: AcademyLanguage): HTMLElement {
    const cutout = element('div', 'academy-guide-cutout');
    cutout.dataset.speakerStage = 'rie';
    cutout.append(createAcademySprite({
        characterId: 'rie',
        alt: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        className: 'academy-guide-character academy-character-rie',
        expressions: rieExpressionSources(),
    }));
    return cutout;
}

function rieExpressionSources() {
    const neutral = { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.neutral } as const;
    const encouraging = { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.encouraging } as const;
    return { neutral, encouraging, happy: encouraging, repair: neutral };
}
