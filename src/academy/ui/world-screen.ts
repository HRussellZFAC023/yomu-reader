import { academyText, type AcademyCopyKey, type AcademyLanguage } from '../../reader/app/academy-copy';
import type { ProtagonistPortraitId } from '../assets';
import { ACADEMY_ASSETS } from '../assets';
import { choiceActivityPlugin, type ChoiceActivityModel } from '../activities/choice';
import type { LessonFork } from '../content/vertical-slice';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import type { LearnerProfileSnapshot, ReviewRating } from '../domain/learner-record';
import type { Disposable, PronunciationService, ReviewQueueItem } from '../integration/yomu-bridge';
import { copyButton, copyElement, element, screenFrame } from './dom';

export type CampusLocation = 'classroom' | 'library' | 'lab' | 'cafe';

const LOCATIONS: readonly [CampusLocation, AcademyCopyKey, AcademyCopyKey][] = [
    ['classroom', 'locationClassroom', 'locationClassroomBody'],
    ['library', 'locationLibrary', 'locationLibraryBody'],
    ['lab', 'locationLab', 'locationLabBody'],
    ['cafe', 'locationCafe', 'locationCafeBody'],
];

export function renderCampusScreen(
    language: AcademyLanguage,
    reviewComplete: boolean,
    onEnter: (location: CampusLocation) => void,
    preference?: LessonFork,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-campus-screen',
        plate: 'entrance',
        title: 'campusTitle',
    });
    screen.dataset.preference = preference ?? 'none';
    const preferredLocation: CampusLocation | undefined = preference === 'sound' ? 'lab'
        : preference === 'text' ? 'library'
            : preference === 'speaking' ? 'cafe'
                : undefined;
    if (!preference) {
        content.append(copyElement(
            'p',
            'academy-objective',
            language,
            reviewComplete ? 'campusObjectiveComplete' : 'campusObjective',
        ));
    }
    const map = element('div', 'academy-place-map');
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', academyText(language, 'mapLabel'));
    map.append(routeNetwork(), mapEntrance(language));
    const minimap = createMinimap(language, 'mapEntrance', 'mapChoose');
    let travelTimer = 0;
    LOCATIONS.forEach(([location, title, body]) => {
        const locked = !reviewComplete && (location === 'lab' || location === 'cafe') && location !== preferredLocation;
        const button = copyButton(language, title, `academy-location academy-location-${location}`);
        button.dataset.location = location;
        button.disabled = locked;
        button.append(copyElement('span', 'academy-location-purpose', language, locked ? 'locationUnavailable' : body));
        const showDestination = () => {
            minimap.destination.textContent = academyText(language, title);
            minimap.root.dataset.destination = location;
            map.dataset.destination = location;
        };
        const clearDestination = () => {
            if (screen.dataset.traveling) return;
            minimap.destination.textContent = academyText(language, 'mapChoose');
            delete minimap.root.dataset.destination;
            delete map.dataset.destination;
        };
        button.addEventListener('pointerenter', showDestination);
        button.addEventListener('pointerleave', clearDestination);
        button.addEventListener('focus', showDestination);
        button.addEventListener('blur', clearDestination);
        button.addEventListener('click', () => {
            if (screen.dataset.traveling) return;
            showDestination();
            screen.dataset.traveling = location;
            map.querySelectorAll<HTMLButtonElement>('.academy-location').forEach(candidate => { candidate.disabled = true; });
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
            if (reduceMotion) {
                onEnter(location);
                return;
            }
            travelTimer = window.setTimeout(() => onEnter(location), 360);
        });
        map.append(button);
    });
    content.append(map);
    screen.append(minimap.root);
    screen.addEventListener('academy:dispose', () => window.clearTimeout(travelTimer), { once: true });
    return screen;
}

export function renderLocationScreen(
    language: AcademyLanguage,
    location: Exclude<CampusLocation, 'library' | 'lab'>,
    onBack: () => void,
): HTMLElement {
    const definition = LOCATIONS.find(([id]) => id === location);
    if (!definition) throw new Error(`Unknown campus location: ${location}`);
    const [, title, body] = definition;
    const plate = location === 'cafe' ? 'cafe' : 'classroom';
    const { screen, content } = screenFrame({ language, className: `academy-location-screen academy-${location}-screen`, plate, title, body });
    const back = copyButton(language, 'locationReturn', 'academy-button academy-button-primary');
    back.addEventListener('click', onBack);
    content.append(back);
    screen.append(createMinimap(language, title).root);
    return screen;
}

const LAB_LINE = 'もう一度お願いします。';

