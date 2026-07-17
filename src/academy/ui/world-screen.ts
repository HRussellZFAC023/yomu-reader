import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { ACADEMY_CAST, canRenderAcademyCastPortrait, displayAcademyCastName, type AcademyCastMember } from '../domain/cast-registry';
import {
    displayWorldPersonName,
    projectWorldPlace,
    worldRouteForPlace,
    type WorldPlaceId,
    type WorldSceneComposition,
    type WorldObject,
    type WorldPractice,
    type WorldProgress,
    type WorldRoute,
    type WorldStamp,
} from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { LearnerEvent, LearnerProfileSnapshot } from '../domain/learner-record';
import type { CharacterDirectoryEntryProjection, CharacterRevisitPath } from '../domain/progress-projections';
import { academyBackgroundPicture, backButton, choiceToken, copyButton, copyElement, element, screenFrame } from './dom';
import { renderBookshopCatalogue } from './bookshop-world';
import { renderCafeOrder } from './cafe-world';
import { renderJapanCentreGiftCounter } from './japan-centre-world';
import { renderKonbiniRegister } from './konbini-world';
import { renderHomeFirstVisitDialogue, renderHomeRoutineNotebook } from './home-world';
import { renderParkWeatherSketchbook } from './park-world';
import { renderRamenOrderGrid, renderRamenOrderTicket, renderRamenServiceScene } from './ramen-world';
import { createAcademySprite } from './sprite';
import { populateStationAnnouncement } from './station-world';
import { populateTubePlatform } from './tube-platform-world';

export interface WorldScreenOptions {
    readonly language: AcademyLanguage;
    readonly place: WorldPlaceId;
    readonly progress: WorldProgress;
    readonly route: string;
    readonly onTravel: (place: WorldPlaceId) => void;
    readonly onActivity: (route: WorldRoute) => void;
    readonly onClaimStamp: (stampId: string) => void;
    readonly onIntroductionComplete?: (introductionId: string) => void;
    /** Returns false when browser speech is unavailable; the transcript is still shown. */
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
    readonly audioMuted?: boolean;
    readonly onToggleAudio?: () => boolean;
    readonly onObjectInteract?: () => void;
    readonly onPaperTurn?: () => void;
    readonly random?: () => number;
    readonly onBack?: () => void;
}

/** @deprecated The app now calls `renderWorldPlaceScreen` with 中庭 as campus. */
export type CampusLocation = 'classroom' | 'library' | 'lab' | 'cafe';

/** Compatibility seam for callers transitioning to the location-first screen. */
export function renderCampusScreen(
    language: AcademyLanguage,
    _reviewComplete: boolean,
    onEnter: (location: CampusLocation) => void,
    _preference?: unknown,
    _unavailableLocations?: ReadonlySet<CampusLocation>,
): HTMLElement {
    return renderWorldPlaceScreen({
        language,
        place: 'courtyard',
        route: 'campus',
        progress: { completedScenes: [], completedEncounterIds: [], metCharacterIds: ['rie', 'aakash'] },
        onTravel: place => { if (place === 'classroom' || place === 'library' || place === 'lab' || place === 'cafe') onEnter(place); },
        onActivity: () => undefined,
        onClaimStamp: () => undefined,
        onPracticeComplete: () => undefined,
    });
}

/** @deprecated The app now renders all non-Library places through `renderWorldPlaceScreen`. */
export function renderLocationScreen(
    language: AcademyLanguage,
    location: Exclude<CampusLocation, 'library' | 'lab'>,
    onBack: () => void,
): HTMLElement {
    return renderWorldPlaceScreen({
        language,
        place: location,
        route: location,
        progress: { completedScenes: [], completedEncounterIds: [], metCharacterIds: ['rie', 'aakash'] },
        onTravel: () => undefined,
        onActivity: () => undefined,
        onClaimStamp: () => undefined,
        onPracticeComplete: () => undefined,
        onBack,
    });
}