export function renderLanguageLabScreen(
    language: AcademyLanguage,
    pronunciation: PronunciationService,
    state: Readonly<{ transcriptRevealed: boolean; listeningPassed: boolean; shadowed: boolean }>,
    onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>,
    onShadowed: () => void | Promise<void>,
    onBack: () => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-location-screen academy-lab-screen',
        plate: 'languageLab',
        eyebrow: 'labEyebrow',
        title: 'labTitle',
        body: 'labBody',
    });
    screen.append(createMinimap(language, 'locationLab').root);
    const audioRow = element('div', 'academy-lab-audio');
    const play = copyButton(language, 'labPlay', 'academy-button academy-button-secondary');
    const timecode = copyElement('span', 'academy-lab-timecode', language, 'labTimecode');
    const audioStatus = element('span', 'academy-field-error');
    audioStatus.setAttribute('role', 'status');
    audioRow.append(play, timecode, audioStatus);

    const activityHost = element('div', 'academy-activity-host');
    const transcript = element('section', 'academy-lab-transcript');
    transcript.append(copyElement('h2', '', language, 'labTranscriptTitle'));
    const transcriptLine = element('p');
    transcriptLine.lang = 'ja';
    transcriptLine.dataset.yomuRuntimeSurface = 'listening-transcript';
    transcriptLine.dataset.yomuFuriganaMode = 'all';
    transcriptLine.textContent = LAB_LINE;
    transcript.append(transcriptLine);

    const shadow = element('section', 'academy-lab-shadow');
    shadow.append(copyElement('h2', '', language, 'labShadowTitle'), copyElement('p', '', language, 'labShadowPrompt'));
    const shadowDone = copyButton(language, 'labShadowDone', 'academy-button academy-button-primary');
    const shadowStatus = element('p', 'academy-success-note');
    shadowDone.disabled = state.shadowed;
    if (state.shadowed) shadowStatus.textContent = language === 'ja' ? 'シャドーイングを記録しました。' : 'Shadowing evidence recorded.';
    shadowDone.addEventListener('click', () => {
        shadowDone.disabled = true;
        void Promise.resolve(onShadowed()).then(() => {
            shadowStatus.textContent = language === 'ja' ? 'シャドーイングを記録しました。' : 'Shadowing evidence recorded.';
        });
    });
    shadow.append(shadowDone, shadowStatus);

    const back = copyButton(language, 'locationReturn', 'academy-button academy-button-quiet');
    back.addEventListener('click', onBack);
    content.append(audioRow);
    if (state.transcriptRevealed) content.append(transcript);
    content.append(activityHost);
    if (state.listeningPassed) content.append(shadow);
    content.append(back);

    let playback: Disposable | null = null;
    let playbackRequest = 0;
    let disposed = false;
    play.addEventListener('click', () => {
        const request = ++playbackRequest;
        playback?.dispose();
        playback = null;
        play.disabled = true;
        audioStatus.textContent = '';
        void pronunciation.play(LAB_LINE).then(active => {
            if (disposed || request !== playbackRequest) {
                active.dispose();
                return;
            }
            playback = active;
        }).catch(() => {
            if (!disposed && request === playbackRequest) {
                audioStatus.textContent = language === 'ja'
                    ? 'このブラウザでは日本語音声を再生できません。'
                    : 'Japanese browser speech is unavailable.';
            }
        }).finally(() => {
            if (!disposed && request === playbackRequest) play.disabled = false;
        });
    });

    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = state.listeningPassed ? null : runtime.mount(languageLabActivity(), {
        replace(view) { activityHost.replaceChildren(view); },
        announce(message) { audioStatus.setAttribute('aria-label', message); },
    }, onEvaluation);
    if (state.listeningPassed) activityHost.append(copyElement('p', 'academy-success-note', language, 'labListeningComplete'));
    screen.addEventListener('academy:dispose', () => {
        disposed = true;
        playbackRequest += 1;
        playback?.dispose();
        controller?.dispose();
    }, { once: true });
    return screen;
}