/** A location-first screen. `campus` is only a route; the learner is in 中庭. */
export function renderWorldPlaceScreen(options: WorldScreenOptions): HTMLElement {
    const place = projectWorldPlace(options.place, options.progress);
    const screen = element('section', 'academy-screen academy-world-screen');
    screen.dataset.academyRoute = options.route;
    screen.dataset.currentPlace = place.id;
    screen.dataset.worldRegion = place.region;
    screen.dataset.introductionId = place.introduction.id;
    screen.dataset.firstVisit = String(place.introduction.isFirstVisit);
    if (place.id === 'cafe') {
        screen.dataset.cafeVisit = place.practice?.id === 'cafe-coffee-counter' ? 'replay' : 'first-order';
    }
    if (place.id === 'konbini') {
        screen.dataset.konbiniVisit = String(options.progress.worldVisits?.konbini ?? 0);
    }
    screen.dataset.plate = place.scene;
    if (place.composition) screen.dataset.sceneMotif = place.composition.motif;
    screen.append(academyBackgroundPicture(place.scene));

    const stage = element('div', 'academy-world-stage');
    const header = element('header', 'academy-world-hud');
    const phase = element('p', 'academy-world-phase');
    phase.textContent = place.moment[options.language];
    phase.lang = options.language;
    const title = element('h1', 'academy-world-title');
    title.textContent = place.label.ja;
    title.lang = 'ja';
    const support = element('p', 'academy-world-support');
    support.textContent = place.label.en;
    if (place.introduction.isFirstVisit) {
        const arrival = element('p', 'academy-world-arrival');
        arrival.textContent = options.language === 'ja' ? 'はじめて来た場所' : 'First visit';
        header.append(phase, title, support, arrival);
    } else header.append(phase, title, support);

    const activity = element('section', 'academy-world-action-dock academy-world-purpose-surface');
    activity.setAttribute('aria-label', options.language === 'ja' ? '今日の用事' : 'Purpose here');
    activity.dataset.worldActivity = place.activity.curriculum.id;
    activity.dataset.primaryPerson = place.people[0] ?? 'world';
    activity.dataset.hasPractice = String(Boolean(place.practice && place.availability.state === 'open'));
    activity.id = `academy-world-purpose-${place.id}`;
    activity.tabIndex = -1;
    if (place.composition) activity.dataset.purposeSurface = place.composition.purposeSurface;
    const activitySpeaker = element('p', 'academy-world-action-speaker');
    activitySpeaker.textContent = place.people[0]
        ? displayWorldPersonName(place.people[0], options.language)
        : options.language === 'ja' ? 'この場所' : 'Here';
    activitySpeaker.lang = options.language;
    const isStation = place.id === 'station';
    const isTubePlatform = place.id === 'station-platform';
    const isHome = place.id === 'home';
    const activityLabel = element('h2', 'academy-world-section-title');
    activityLabel.textContent = place.activity.label[options.language];
    const activityDetail = element('p', 'academy-world-activity-detail');
    activityDetail.textContent = place.activity.detail[options.language];
    if (isHome && place.practice) {
        activity.classList.add('academy-home-purpose-surface');
        activity.setAttribute('aria-label', options.language === 'ja' ? '家の机と今夜の一行' : 'Home desk and tonight\'s line');
        activity.replaceChildren(renderHomeRoutineNotebook({
            language: options.language,
            practice: place.practice,
            stampId: place.stamp.id,
            visitCount: options.progress.worldVisits?.home ?? 0,
            random: options.random,
            onListen: options.onListen,
            onPaperTurn: options.onPaperTurn,
            onOpenJournal: () => options.onActivity('journal'),
            onPracticeComplete: options.onPracticeComplete,
        }));
    } else if (place.id === 'cafe' && place.practice) {
        activity.classList.add('academy-cafe-order-surface');
        activity.setAttribute('aria-label', options.language === 'ja' ? 'カフェの注文' : 'Cafe order');
        activity.append(renderCafeOrder({
            language: options.language,
            practice: place.practice,
            stamp: place.stamp,
            onListen: options.onListen,
            onComplete: options.onPracticeComplete,
        }));
    } else if (isStation && place.practice) {
        populateStationAnnouncement({
            host: activity,
            language: options.language,
            practice: place.practice,
            visitCount: options.progress.worldVisits?.station ?? 0,
            speaker: activitySpeaker.textContent ?? '',
            activityLabel: activityLabel.textContent ?? '',
            activityDetail: activityDetail.textContent ?? '',
            stampId: place.stamp.id,
            onListen: options.onListen,
            onPracticeComplete: options.onPracticeComplete,
        });
    } else if (isTubePlatform && place.practice) {
        populateTubePlatform({
            host: activity,
            language: options.language,
            practice: place.practice,
            visitCount: options.progress.worldVisits?.['station-platform'] ?? 0,
            speaker: activitySpeaker.textContent ?? '',
            activityLabel: activityLabel.textContent ?? '',
            activityDetail: activityDetail.textContent ?? '',
            stampId: place.stamp.id,
            onListen: options.onListen,
            onPracticeComplete: options.onPracticeComplete,
        });
    } else if (place.id !== 'konbini' && place.id !== 'park') {
        const curriculum = element('p', 'academy-world-curriculum');
        curriculum.dataset.curriculumSurface = place.activity.curriculum.surface;
        curriculum.dataset.curriculumState = place.activity.curriculum.state;
        curriculum.textContent = options.language === 'ja'
            ? `教材: ${place.activity.curriculum.label.ja}`
            : `${place.activity.curriculum.surface === 'moodle' ? 'Moodle' : place.activity.curriculum.surface === 'story' ? 'Story' : 'Textbook'}: ${place.activity.curriculum.label.en}`;
        activity.append(activitySpeaker, activityLabel, activityDetail, curriculum);
    }
    if (place.id === 'ramen' && place.practice) activity.append(renderRamenOrderTicket(options.language, place.practice));
    if (place.practice && place.availability.state === 'open' && !isStation && !isTubePlatform && place.id !== 'cafe' && !isHome) {
        activity.append(place.id === 'konbini'
            ? renderKonbiniRegister({
                language: options.language,
                practice: place.practice,
                stampId: place.stamp.id,
                onListen: options.onListen,
                onCount: options.onObjectInteract,
                onPracticeComplete: options.onPracticeComplete,
            })
            : place.id === 'bookshop'
            ? renderBookshopCatalogue({
                language: options.language,
                practice: place.practice,
                stampId: place.stamp.id,
                onListen: options.onListen,
                onPracticeComplete: options.onPracticeComplete,
            })
            : place.id === 'ramen'
                ? renderRamenOrderGrid({
                    language: options.language,
                    practice: place.practice,
                    stampId: place.stamp.id,
                    onListen: options.onListen,
                    onTicketMove: options.onObjectInteract,
                    onPracticeComplete: options.onPracticeComplete,
                })
                : place.id === 'japan-centre'
                    ? renderJapanCentreGiftCounter({
                        language: options.language,
                        practice: place.practice,
                        stampId: place.stamp.id,
                        onListen: options.onListen,
                        onPracticeComplete: options.onPracticeComplete,
                    })
            : place.id === 'park'
                ? renderParkWeatherSketchbook({
                    language: options.language,
                    practice: place.practice,
                    stampId: place.stamp.id,
                    visitCount: options.progress.worldVisits?.park ?? 0,
                    random: options.random,
                    onListen: options.onListen,
                    onSketch: options.onObjectInteract,
                    onPracticeComplete: options.onPracticeComplete,
                })
            : place.id === 'cafeteria'
                ? worldCafeteriaTrayPractice(options, place.practice, place.stamp.id)
                : worldPractice(options, place.practice, place.stamp.id));
    }
    if (place.activity.route && place.availability.state === 'open' && place.id !== 'cafe' && !isHome) {
        activity.append(worldActivityButton(options, place.activity.route));
    } else if (!place.practice || place.availability.state !== 'open') {
        const unavailable = element('p', 'academy-world-unavailable');
        unavailable.textContent = place.activity.unavailableReason?.[options.language]
            ?? place.availability.reason?.[options.language]
            ?? '';
        activity.append(unavailable);
    }

    const objects = worldObjects(options, place.objects);
    const reward = place.id === 'cafe' || place.id === 'station-platform'
        ? undefined
        : worldReward(options, place.stamp, Boolean(place.practice));
    const livingScene = place.composition ? worldLivingScene(place.composition) : undefined;
    const ramenServiceScene = place.id === 'ramen' ? renderRamenServiceScene() : undefined;
    let arrival: HTMLElement | undefined;
    if (place.arrivalDialogue && place.introduction.isFirstVisit) {
        arrival = isHome
            ? renderHomeFirstVisitDialogue({
                language: options.language,
                dialogue: place.arrivalDialogue,
                introductionId: place.introduction.id,
                onContinue: reflection => {
                    screen.dataset.homeReflection = reflection;
                    completeWorldArrival(options, place.introduction.id, activity, screen, arrival!);
                },
            })
            : worldArrivalDialogue(options, place.arrivalDialogue, place.introduction.id, activity, screen);
    }
    if (arrival) activity.hidden = true;
    stage.append(
        header,
        ...(livingScene ? [livingScene] : []),
        ...(ramenServiceScene ? [ramenServiceScene] : []),
        ...(arrival ? [arrival] : []),
        worldCharacters(
            options,
            place.people,
            activity,
            place.availability.state === 'open' ? place.activity.route : undefined,
        ),
        worldExits(options, place.exits),
        ...(reward ? [reward] : []),
        activity,
        objects,
    );
    if (options.onBack) {
        const back = backButton(options.language);
        back.classList.add('academy-world-back');
        back.dataset.exitTo = 'return';
        back.addEventListener('click', options.onBack);
        stage.append(back);
    }
    screen.append(stage);
    return screen;
}

function worldActivityButton(options: WorldScreenOptions, route: WorldRoute): HTMLButtonElement {
    const button = element('button', 'academy-world-activity-button');
    button.type = 'button';
    button.dataset.activityRoute = route;
    button.textContent = options.language === 'ja' ? '始める' : 'Start';
    button.addEventListener('click', () => options.onActivity(route));
    return button;
}

function worldArrivalDialogue(
    options: WorldScreenOptions,
    dialogue: NonNullable<ReturnType<typeof projectWorldPlace>['arrivalDialogue']>,
    introductionId: string,
    purpose: HTMLElement,
    screen: HTMLElement,
): HTMLElement {
    const arrival = element('aside', 'academy-world-arrival-dialogue');
    if (options.place === 'cafe') arrival.classList.add('academy-cafe-arrival-dialogue');
    arrival.dataset.worldArrivalDialogue = introductionId;
    arrival.setAttribute('aria-label', options.language === 'ja' ? 'はじめての会話' : 'First-visit conversation');
    const speaker = element('p', 'academy-world-arrival-speaker');
    speaker.textContent = displayWorldPersonName(dialogue.speakerId, options.language);
    const line = element('p', 'academy-world-arrival-line');
    line.lang = 'ja';
    line.textContent = dialogue.line.ja;
    arrival.append(speaker, line);
    if (options.language === 'en') {
        const support = element('p', 'academy-world-arrival-support');
        support.textContent = dialogue.line.en;
        arrival.append(support);
    }
    const continueButton = element('button', 'academy-world-arrival-continue');
    continueButton.type = 'button';
    continueButton.textContent = dialogue.action[options.language];
    continueButton.addEventListener('click', () => completeWorldArrival(options, introductionId, purpose, screen, arrival));
    arrival.append(continueButton);
    return arrival;
}

function completeWorldArrival(
    options: WorldScreenOptions,
    introductionId: string,
    purpose: HTMLElement,
    screen: HTMLElement,
    arrival: HTMLElement,
): void {
    arrival.hidden = true;
    purpose.hidden = false;
    screen.dataset.firstVisit = 'false';
    screen.querySelector('.academy-world-arrival')?.remove();
    options.onIntroductionComplete?.(introductionId);
    purpose.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}

/** Decorative paper-stage marks. Purpose, people, and exits remain real controls. */
function worldLivingScene(composition: WorldSceneComposition): HTMLElement {
    const scene = element('div', 'academy-world-living-scene');
    scene.dataset.sceneComposition = composition.motif;
    scene.setAttribute('aria-hidden', 'true');
    composition.landmarks.forEach((landmark, index) => {
        const mark = element('span', 'academy-world-scene-mark');
        mark.dataset.landmark = landmark.id;
        mark.dataset.depth = landmark.depth;
        mark.style.setProperty('--world-mark-order', String(index));
        scene.append(mark);
    });
    return scene;
}

function worldObjects(options: WorldScreenOptions, objects: readonly WorldObject[] | undefined): HTMLElement {
    const section = element('div', 'academy-world-objects');
    section.hidden = !objects?.length;
    section.setAttribute('aria-label', options.language === 'ja' ? '場所にあるもの' : 'Objects here');
    objects?.forEach(object => {
        const button = element('button', 'academy-world-object');
        button.type = 'button';
        button.dataset.worldObject = object.id;
        const label = element('span', 'academy-world-object-name');
        label.textContent = object.label.ja;
        label.lang = 'ja';
        const detail = element('span', 'academy-world-object-detail');
        detail.textContent = object.label.en;
        button.append(label, detail);
        if (object.kind === 'audio') {
            const setAudioState = (muted: boolean) => {
                button.dataset.muted = String(muted);
                button.setAttribute('aria-pressed', String(!muted));
                detail.textContent = muted
                    ? options.language === 'ja' ? '音オン' : 'Sound on'
                    : object.label.en;
            };
            setAudioState(options.audioMuted ?? false);
            button.addEventListener('click', () => setAudioState(options.onToggleAudio?.() ?? Boolean(options.audioMuted)));
        }
        section.append(button);
    });
    return section;
}

function worldPractice(
    options: WorldScreenOptions,
    practice: WorldPractice,
    stampId: string,
    progressive = false,
): HTMLElement {
    const root = element('div', 'academy-world-practice');
    root.dataset.worldPractice = practice.id;
    const isLabShadowing = options.place === 'lab' && practice.kind === 'shadowing';
    const isHomeJournalRecall = options.place === 'home' && practice.kind === 'availability';
    const isCourtyardNotice = options.place === 'courtyard' && practice.manipulation?.kind === 'token-order';
    const isClassroomBoardCheck = options.place === 'classroom' && practice.kind === 'listening';
    if (isLabShadowing) root.dataset.labPractice = 'listen-repeat-answer';
    if (isHomeJournalRecall) root.dataset.homePractice = 'daily-routine-recall';
    if (isCourtyardNotice) root.dataset.courtyardPractice = 'noticeboard-order';
    if (isClassroomBoardCheck) root.dataset.classroomPractice = 'board-listen-check';
    if (progressive) root.classList.add('academy-world-station-practice');
    const prompt = element('p', 'academy-world-practice-prompt');
    prompt.lang = 'ja';
    prompt.textContent = practice.prompt.ja;
    prompt.hidden = progressive;
    root.append(prompt);
    let promptSupport: HTMLParagraphElement | undefined;
    if (options.language === 'en') {
        promptSupport = element('p', 'academy-world-practice-support');
        promptSupport.textContent = practice.prompt.en;
        promptSupport.hidden = progressive;
        root.append(promptSupport);
    }

    const listen = element('button', 'academy-world-listen');
    listen.type = 'button';
    listen.dataset.worldListen = practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const transcript = element('p', 'academy-world-transcript');
    transcript.lang = 'ja';
    transcript.hidden = true;
    transcript.textContent = practice.audioLine;
    const status = element('p', 'academy-world-practice-status');
    status.setAttribute('role', 'status');
    let speakingCue: HTMLElement | undefined;
    let spokenLine: HTMLElement | undefined;
    let repeatButton: HTMLButtonElement | undefined;
    if (isLabShadowing) {
        speakingCue = element('section', 'academy-lab-speaking-cue');
        speakingCue.dataset.labSpeaking = 'awaiting-listen';
        speakingCue.setAttribute('aria-label', options.language === 'ja' ? '声に出す練習' : 'Speak it back');
        const kicker = element('p', 'academy-lab-speaking-kicker');
        kicker.lang = 'ja';
        kicker.textContent = '語学ラボ　声に出す';
        const instruction = element('p', 'academy-lab-speaking-instruction');
        instruction.textContent = options.language === 'ja'
            ? '聞いたあと、同じリズムで声に出してみる。'
            : 'After listening, say the line back in the same rhythm.';
        spokenLine = element('p', 'academy-lab-speaking-line');
        spokenLine.lang = 'ja';
        spokenLine.hidden = true;
        spokenLine.textContent = practice.audioLine;
        repeatButton = element('button', 'academy-lab-speaking-button');
        repeatButton.type = 'button';
        repeatButton.disabled = true;
        repeatButton.textContent = options.language === 'ja' ? '声に出した' : 'I said it aloud';
        repeatButton.addEventListener('click', () => {
            speakingCue!.dataset.labSpeaking = 'spoken';
            root.dataset.shadowed = 'true';
            repeatButton!.disabled = true;
            status.textContent = options.language === 'ja'
                ? 'よくできました。最後の語を選んでください。'
                : 'Good. Now choose the final word.';
        });
        speakingCue.append(kicker, instruction, spokenLine, repeatButton);
    }
    const choices = element('div', 'academy-world-practice-options');
    const manipulation = practice.manipulation;
    choices.hidden = progressive || Boolean(manipulation);
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', options.language === 'ja' ? '答えを選ぶ' : 'Choose an answer');
    let completed = false;
    let choicesMounted = false;
    const complete = () => {
        if (completed) return;
        completed = true;
        root.dataset.practiceComplete = 'true';
        status.textContent = practice.success[options.language];
        choices.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
        const evaluation = completedWorldPracticeEvaluation(practice);
        if (evaluation) options.onPracticeComplete?.(practice.id, stampId, evaluation);
        else options.onPracticeComplete?.(practice.id, stampId);
    };
    const mountChoices = () => {
        if (choicesMounted) return;
        choicesMounted = true;
        practice.choices.forEach((choice, index) => {
            const answer = element('button', 'academy-world-practice-option');
            answer.type = 'button';
            answer.dataset.choiceId = choiceToken(index);
            const japanese = element('span', 'academy-world-practice-choice-ja');
            japanese.lang = 'ja';
            japanese.textContent = choice.label.ja;
            answer.append(japanese);
            if (options.language === 'en') {
                const support = element('span', 'academy-world-practice-choice-support');
                support.textContent = choice.label.en;
                answer.append(support);
            }
            answer.addEventListener('click', () => {
                transcript.hidden = false;
                if (completed) return;
                if (choice.id !== practice.correctChoiceId) {
                    status.textContent = options.language === 'ja'
                        ? 'もう一度聞いて、答えを選んでください。'
                        : 'Listen again, then choose another answer.';
                    return;
                }
                complete();
            });
            choices.append(answer);
        });
    };
    const tokenOrder = manipulation?.kind === 'token-order'
        ? options.place === 'cafeteria'
            ? worldCafeteriaTray(manipulation, options, status, complete)
            : worldTokenOrder(options, manipulation, status, complete)
        : undefined;
    if (manipulation) root.dataset.worldInteraction = manipulation.kind;
    if (!manipulation) mountChoices();
    listen.addEventListener('click', () => {
        if (progressive) {
            root.closest<HTMLElement>('.academy-world-station-board')?.setAttribute('data-listening-started', 'true');
            prompt.hidden = false;
            if (promptSupport) promptSupport.hidden = false;
            choices.hidden = false;
        }
        transcript.hidden = false;
        if (speakingCue && spokenLine && repeatButton) {
            speakingCue.dataset.labSpeaking = 'ready';
            spokenLine.hidden = false;
            repeatButton.disabled = false;
        }
        void (options.onListen?.(practice.audioLine) ?? Promise.resolve(false)).then(played => {
            if (speakingCue?.dataset.labSpeaking === 'spoken') return;
            status.textContent = played
                ? options.language === 'ja' ? '音声を再生しました。' : 'Playing the announcement.'
                : options.language === 'ja'
                    ? 'この端末では音声を再生できません。文字を読んで続けてください。'
                    : 'Speech is unavailable here. Use the transcript and continue.';
        });
    });

    root.append(listen, transcript, ...(speakingCue ? [speakingCue] : []), status, ...(tokenOrder ? [tokenOrder] : []), choices);
    return root;
}