function languageLabActivity(): ChoiceActivityModel {
    return {
        id: 'activity:language-lab-repeat-listening',
        kind: 'choice',
        sourceQuestionId: 'source-question:classroom-phrase-09',
        conceptIds: ['concept:classroom-repair-repeat'],
        responseKind: 'choice',
        prompt: {
            en: 'Listen before opening the transcript. What does the line ask for?',
            ja: '答える前に音声を聞いてください。何をお願いしていますか。',
        },
        payload: {
            reviewSeedId: 'review:language-lab-repeat',
            reviewContent: {
                expression: LAB_LINE,
                reading: 'もういちどおねがいします',
                meanings: ['Please say it again.'],
            },
            options: [
                {
                    id: 'repeat',
                    label: { en: 'Please say it again.', ja: 'もう一度言ってください。' },
                    correct: true,
                    explanation: { en: 'Correct: もう一度 asks for one more repetition.', ja: '正解です。「もう一度」は、もう一回繰り返すよう頼みます。' },
                },
                {
                    id: 'write',
                    label: { en: 'Please write it.', ja: '書いてください。' },
                    correct: false,
                    errorTag: 'listening-action-confusion',
                    explanation: { en: 'No writing action appears in the line.', ja: 'この文には「書く」という動作はありません。' },
                    repairPrompt: { en: 'Listen for もう一度: “one more time”.', ja: '「もう一度」（one more time）を聞き取ってください。' },
                    nearbyExample: { en: 'もう一度言ってください also asks someone to say it again.', ja: '「もう一度言ってください」も、繰り返しを頼む表現です。' },
                },
                {
                    id: 'wait',
                    label: { en: 'Please wait.', ja: '待ってください。' },
                    correct: false,
                    errorTag: 'listening-action-confusion',
                    explanation: { en: 'The line asks for repetition, not waiting.', ja: '待つのではなく、繰り返しを頼んでいます。' },
                    repairPrompt: { en: 'Listen for もう一度: “one more time”.', ja: '「もう一度」（one more time）を聞き取ってください。' },
                    nearbyExample: { en: 'ちょっと待ってください means “Please wait a moment.”', ja: '「ちょっと待ってください」は「少し待ってください」という意味です。' },
                },
            ],
        },
    };
}

export function renderReviewScreen(
    language: AcademyLanguage,
    items: readonly ReviewQueueItem[],
    onRate: (item: ReviewQueueItem, rating: ReviewRating) => Promise<void>,
    onReturn: () => void,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-review-screen',
        plate: 'library',
        title: 'reviewTitle',
    });
    screen.append(createMinimap(language, 'locationLibrary').root);
    const cardHost = element('div', 'academy-review-host');
    let index = 0;
    const show = () => {
        const item = items[index];
        if (!item) {
            const empty = copyElement('p', 'academy-lede', language, items.length ? 'reviewComplete' : 'reviewEmpty');
            const back = copyButton(language, 'reviewReturn', 'academy-button academy-button-primary');
            back.addEventListener('click', onReturn);
            cardHost.replaceChildren(empty, back);
            return;
        }
        const prompt = copyElement('p', 'academy-eyebrow', language, 'reviewPrompt');
        const expression = element('p', 'academy-review-expression');
        expression.lang = 'ja';
        expression.textContent = item.expression;
        const answer = element('div', 'academy-review-answer');
        answer.hidden = true;
        const reading = element('p', 'academy-review-reading');
        reading.lang = 'ja';
        reading.textContent = item.reading ?? item.expression;
        const meaning = element('p', 'academy-review-meaning');
        meaning.textContent = item.meaning ?? '';
        const ratings = element('div', 'academy-review-ratings');
        ([['again', 'reviewAgain'], ['hard', 'reviewHard'], ['good', 'reviewGood'], ['easy', 'reviewEasy']] as const)
            .forEach(([rating, key]) => {
                const button = copyButton(language, key, 'academy-rating-button');
                button.dataset.rating = rating;
                button.addEventListener('click', () => {
                    ratings.querySelectorAll('button').forEach(candidate => { (candidate as HTMLButtonElement).disabled = true; });
                    void onRate(item, rating).then(() => { index += 1; show(); });
                });
                ratings.append(button);
            });
        answer.append(reading, meaning, ratings);
        const reveal = copyButton(language, 'reviewReveal', 'academy-button academy-button-secondary');
        reveal.addEventListener('click', () => { answer.hidden = false; reveal.remove(); });
        cardHost.replaceChildren(prompt, expression, reveal, answer);
    };
    show();
    content.append(cardHost);
    return screen;
}