/** Student Dining uses a hand-assembled tray, deliberately distinct from the Lab's spoken shadowing loop. */
function worldCafeteriaTrayPractice(
    options: WorldScreenOptions,
    practice: WorldPractice,
    stampId: string,
): HTMLElement {
    const root = worldPractice(options, practice, stampId);
    root.dataset.cafeteriaPractice = 'tray-assembly';
    return root;
}

function worldCafeteriaTray(
    manipulation: Extract<NonNullable<WorldPractice['manipulation']>, { kind: 'token-order' }>,
    options: WorldScreenOptions,
    status: HTMLElement,
    onComplete: () => void,
): HTMLElement {
    const tray = element('section', 'academy-cafeteria-meal-tray');
    tray.dataset.cafeteriaSensory = 'tray-assembly';
    tray.setAttribute('aria-label', options.language === 'ja' ? '自分のトレーに注文を置く' : 'Build your own order tray');
    const label = element('p', 'academy-cafeteria-tray-label');
    label.lang = 'ja';
    label.textContent = '自分のトレー';
    const instruction = element('p', 'academy-cafeteria-tray-instruction');
    instruction.textContent = options.language === 'ja'
        ? '品物から順に、トレーに置く。'
        : 'Place each part on the tray in order.';
    const order = worldTokenOrder(options, manipulation, status, onComplete);
    order.classList.add('academy-cafeteria-tray-order');
    tray.append(label, instruction, order);
    return tray;
}

/** A compact, keyboard-friendly local rebuild: each taught chunk can be placed once. */
function worldTokenOrder(
    options: WorldScreenOptions,
    manipulation: Extract<NonNullable<WorldPractice['manipulation']>, { kind: 'token-order' }>,
    status: HTMLElement,
    onComplete: () => void,
): HTMLElement {
    const root = element('section', 'academy-world-token-order');
    root.dataset.worldManipulation = manipulation.kind;
    root.setAttribute('aria-label', options.language === 'ja' ? 'ことばを順番に置く' : 'Put the words in order');
    const response = element('p', 'academy-world-token-order-response');
    response.lang = 'ja';
    response.setAttribute('aria-live', 'polite');
    const tokens = element('div', 'academy-world-token-order-options');
    tokens.setAttribute('role', 'group');
    tokens.setAttribute('aria-label', options.language === 'ja' ? 'ことば' : 'Word chunks');
    const reset = element('button', 'academy-world-token-order-reset');
    reset.type = 'button';
    reset.disabled = true;
    reset.textContent = options.language === 'ja' ? 'やり直す' : 'Reset';

    const placed: string[] = [];
    const buttons = new Map<string, HTMLButtonElement>();
    const updateResponse = () => {
        response.textContent = placed
            .map(id => manipulation.tokens.find(token => token.id === id)?.label.ja ?? '')
            .join('');
        reset.disabled = !placed.length;
    };
    const resetOrder = () => {
        placed.splice(0);
        buttons.forEach(button => { button.disabled = false; });
        updateResponse();
    };
    manipulation.tokens.forEach(token => {
        const button = element('button', 'academy-world-token-order-option');
        button.type = 'button';
        button.dataset.worldToken = token.id;
        const japanese = element('span', 'academy-world-practice-choice-ja');
        japanese.lang = 'ja';
        japanese.textContent = token.label.ja;
        button.append(japanese);
        if (options.language === 'en') {
            const support = element('span', 'academy-world-practice-choice-support');
            support.textContent = token.label.en;
            button.append(support);
        }
        button.addEventListener('click', () => {
            placed.push(token.id);
            button.disabled = true;
            updateResponse();
            if (placed.length !== manipulation.correctTokenIds.length) return;
            if (placed.every((id, index) => id === manipulation.correctTokenIds[index])) {
                onComplete();
                buttons.forEach(candidate => { candidate.disabled = true; });
                reset.disabled = true;
                return;
            }
            status.textContent = options.language === 'ja'
                ? '順番をもう一度確かめてください。'
                : 'Check the order and try again.';
        });
        buttons.set(token.id, button);
        tokens.append(button);
    });
    reset.addEventListener('click', resetOrder);
    root.append(response, tokens, reset);
    return root;
}

function worldCharacters(
    options: WorldScreenOptions,
    personIds: readonly string[],
    purpose: HTMLElement,
    activityRoute: WorldRoute | undefined,
): HTMLElement {
    const layer = element('section', 'academy-world-characters');
    layer.setAttribute('aria-label', options.language === 'ja' ? 'ここにいる人' : 'People here');
    const positions = personIds.length === 1 ? ['center'] : ['left', 'right', 'center'];
    personIds.slice(0, 3).forEach((id, index) => {
        const character = element('figure', 'academy-world-character');
        character.dataset.worldCharacter = id;
        character.dataset.position = positions[index] ?? 'center';
        character.dataset.purposePerson = String(index === 0);
        const presence = worldPersonPresence(options, id);
        if (presence) {
            character.dataset.presence = presence.id;
            const presenceCaption = element('figcaption', 'academy-world-character-presence');
            presenceCaption.classList.add(...worldPresenceClassNames(options.place));
            presenceCaption.lang = options.language === 'ja' ? 'ja' : 'en';
            presenceCaption.textContent = presence.label[options.language];
            character.append(presenceCaption);
        }
        const parkPresence = worldParkPresence(options, id);
        if (parkPresence) {
            character.dataset.presence = parkPresence.id;
            const presence = element('figcaption', 'academy-world-character-presence academy-park-character-presence');
            presence.lang = options.language === 'ja' ? 'ja' : 'en';
            presence.textContent = parkPresence.label[options.language];
            character.append(presence);
        }
        const source = canRenderAcademyCastPortrait(id, 'story-runtime') ? WORLD_SPRITES[id] : undefined;
        if (source) {
            character.append(createAcademySprite({
                characterId: id,
                alt: displayWorldPersonName(id, options.language),
                className: 'academy-world-sprite',
                expressions: { neutral: { still: source } },
            }));
        } else {
            const silhouette = element('div', 'academy-world-character-silhouette');
            silhouette.setAttribute('aria-hidden', 'true');
            character.append(silhouette);
        }
        const name = displayWorldPersonName(id, options.language);
        if (index === 0 && options.place !== 'cafe') {
            const action = element('button', 'academy-world-character-name academy-world-character-action');
            action.type = 'button';
            action.dataset.worldPersonAction = id;
            action.setAttribute('aria-controls', purpose.id);
            action.setAttribute('aria-label', options.language === 'ja' ? `${name}と話す` : `Talk to ${name}`);
            action.textContent = name;
            action.addEventListener('click', () => {
                if (activityRoute && purpose.dataset.hasPractice !== 'true') {
                    options.onActivity(activityRoute);
                    return;
                }
                purpose.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
            });
            character.append(action);
        } else {
            const caption = element('figcaption', 'academy-world-character-name');
            caption.textContent = name;
            character.append(caption);
        }
        layer.append(character);
    });
    return layer;
}

type WorldPresence = { readonly id: string; readonly label: { readonly en: string; readonly ja: string } };

function worldPersonPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    return worldCourtyardPresence(options, personId)
        ?? worldClassroomPresence(options, personId)
        ?? worldHomePresence(options, personId)
        ?? worldStreetPresence(options, personId)
        ?? worldStationPresence(options, personId)
        ?? worldTubePlatformPresence(options, personId)
        ?? worldCafePresence(options, personId)
        ?? worldCafeteriaPresence(options, personId)
        ?? worldLabPresence(options, personId)
        ?? worldKonbiniPresence(options, personId)
        ?? worldBookshopPresence(options, personId)
        ?? worldRamenPresence(options, personId)
        ?? worldJapanCentrePresence(options, personId);
}

function worldCafePresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'cafe') return undefined;
    const replay = projectWorldPlace('cafe', options.progress).practice?.id === 'cafe-coffee-counter';
    if (personId === 'aakash') {
        return replay
            ? { id: 'counting-coffee-order', label: { ja: 'Aakash-san・注文票の数を確かめている', en: 'Aakash-san · Checking the quantity on the order slip' } }
            : { id: 'comparing-coffee-price', label: { ja: 'Aakash-san・メニューの値段を見ている', en: 'Aakash-san · Comparing the coffee price' } };
    }
    if (personId === 'felix') {
        return replay
            ? { id: 'tuning-cafe-radio', label: { ja: 'Felix-san・店内ラジオを合わせている', en: 'Felix-san · Tuning the cafe radio' } }
            : { id: 'holding-next-menu', label: { ja: 'Felix-san・次のメニューを持っている', en: 'Felix-san · Holding the next menu' } };
    }
    return undefined;
}

function worldPresenceClassNames(place: WorldPlaceId): readonly string[] {
    if (place === 'konbini') return ['academy-konbini-character-presence'];
    if (place === 'bookshop') return ['academy-bookshop-character-presence'];
    if (place === 'ramen') return ['academy-ramen-character-presence'];
    if (place === 'japan-centre') return ['academy-japan-centre-character-presence'];
    return [];
}

function worldKonbiniPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'konbini' || personId !== 'nanako') return undefined;
    const visit = (options.progress.worldVisits?.konbini ?? 0) % 3;
    if (visit === 1) return { id: 'restocking-cd-rack', label: { ja: 'Nanako-san・CD棚の値札を直している', en: 'Nanako-san · Straightening the CD price tags' } };
    if (visit === 2) return { id: 'folding-shopping-bag', label: { ja: 'Nanako-san・レジ袋をたたんでいる', en: 'Nanako-san · Folding a bag beside the register' } };
    return { id: 'counting-register-notes', label: { ja: 'Nanako-san・レジの千円札を数えている', en: 'Nanako-san · Counting ¥1,000 notes at the till' } };
}

/** The shared noticeboard is observable, but every person keeps their own task and response. */
function worldCourtyardPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'courtyard') return undefined;
    const returning = (options.progress.worldVisits?.courtyard ?? 0) % 2 === 1;
    if (personId === 'rie') {
        return returning
            ? { id: 'filing-board-notes', label: { ja: '掲示のメモを整理している', en: 'Sorting the noticeboard notes' } }
            : { id: 'pinning-class-note', label: { ja: 'クラスのメモを掲示している', en: 'Pinning a class note to the board' } };
    }
    if (personId === 'aakash') {
        return returning
            ? { id: 'checking-own-route', label: { ja: '自分の行き先メモを確かめている', en: 'Checking his own route note' } }
            : { id: 'reading-own-notice', label: { ja: '自分の掲示を読んでいる', en: 'Reading his own notice' } };
    }
    return undefined;
}

/** Classroom peers are nearby and independent; their labels never make them judges of the learner's response. */
function worldClassroomPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'classroom') return undefined;
    const returning = (options.progress.worldVisits?.classroom ?? 0) % 2 === 1;
    if (personId === 'rie') {
        return returning
            ? { id: 'erasing-board-corner', label: { ja: '黒板のすみを消している', en: 'Erasing a corner of the board' } }
            : { id: 'setting-board-agenda', label: { ja: '黒板に予定を書いている', en: 'Writing the agenda on the board' } };
    }
    if (personId === 'aakash') {
        return returning
            ? { id: 'packing-own-notes', label: { ja: '自分のノートをしまっている', en: 'Packing his own notes' } }
            : { id: 'copying-board-heading', label: { ja: '黒板の見出しを自分のノートに写している', en: 'Copying the board heading into his own notes' } };
    }
    if (personId === 'felix') {
        return returning
            ? { id: 'checking-own-example', label: { ja: '自分の例文を見直している', en: 'Checking his own example sentence' } }
            : { id: 'stacking-own-handouts', label: { ja: '自分のプリントを重ねている', en: 'Stacking his own handouts' } };
    }
    return undefined;
}

/** Home keeps Aakash remote: the call state never implies that he is in the learner's room. */
function worldHomePresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'home' || personId !== 'aakash') return undefined;
    const returning = (options.progress.worldVisits?.home ?? 0) % 2 === 1;
    return returning
        ? { id: 'remote-voice-note', label: { ja: 'Aakash-san・自分の机から音声メモ', en: 'Aakash-san · Voice note from his own desk' } }
        : { id: 'remote-journal-call', label: { ja: 'Aakash-san・自分の机から通話中', en: 'Aakash-san · Calling from his own desk' } };
}

/** These are independent nearby activities; neither character is listening to or placing the learner's response. */
function worldLabPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'lab') return undefined;
    if (personId === 'xingyu') {
        return { id: 'separate-booth-practice', label: { ja: '別のブースで、自分の練習をしている', en: 'Practising independently in a separate booth' } };
    }
    if (personId === 'mika') {
        return { id: 'separate-playback-check', label: { ja: '別の再生レーンを確かめている', en: 'Checking a separate playback lane' } };
    }
    return undefined;
}

function worldCafeteriaPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'cafeteria') return undefined;
    if (personId === 'aakash') {
        return { id: 'separate-table-choice', label: { ja: '別のテーブルで、自分の昼食を選んでいる', en: 'Choosing his own lunch at a separate table' } };
    }
    if (personId === 'felix') {
        return { id: 'own-tray-queue', label: { ja: '自分のトレーを持って列にいる', en: 'Waiting in line with his own tray' } };
    }
    return undefined;
}

function worldStreetPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'street') return undefined;
    const returning = (options.progress.worldVisits?.street ?? 0) % 2 === 1;
    if (personId === 'aakash') {
        return returning
            ? { id: 'checking-crossing', label: { ja: '横断歩道を確かめている', en: 'Checking the crossing' } }
            : { id: 'holding-route-note', label: { ja: '道順のメモを見ている', en: 'Checking the route note' } };
    }
    if (personId === 'peter') {
        return returning
            ? { id: 'waiting-by-sign', label: { ja: '駅の標識のそばで待っている', en: 'Waiting by the station sign' } }
            : { id: 'reading-street-sign', label: { ja: '通りの標識を読んでいる', en: 'Reading the street sign' } };
    }
    return undefined;
}

function worldStationPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'station' || personId !== 'aakash') return undefined;
    const returning = (options.progress.worldVisits?.station ?? 0) % 2 === 1;
    return returning
        ? { id: 'checking-departures', label: { ja: '発車案内を確かめている', en: 'Checking the departure board' } }
        : { id: 'reading-station-map', label: { ja: '駅の案内図を見ている', en: 'Reading the station map' } };
}

/** Aakash remains an independent nearby traveller; no likeness is inferred or rendered. */
function worldTubePlatformPresence(options: WorldScreenOptions, personId: string): WorldPresence | undefined {
    if (options.place !== 'station-platform' || personId !== 'aakash') return undefined;
    const returning = (options.progress.worldVisits?.['station-platform'] ?? 0) % 2 === 1;
    return returning
        ? { id: 'checking-own-journey-time', label: { ja: '自分の通学時間を確かめている', en: 'Checking his own journey time' } }
        : { id: 'waiting-by-platform-map', label: { ja: 'ホームの路線図のそばで待っている', en: 'Waiting beside the platform map' } };
}

function worldRamenPresence(
    options: WorldScreenOptions,
    personId: string,
): WorldPresence | undefined {
    if (options.place !== 'ramen') return undefined;
    const returning = (options.progress.worldVisits?.ramen ?? 0) % 2 === 1;
    if (personId === 'shin') {
        return returning
            ? { id: 'checking-ticket-rail', label: { ja: '食券の数え方を確かめている', en: 'Checking the counters on the ticket rail' } }
            : { id: 'marking-menu-counters', label: { ja: 'メニューの助数詞に印をつけている', en: 'Marking counters on the menu' } };
    }
    if (personId === 'rie') {
        return returning
            ? { id: 'reading-order-slip', label: { ja: '注文票を見ている', en: 'Reading an order slip' } }
            : { id: 'waiting-at-counter', label: { ja: 'カウンターで待っている', en: 'Waiting at the counter' } };
    }
    return undefined;
}

function worldBookshopPresence(
    options: WorldScreenOptions,
    personId: string,
): WorldPresence | undefined {
    if (options.place !== 'bookshop' || personId !== 'sophie') return undefined;
    const returning = (options.progress.worldVisits?.bookshop ?? 0) > 0;
    return returning
        ? { id: 'reshelving', label: { ja: '見つけた本を棚に戻している', en: 'Reshelving the book you found' } }
        : { id: 'cataloguing', label: { ja: '目録カードを並べている', en: 'Arranging catalogue cards' } };
}

function worldJapanCentrePresence(
    options: WorldScreenOptions,
    personId: string,
): WorldPresence | undefined {
    if (options.place !== 'japan-centre') return undefined;
    const returning = (options.progress.worldVisits?.['japan-centre'] ?? 0) % 2 === 1;
    if (personId === 'sophie') {
        return returning
            ? { id: 'comparing-tags', label: { ja: '値札を比べている', en: 'Comparing gift tags' } }
            : { id: 'reading-labels', label: { ja: 'お土産の札を読んでいる', en: 'Reading gift labels' } };
    }
    if (personId === 'aakash') {
        return returning
            ? { id: 'holding-bag', label: { ja: '小さな袋を持っている', en: 'Holding a small gift bag' } }
            : { id: 'browsing-shelves', label: { ja: '棚を見ている', en: 'Browsing the shelves' } };
    }
    if (personId === 'felix') {
        return returning
            ? { id: 'choosing-snack', label: { ja: 'お菓子を選んでいる', en: 'Choosing a snack' } }
            : { id: 'checking-display', label: { ja: '季節の台を見ている', en: 'Checking the seasonal display' } };
    }
    return undefined;
}

function worldParkPresence(
    options: WorldScreenOptions,
    personId: string,
): WorldPresence | undefined {
    if (options.place !== 'park') return undefined;
    const returning = (options.progress.worldVisits?.park ?? 0) % 2 === 1;
    if (personId === 'felix') {
        return returning
            ? { id: 'holding-page-to-light', label: { ja: '紙を空にかざしている', en: 'Holding the page to the light' } }
            : { id: 'comparing-sky-paper', label: { ja: '空と紙の色を比べている', en: 'Comparing the sky with the paper' } };
    }
    if (personId === 'peter') {
        return returning
            ? { id: 'watching-cloud-break', label: { ja: '雲の切れ間を見ている', en: 'Watching a break in the cloud' } }
            : { id: 'collecting-leaf', label: { ja: '落ち葉を一枚拾っている', en: 'Picking up one fallen leaf' } };
    }
    return undefined;
}

const WORLD_SPRITES: Readonly<Partial<Record<string, string>>> = {
    ...ACADEMY_ASSETS.characters.approved,
};