export function renderJournalScreen(
    language: AcademyLanguage,
    profile: LearnerProfileSnapshot,
    state: Readonly<{ rieChapters: readonly number[]; aakashChapters: readonly number[]; aakashUnlocked: boolean }>,
    callbacks: Readonly<{ onReplayRie: () => void; onReplayAakash: () => void }>,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-journal-screen',
        plate: 'classroom',
        title: 'journalTitle',
    });
    const profileCard = element('article', 'academy-journal-profile academy-player-profile');
    const portrait = element('img', 'academy-journal-portrait');
    portrait.src = ACADEMY_ASSETS.portraits[profile.portraitId as ProtagonistPortraitId] ?? ACADEMY_ASSETS.portraits['quality-2'];
    portrait.alt = profile.displayName;
    const profileCopy = element('div', 'academy-journal-copy');
    const name = element('h2');
    name.textContent = profile.displayName;
    const reasonLabel = copyElement('span', 'academy-eyebrow', language, 'journalReason');
    const reason = element('p');
    reason.textContent = profile.learningReason;
    profileCopy.append(name, reasonLabel, reason);
    profileCard.append(portrait, profileCopy);
    const rieCard = element('article', 'academy-journal-profile academy-journal-rie');
    const rie = element('img', 'academy-journal-portrait');
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    rie.dataset.character = 'rie';
    const rieCopy = element('div', 'academy-journal-copy');
    const rieLine = copyElement('blockquote', '', language, 'journalRieLine');
    rieLine.dataset.speaker = 'rie';
    rieCopy.append(
        copyElement('h2', '', language, 'journalRie'),
        relationshipPages(language, state.rieChapters),
        rieLine,
    );
    const replay = copyButton(language, 'journalReplay', 'academy-button academy-button-secondary');
    replay.addEventListener('click', callbacks.onReplayRie);
    rieCopy.append(replay);
    rieCard.append(rie, rieCopy);
    content.append(profileCard, rieCard);
    if (state.aakashUnlocked) {
        const aakashCard = element('article', 'academy-journal-profile academy-journal-aakash');
        aakashCard.dataset.character = 'aakash';
        const aakash = element('img', 'academy-journal-portrait academy-journal-aakash-portrait');
        aakash.src = ACADEMY_ASSETS.characters.aakash;
        aakash.alt = 'Aakash';
        aakash.dataset.character = 'aakash';
        const aakashCopy = element('div', 'academy-journal-copy');
        const aakashLine = copyElement('blockquote', '', language, 'journalAakashLine');
        aakashLine.dataset.speaker = 'aakash';
        aakashCopy.append(
            copyElement('h2', '', language, 'journalAakash'),
            relationshipPages(language, state.aakashChapters),
            aakashLine,
        );
        const replayAakash = copyButton(language, 'journalReplayAakash', 'academy-button academy-button-secondary');
        replayAakash.addEventListener('click', callbacks.onReplayAakash);
        aakashCopy.append(replayAakash);
        aakashCard.append(aakash, aakashCopy);
        content.append(aakashCard);
    } else {
        content.append(copyElement('p', 'academy-journal-locked', language, 'journalLocked'));
    }
    return screen;
}

function relationshipPages(language: AcademyLanguage, chapters: readonly number[]): HTMLOListElement {
    const unlocked = new Set(chapters);
    const root = element('ol', 'academy-relationship-pages');
    root.setAttribute('aria-label', academyText(language, 'relationshipJournalProgress'));
    const keys = [
        'relationshipStage1', 'relationshipStage2', 'relationshipStage3', 'relationshipStage4', 'relationshipStage5',
        'relationshipStage6', 'relationshipStage7', 'relationshipStage8', 'relationshipStage9', 'relationshipStage10',
    ] as const;
    keys.forEach((key, index) => {
        const page = index + 1;
        const item = element('li', 'academy-relationship-page');
        item.dataset.unlocked = String(unlocked.has(page));
        item.setAttribute('aria-disabled', String(!unlocked.has(page)));
        const number = element('span', 'academy-relationship-page-number');
        number.textContent = String(page).padStart(2, '0');
        number.setAttribute('aria-hidden', 'true');
        item.append(number, copyElement('span', 'academy-relationship-page-name', language, key));
        root.append(item);
    });
    return root;
}

function createMinimap(
    language: AcademyLanguage,
    currentKey: AcademyCopyKey,
    destinationKey?: AcademyCopyKey,
): { root: HTMLElement; destination: HTMLElement } {
    const root = element('aside', 'academy-minimap');
    root.setAttribute('aria-label', academyText(language, 'mapLabel'));
    const label = copyElement('span', 'academy-minimap-label', language, 'mapLabel');
    const route = element('div', 'academy-minimap-route');
    const current = copyElement('strong', 'academy-minimap-place', language, currentKey);
    const arrow = element('span', 'academy-minimap-arrow');
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    const destination = destinationKey
        ? copyElement('span', 'academy-minimap-destination', language, destinationKey)
        : element('span', 'academy-minimap-destination');
    route.append(current);
    if (destinationKey) route.append(arrow, destination);
    root.append(label, route);
    return { root, destination };
}

function routeNetwork(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('academy-route-network');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('aria-hidden', 'true');
    const routes: readonly [CampusLocation, string][] = [
        ['classroom', 'M50 58 C43 48 28 39 18 21'],
        ['library', 'M50 58 C58 48 73 39 83 24'],
        ['lab', 'M50 58 C42 52 32 50 28 45'],
        ['cafe', 'M50 58 C60 53 69 51 77 45'],
    ];
    routes.forEach(([location, d]) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.routeTo = location;
        path.setAttribute('d', d);
        svg.append(path);
    });
    return svg;
}

function mapEntrance(language: AcademyLanguage): HTMLElement {
    const entrance = copyElement('span', 'academy-map-entrance', language, 'mapEntrance');
    entrance.setAttribute('aria-hidden', 'true');
    return entrance;
}