function worldExits(options: WorldScreenOptions, exits: readonly WorldPlaceId[]): HTMLElement {
    const section = element('nav', 'academy-world-exits academy-world-spatial-exits');
    section.setAttribute('aria-label', options.language === 'ja' ? '行き先' : 'Exits');
    const map = element('div', 'academy-world-map');
    map.dataset.worldMap = options.place;
    if (options.place === 'station') {
        const heading = element('p', 'academy-world-station-route-heading');
        heading.textContent = options.language === 'ja' ? '次はどこへ' : 'Where next?';
        map.append(heading);
    }
    const current = element('span', 'academy-world-map-current');
    current.dataset.worldMapCurrent = options.place;
    current.lang = 'ja';
    current.textContent = projectWorldPlace(options.place, options.progress).label.ja;
    const routes = element('div', 'academy-world-map-routes');
    map.append(current, routes);
    exits.slice(0, 6).forEach((id, index) => {
        const destination = projectWorldPlace(id, options.progress);
        const exit = element('button', 'academy-world-exit');
        exit.type = 'button';
        exit.dataset.location = id;
        exit.dataset.exitSlot = String(index);
        exit.dataset.direction = exitDirection(index);
        exit.dataset.route = destination.availability.state === 'open' ? worldRouteForPlace(id) : 'locked';
        exit.dataset.jpdbReaderSurfaceIgnore = '';
        exit.disabled = destination.availability.state === 'locked';
        const name = element('span', 'academy-world-exit-name');
        name.textContent = destination.label.ja;
        name.lang = 'ja';
        const reason = element('span', destination.availability.state === 'open'
            ? 'academy-world-exit-reason academy-primary-purpose'
            : 'academy-world-exit-reason');
        reason.textContent = worldExitReason(options, destination);
        exit.append(name, reason);
        exit.addEventListener('click', () => options.onTravel(id));
        routes.append(exit);
    });
    section.append(map);
    section.addEventListener('keydown', event => focusAdjacentExit(event, section));
    section.addEventListener('focusin', event => {
        if (!(event.target instanceof HTMLButtonElement) || !event.target.classList.contains('academy-world-exit')) return;
        event.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
    return section;
}

function worldExitReason(
    options: WorldScreenOptions,
    destination: ReturnType<typeof projectWorldPlace>,
): string {
    if (options.place === 'bookshop' && destination.id === 'library') {
        return options.language === 'ja'
            ? '見つけた語を図書館で復習する。'
            : 'Review the words you found in the library.';
    }
    if (options.place === 'bookshop' && destination.id === 'street') {
        return options.language === 'ja'
            ? '本を持って通学路へ戻る。'
            : 'Take the book back out to the street.';
    }
    return destination.availability.state === 'locked'
        ? destination.availability.reason?.[options.language] ?? ''
        : destination.activity.label[options.language];
}

function exitDirection(index: number): 'west' | 'east' | 'south' {
    if (index < 2) return 'west';
    if (index === 5) return 'south';
    return 'east';
}

function worldReward(
    options: WorldScreenOptions,
    stamp: WorldStamp,
    requiresActivity: boolean,
): HTMLElement {
    const reward = element('button', 'academy-world-reward');
    reward.type = 'button';
    reward.dataset.worldStamp = stamp.id;
    reward.dataset.rewardProp = stamp.prop;
    if (stamp.itemAssetId) reward.dataset.itemAssetId = stamp.itemAssetId;
    if (stamp.art) reward.dataset.itemPresentation = 'world-reward-prop';
    reward.dataset.itemState = stamp.claimed ? 'claimed' : requiresActivity ? 'locked' : 'ready';
    reward.disabled = stamp.claimed || requiresActivity;
    const prop = element('span', 'academy-world-reward-prop');
    prop.setAttribute('aria-hidden', 'true');
    if (stamp.art) {
        const art = document.createElement('img');
        art.src = stamp.art;
        art.alt = '';
        art.decoding = 'async';
        art.loading = 'eager';
        prop.append(art);
    }
    const label = element('span', 'academy-world-reward-label');
    label.textContent = stamp.label.ja;
    label.lang = 'ja';
    const use = element('span', 'academy-world-reward-use');
    use.textContent = stamp.claimed
        ? stamp.use[options.language]
        : requiresActivity
            ? options.language === 'ja' ? '今日の用事を終えるともらえる。' : 'Earn it by completing today’s activity.'
            : stamp.use[options.language];
    reward.append(prop, label, use);
    reward.addEventListener('click', () => {
        reward.dataset.itemState = 'claiming';
        options.onClaimStamp(stamp.id);
    });
    return reward;
}

function focusAdjacentExit(event: KeyboardEvent, root: HTMLElement): void {
    const direction = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].indexOf(event.key);
    if (direction < 0 || !(event.target instanceof HTMLButtonElement)) return;
    const exits = Array.from(root.querySelectorAll<HTMLButtonElement>('.academy-world-exit:not(:disabled)'));
    const currentIndex = exits.indexOf(event.target);
    if (currentIndex < 0 || exits.length < 2) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? exits.length - 1
            : (currentIndex + (direction < 2 ? -1 : 1) + exits.length) % exits.length;
    exits[nextIndex]?.focus();
}

export function renderJournalScreen(
    language: AcademyLanguage,
    _profile: LearnerProfileSnapshot,
    state: JournalCharacterState | LegacyJournalCharacterState,
    callbacks: Readonly<{
        onReplayRie: () => void;
        onReplayAakash: () => void;
        onRevisit?: (path: CharacterRevisitPath) => void;
        onProfileSync?: () => void;
    }>,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-journal-screen',
        plate: 'classroom',
        title: 'journalTitle',
    });
    const page = element('section', 'academy-character-page');
    page.hidden = true;
    const characters = journalCharacters(state);
    const directory = characterDirectory(language, characters, characterId => {
        const character = characters.find(candidate => candidate.characterId === characterId)!;
        const definition: CharacterPageDefinition = {
            characterId: character.characterId,
            portrait: character.portrait,
            spriteGallery: characterSpriteGallery(character.characterId),
            name: displayAcademyCastName(character.characterId, language),
            chapters: character.chapters,
            revisitPaths: character.revisitPaths,
            onRevisit: callbacks.onRevisit,
            ...(character.characterId === 'rie' ? {
                lineKey: 'journalRieLine' as const,
                replayKey: 'journalReplay' as const,
                onReplay: callbacks.onReplayRie,
            } : character.characterId === 'aakash' ? {
                lineKey: 'journalAakashLine' as const,
                replayKey: 'journalReplayAakash' as const,
                onReplay: callbacks.onReplayAakash,
            } : {}),
        };
        page.replaceChildren(characterPage(language, definition, () => {
            page.hidden = true;
            directory.hidden = false;
            directory.querySelector<HTMLButtonElement>(`[data-character="${characterId}"] button`)?.focus();
        }));
        directory.hidden = true;
        page.hidden = false;
        page.querySelector<HTMLButtonElement>('.academy-character-page-back')?.focus();
    });
    if (callbacks.onProfileSync) {
        const profileSync = element('button', 'academy-button academy-journal-profile-sync');
        profileSync.type = 'button';
        profileSync.textContent = language === 'ja' ? 'プロフィールと同期' : 'Profile & sync';
        profileSync.addEventListener('click', callbacks.onProfileSync);
        content.append(profileSync);
    }
    const learningLines = 'characters' in state ? state.journalLines ?? [] : [];
    if (learningLines.length) content.append(journalLearningLines(language, learningLines));
    content.append(directory, page);
    return screen;
}

export interface JournalCharacterState {
    readonly characters: readonly CharacterDirectoryEntryProjection[];
    readonly journalLines?: readonly Extract<LearnerEvent, { kind: 'journal-line-recorded' }>[];
}

type LegacyJournalCharacterState = Readonly<{
    rieChapters: readonly number[];
    aakashChapters: readonly number[];
    aakashUnlocked: boolean;
}>;

function journalCharacters(
    state: JournalCharacterState | LegacyJournalCharacterState,
): readonly CharacterDirectoryEntryProjection[] {
    if ('characters' in state) return state.characters;
    return ACADEMY_CAST
        .filter((member): member is typeof member & { category: 'teacher' | 'classmate' | 'extended-member' } =>
            member.category !== 'textbook-legend')
        .map(member => {
            const unlocked = member.id === 'rie' || member.id === 'aakash' && state.aakashUnlocked;
            const portrait = DIRECTORY_PORTRAITS[member.id];
            return {
                characterId: member.id as CharacterDirectoryEntryProjection['characterId'],
                name: member.firstName,
                category: member.category,
                unlocked,
                chapters: member.id === 'rie' ? state.rieChapters : member.id === 'aakash' ? state.aakashChapters : [],
                revisitPaths: [],
                ...(unlocked && portrait ? { portrait } : {}),
            };
        });
}

function journalLearningLines(
    language: AcademyLanguage,
    lines: readonly Extract<LearnerEvent, { kind: 'journal-line-recorded' }>[],
): HTMLElement {
    const section = element('section', 'academy-journal-learning-lines');
    section.setAttribute('aria-label', language === 'ja' ? '学習の日誌' : 'Learning journal');
    const heading = element('h2');
    heading.textContent = language === 'ja' ? '学習の日誌' : 'Learning journal';
    section.append(heading);
    [...lines]
        .sort((left, right) => left.at - right.at || left.journalLineId.localeCompare(right.journalLineId))
        .forEach(line => {
            const entry = element('blockquote', 'academy-journal-learning-line');
            entry.dataset.journalLineId = line.journalLineId;
            entry.dataset.activityId = line.activityId;
            entry.textContent = line.text[language];
            section.append(entry);
        });
    return section;
}

const DIRECTORY_PORTRAITS: Readonly<Partial<Record<string, string>>> = {
    ...ACADEMY_ASSETS.characters.journalReview,
};

function characterDirectory(
    language: AcademyLanguage,
    characters: readonly CharacterDirectoryEntryProjection[],
    onOpen: (characterId: string) => void,
): HTMLElement {
    const directory = element('section', 'academy-character-directory');
    directory.setAttribute('aria-label', language === 'ja' ? '登場人物' : 'Characters');
    characters.forEach((character, order) => {
        const member = ACADEMY_CAST.find(candidate => candidate.id === character.characterId)!;
        directory.append(characterDirectoryEntry(
            language,
            member,
            character,
            order,
            () => onOpen(member.id),
        ));
    });
    return directory;
}

function characterDirectoryEntry(
    language: AcademyLanguage,
    member: AcademyCastMember,
    character: CharacterDirectoryEntryProjection,
    order: number,
    onOpen: () => void,
): HTMLElement {
    const entry = element('article', 'academy-character-entry');
    entry.dataset.character = member.id;
    entry.dataset.unlocked = String(character.unlocked);
    entry.style.setProperty('--academy-character-order', String(Math.min(12, order)));
    const displayName = displayAcademyCastName(member.id, language);

    const open = element('button', 'academy-character-open');
    open.type = 'button';
    open.disabled = !character.unlocked;
    open.setAttribute('aria-label', character.unlocked
        ? `${language === 'ja' ? 'ページを開く' : 'Open page'}: ${displayName}`
        : `${displayName}: ${language === 'ja' ? '出会うとページが開きます' : 'Meet them to open their page'}`);
    if (character.unlocked) open.addEventListener('click', onOpen);
    entry.dataset.portraitState = character.portrait ? 'available' : character.unlocked ? 'name-only' : 'locked';

    if (character.portrait) {
        const sprite = createAcademySprite({
            characterId: member.id,
            alt: '',
            className: 'academy-character-portrait',
            expressions: { neutral: { still: character.portrait } },
        });
        sprite.setAttribute('aria-hidden', 'true');
        sprite.querySelector('img')?.addEventListener('error', () => {
            entry.dataset.portraitState = 'unavailable';
            sprite.remove();
        }, { once: true });
        open.append(sprite);
    }

    const name = element('h3', 'academy-character-name');
    name.textContent = displayName;
    const state = element('p', 'academy-character-state');
    state.textContent = character.unlocked
        ? language === 'ja' ? 'ページを開く' : 'Open page'
        : language === 'ja' ? '出会うとページが開きます' : 'Meet them to open their page';
    const caption = element('div', 'academy-character-caption');
    caption.append(name, state);
    open.append(caption);
    entry.append(open);
    return entry;
}

interface CharacterPageDefinition {
    readonly characterId: CharacterDirectoryEntryProjection['characterId'];
    readonly portrait?: string;
    readonly spriteGallery?: Readonly<Record<string, string>>;
    readonly name: string;
    readonly chapters: readonly number[];
    readonly revisitPaths: readonly CharacterRevisitPath[];
    readonly onRevisit?: (path: CharacterRevisitPath) => void;
    readonly lineKey?: 'journalRieLine' | 'journalAakashLine';
    readonly replayKey?: 'journalReplay' | 'journalReplayAakash';
    readonly onReplay?: () => void;
}

function characterPage(
    language: AcademyLanguage,
    definition: CharacterPageDefinition,
    onBack: () => void,
): HTMLElement {
    const page = element('article', 'academy-journal-profile academy-character-dossier');
    const hasSpriteGallery = Boolean(definition.spriteGallery && Object.keys(definition.spriteGallery).length);
    if (hasSpriteGallery) page.classList.add('academy-character-dossier-gallery');
    if (definition.characterId === 'rie' || definition.characterId === 'aakash') {
        page.classList.add(`academy-journal-${definition.characterId}`);
    }
    page.dataset.character = definition.characterId;
    const back = backButton(language);
    back.classList.add('academy-character-page-back');
    back.addEventListener('click', onBack);
    const copy = element('div', 'academy-journal-copy');
    const name = element('h2');
    name.textContent = definition.name;
    copy.append(name, relationshipPages(language, definition.chapters));
    if (definition.lineKey) {
        const line = copyElement('blockquote', '', language, definition.lineKey);
        copy.append(line);
    }
    if (definition.onRevisit && definition.revisitPaths.length) {
        const revisits = element('div', 'academy-character-revisits');
        definition.revisitPaths.forEach(path => {
            const revisit = element('button', 'academy-button academy-button-secondary academy-character-revisit');
            revisit.type = 'button';
            revisit.dataset.encounterId = path.encounterId;
            revisit.dataset.revisitKind = path.kind;
            revisit.textContent = characterRevisitLabel(language, path.kind);
            revisit.addEventListener('click', () => definition.onRevisit?.(path));
            revisits.append(revisit);
        });
        copy.append(revisits);
    } else if (definition.replayKey && definition.onReplay) {
        const replay = copyButton(language, definition.replayKey, 'academy-button academy-button-secondary');
        replay.addEventListener('click', definition.onReplay);
        copy.append(replay);
    }
    page.append(back);
    if (definition.portrait && !hasSpriteGallery) {
        const portrait = element('img', 'academy-journal-portrait');
        if (definition.characterId === 'aakash') portrait.classList.add('academy-journal-aakash-portrait');
        portrait.src = definition.portrait;
        portrait.alt = definition.name;
        page.append(portrait);
    }
    if (hasSpriteGallery) {
        const gallery = element('div', 'academy-character-sprite-gallery');
        gallery.dataset.character = definition.characterId;
        Object.entries(definition.spriteGallery!).forEach(([variant, source]) => {
            const [expression, angle] = variant.includes(':') ? variant.split(':', 2) : [undefined, variant];
            const sprite = element('img', 'academy-character-sprite-gallery-image');
            sprite.src = source;
            sprite.alt = '';
            sprite.decoding = 'async';
            sprite.loading = 'lazy';
            sprite.setAttribute('aria-hidden', 'true');
            sprite.dataset.angle = angle;
            if (expression) sprite.dataset.expression = expression;
            gallery.append(sprite);
        });
        page.append(gallery);
    }
    page.append(copy);
    return page;
}

function characterSpriteGallery(characterId: CharacterDirectoryEntryProjection['characterId']): Readonly<Record<string, string>> | undefined {
    return (ACADEMY_ASSETS.characterSpriteGalleries as Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>)
        [characterId];
}

function characterRevisitLabel(language: AcademyLanguage, kind: CharacterRevisitPath['kind']): string {
    const labels = {
        memory: { en: 'Revisit memory', ja: '思い出をもう一度' },
        'class-week': { en: 'Revisit class', ja: '授業をもう一度' },
        'story-episode': { en: 'Revisit story', ja: '物語をもう一度' },
    } as const;
    return labels[kind][language];
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
