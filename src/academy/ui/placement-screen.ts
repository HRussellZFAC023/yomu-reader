import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { JlptBand } from '../domain/learner-record';
import {
    emptyPlacementProduction,
    type PlacementListeningMode,
    type PlacementMockDraft,
    type PlacementMockProgress,
    type PlacementSpeakingMode,
    type PlacementWritingMode,
} from '../domain/placement-session';
import {
    ORIENTATION_MOCK_POLICY,
    orientationItemsForBand,
    placementAudioDelivery,
    placementProductionPrompt,
    scoreOrientationMock,
    type PlacementItem,
    type OrientationMockResult,
} from '../placement/orientation';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { ACADEMY_ASSETS } from '../assets';
import { ACADEMY_BANDS } from './start-screen';
import { backButton, copyButton, copyElement, element, fieldError, localizedElement, screenFrame } from './dom';

export interface PlacementMockOptions {
    readonly language: AcademyLanguage;
    readonly pronunciation: PronunciationService;
    readonly progress?: PlacementMockProgress;
    readonly onProgress?: (progress: PlacementMockProgress) => Promise<void> | void;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
    readonly onMove?: () => void;
    readonly onConfirm?: () => void;
    readonly onCancel?: () => void;
    readonly onResult: (result: OrientationMockResult, draft: PlacementMockDraft) => Promise<void> | void;
    readonly onBack: () => Promise<void> | void;
}

export function renderPlacementMockScreen(options: PlacementMockOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-placement-screen',
        plate: 'classroom',
        title: 'mockTitle',
        body: 'mockBody',
    });
    screen.dataset.academyRoute = 'placement-mock';
    panel.classList.add('academy-placement-stage');
    appendRieGuide(panel, options.language);

    const form = element('form', 'academy-form academy-placement-form');
    const target = bandSelect(options.language);
    const briefing = placementBriefing(options.language);
    briefing.hidden = true;
    const progress = element('div', 'academy-placement-progress');
    progress.setAttribute('aria-live', 'polite');
    progress.setAttribute('aria-atomic', 'true');
    const progressLabel = element('span', 'academy-placement-progress-label');
    const progressDots = element('span', 'academy-placement-progress-dots');
    progress.append(progressLabel, progressDots);
    const assessmentHost = element('div', 'academy-placement-assessment-host');
    const feedback = element('div', 'academy-form-feedback');
    const submit = copyButton(options.language, 'mockSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    submit.hidden = true;
    const next = copyButton(options.language, 'continue', 'academy-button academy-button-primary');
    const back = backButton(options.language);
    const actions = element('div', 'academy-placement-actions');
    actions.append(back, next, submit);
    form.append(target.fieldset, progress, briefing, assessmentHost, feedback, actions);
    content.append(form);

    let playback: Disposable | null = null;
    let playbackRequest = 0;
    let disposed = false;
    let listeningActive = false;
    let actionBusy = false;
    let inputSaveTimer: number | undefined;
    let saveTail: Promise<void> = Promise.resolve();
    const sourcePlayers = new Set<HTMLAudioElement>();
    let draft = options.progress ? cloneDraft(options.progress.draft) : null;
    let step = options.progress?.step ?? 0;
    let activeItems: readonly PlacementItem[] = [];
    let steps: HTMLElement[] = [target.fieldset];
    let productionDesk: HTMLElement | null = null;

    const stopListening = (): void => {
        if (!listeningActive) return;
        listeningActive = false;
        options.onListeningStop?.();
    };
    const stopPlayback = (): void => {
        playbackRequest += 1;
        playback?.dispose();
        playback = null;
        sourcePlayers.forEach(player => { if (!player.paused) player.pause(); });
        stopListening();
    };
    const reportSaveError = (): void => {
        if (!disposed) feedback.replaceChildren(fieldError(academyText(options.language, 'mockSaveError')));
    };
    const enqueueProgress = (value: PlacementMockProgress): Promise<void> => {
        const write = saveTail.then(async () => {
            await options.onProgress?.(value);
        });
        saveTail = write.catch(() => undefined);
        return write;
    };
    const currentProgress = (nextStep = step, submitted = false): PlacementMockProgress | null => draft ? {
        schemaVersion: 1,
        step: nextStep,
        submitted,
        draft: cloneDraft(draft),
    } : null;
    const persistCurrent = async (nextStep = step, submitted = false): Promise<void> => {
        const value = currentProgress(nextStep, submitted);
        if (value) await enqueueProgress(value);
    };
    const scheduleProgress = (): void => {
        if (inputSaveTimer !== undefined) window.clearTimeout(inputSaveTimer);
        inputSaveTimer = window.setTimeout(() => {
            inputSaveTimer = undefined;
            void persistCurrent().catch(reportSaveError);
        }, 120);
    };
    const updateDraft = (nextDraft: PlacementMockDraft): void => {
        draft = nextDraft;
        scheduleProgress();
    };
    const setListeningMode = (itemId: string, mode: PlacementListeningMode): void => {
        if (!draft) return;
        if (draft.listeningModes[itemId] === 'transcript-alternative' && mode === 'audio') return;
        updateDraft({
            ...draft,
            listeningModes: { ...draft.listeningModes, [itemId]: mode },
        });
    };
    const recordResponse = (itemId: string, value: string): void => {
        if (!draft) return;
        updateDraft({ ...draft, responses: { ...draft.responses, [itemId]: value } });
    };
    const beginListening = (): void => {
        if (listeningActive) return;
        listeningActive = true;
        options.onListeningStart?.();
    };

    const createQuestion = (item: PlacementItem): HTMLElement => {
        const fieldset = element('fieldset', 'academy-mock-item');
        fieldset.dataset.mockItem = item.id;
        fieldset.setAttribute('aria-label', item.prompt[options.language]);
        fieldset.append(localizedElement('legend', 'academy-mock-prompt', options.language, item.prompt));
        if (item.passage) fieldset.append(localizedElement('p', 'academy-mock-passage', 'ja', item.passage));

        const audioDelivery = placementAudioDelivery(item);
        if (audioDelivery) {
            const listening = element('div', 'academy-placement-listening');
            const audioError = element('span', 'academy-field-error');
            if (audioDelivery.kind === 'source-recording') {
                const player = document.createElement('audio');
                player.className = 'academy-placement-source-audio';
                player.controls = true;
                player.preload = 'metadata';
                player.src = audioDelivery.url;
                player.dataset.audioDelivery = 'source-recording';
                player.dataset.audioSha256 = audioDelivery.sha256;
                player.setAttribute('aria-label', academyText(options.language, 'mockSourceRecordingLabel'));
                player.addEventListener('play', () => {
                    sourcePlayers.forEach(other => { if (other !== player && !other.paused) other.pause(); });
                    beginListening();
                    setListeningMode(item.id, 'audio');
                });
                ['pause', 'ended', 'error'].forEach(type => player.addEventListener(type, () => {
                    if (type === 'error') audioError.textContent = academyText(options.language, 'mockSourceRecordingUnavailable');
                    stopListening();
                }));
                sourcePlayers.add(player);
                listening.append(player);
            } else {
                const play = copyButton(options.language, 'mockPlayAudio', 'academy-button academy-button-secondary academy-placement-listen');
                play.dataset.audioDelivery = 'browser-speech';
                play.addEventListener('click', () => {
                    const request = ++playbackRequest;
                    playback?.dispose();
                    playback = null;
                    stopListening();
                    audioError.textContent = '';
                    play.disabled = true;
                    beginListening();
                    void options.pronunciation.play(audioDelivery.text).then(active => {
                        if (disposed || request !== playbackRequest) {
                            active.dispose();
                            return;
                        }
                        playback = active;
                        setListeningMode(item.id, 'audio');
                    }).catch(() => {
                        if (!disposed && request === playbackRequest) {
                            audioError.textContent = academyText(options.language, 'mockAudioUnavailable');
                        }
                        stopListening();
                    }).finally(() => {
                        if (!disposed && request === playbackRequest) play.disabled = false;
                    });
                });
                listening.append(play);
            }
            const transcript = element('div', 'academy-placement-transcript');
            transcript.hidden = draft?.listeningModes[item.id] !== 'transcript-alternative';
            transcript.append(
                localizedElement('p', 'academy-placement-transcript-line', 'ja', { en: item.spokenJapanese ?? '', ja: item.spokenJapanese ?? '' }),
                copyElement('p', 'academy-placement-transcript-note', options.language, 'mockTranscriptNotice'),
            );
            const useText = copyButton(options.language, 'mockTranscriptAlternative', 'academy-button academy-button-tertiary academy-placement-text-alternative');
            useText.setAttribute('aria-expanded', String(!transcript.hidden));
            useText.addEventListener('click', () => {
                stopPlayback();
                transcript.hidden = false;
                useText.setAttribute('aria-expanded', 'true');
                setListeningMode(item.id, 'transcript-alternative');
                options.onConfirm?.();
            });
            listening.append(useText, transcript, audioError);
            fieldset.append(listening);
        }

        fieldset.append(copyElement('p', 'academy-mock-instruction', options.language, 'mockChooseAnswer'));
        const choices = element('div', 'academy-mock-options');
        item.options.forEach(option => {
            const label = element('label', 'academy-mock-option');
            label.dataset.jpdbReaderSurfaceIgnore = '';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = item.id;
            input.value = option.id;
            input.required = true;
            input.checked = draft?.responses[item.id] === option.id;
            input.addEventListener('change', () => {
                if (input.checked) recordResponse(item.id, option.id);
            });
            const copy = element('span', 'academy-mock-option-copy');
            copy.lang = 'ja';
            copy.dataset.jpdbReaderSurfaceIgnore = '';
            copy.textContent = option.label.ja;
            label.append(input, copy);
            choices.append(label);
        });
        fieldset.append(choices);
        return fieldset;
    };

    const updateProductionFromControls = (schedule = true): void => {
        if (!draft || !productionDesk) return;
        const speakingMode = checkedValue<PlacementSpeakingMode>(productionDesk, 'placement-speaking-mode') ?? 'aloud';
        const writingMode = checkedValue<PlacementWritingMode>(productionDesk, 'placement-writing-mode') ?? 'typed';
        const speakingResponse = productionDesk.querySelector<HTMLTextAreaElement>('[name="placement-speaking-response"]')?.value ?? '';
        const writingResponse = productionDesk.querySelector<HTMLTextAreaElement>('[name="placement-writing-response"]')?.value ?? '';
        const speakingChecked = Boolean(productionDesk.querySelector<HTMLInputElement>('[name="placement-speaking-complete"]:checked'));
        const writingChecked = Boolean(productionDesk.querySelector<HTMLInputElement>('[name="placement-writing-complete"]:checked'));
        const speakingRating = checkedNumber(productionDesk, 'placement-speaking-confidence');
        const writingRating = checkedNumber(productionDesk, 'placement-writing-confidence');
        draft = {
            ...draft,
            production: {
                speaking: {
                    mode: speakingMode,
                    completed: speakingMode === 'aloud' ? speakingChecked : Boolean(speakingResponse.trim()),
                    response: speakingResponse,
                    confidence: speakingRating ?? draft.production.speaking.confidence,
                    rated: speakingRating !== undefined,
                },
                writing: {
                    mode: writingMode,
                    completed: writingMode === 'typed' ? Boolean(writingResponse.trim()) : writingChecked,
                    response: writingResponse,
                    confidence: writingRating ?? draft.production.writing.confidence,
                    rated: writingRating !== undefined,
                },
            },
        };
        if (schedule) scheduleProgress();
    };

    const buildAssessment = (band: JlptBand): void => {
        stopPlayback();
        if (!draft || draft.targetBand !== band) {
            draft = {
                targetBand: band,
                responses: {},
                listeningModes: {},
                production: emptyPlacementProduction(),
            };
        }
        target.select.value = band;
        activeItems = orientationItemsForBand(band);
        const questions = activeItems.map(createQuestion);
        productionDesk = createProductionDesk(options.language, band, draft, updateProductionFromControls);
        assessmentHost.replaceChildren(...questions, productionDesk);
        steps = [target.fieldset, briefing, ...questions, productionDesk];
    };

    const showStep = (nextStep: number): void => {
        stopPlayback();
        step = Math.max(0, Math.min(nextStep, steps.length - 1));
        steps.forEach((entry, index) => { entry.hidden = index !== step; });
        const choosingLevel = step === 0;
        const finalStep = !choosingLevel && step === steps.length - 1;
        submit.hidden = !finalStep;
        next.hidden = finalStep;
        progressLabel.textContent = choosingLevel
            ? (options.language === 'ja' ? '試すレベルを選ぶ' : 'Choose a level')
            : (options.language === 'ja' ? `${step} / ${steps.length - 1}` : `Step ${step} of ${steps.length - 1}`);
        progressDots.replaceChildren(...steps.slice(1).map((_, index) => {
            const dot = element('i', index < step ? 'is-active' : '');
            dot.setAttribute('aria-hidden', 'true');
            return dot;
        }));
        feedback.replaceChildren();
        const activeStep = steps[step];
        const activeControl = activeStep?.querySelector<HTMLElement>('input:checked')
            ?? activeStep?.querySelector<HTMLElement>('select, input, textarea, button');
        const scrollHost = screen.parentElement?.classList.contains('academy-screen-host') ? screen.parentElement : null;
        content.scrollTop = 0;
        screen.scrollTop = 0;
        if (scrollHost) scrollHost.scrollTop = 0;
        (choosingLevel ? activeStep : progress)?.scrollIntoView?.({ block: 'nearest' });
        activeControl?.focus({ preventScroll: true });
    };

    const moveTo = async (nextStep: number): Promise<void> => {
        if (actionBusy) return;
        actionBusy = true;
        next.disabled = true;
        back.disabled = true;
        if (inputSaveTimer !== undefined) {
            window.clearTimeout(inputSaveTimer);
            inputSaveTimer = undefined;
        }
        updateProductionFromControls(false);
        try {
            await persistCurrent(nextStep, false);
            showStep(nextStep);
        } catch {
            reportSaveError();
        } finally {
            actionBusy = false;
            next.disabled = false;
            back.disabled = false;
        }
    };

    next.addEventListener('click', () => {
        if (actionBusy) return;
        if (step === 0) {
            if (!isJlptBand(target.select.value)) {
                feedback.replaceChildren(fieldError(options.language === 'ja'
                    ? '試すレベルを選んでください。'
                    : 'Choose the level you want to try.'));
                return;
            }
            buildAssessment(target.select.value);
            options.onConfirm?.();
            void moveTo(1);
            return;
        }
        const itemId = steps[step]?.dataset.mockItem;
        if (itemId && !steps[step]?.querySelector<HTMLInputElement>('input[type="radio"]:checked')) {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockIncomplete')));
            return;
        }
        const item = itemId ? activeItems.find(candidate => candidate.id === itemId) : undefined;
        if (item?.skill === 'listening' && !draft?.listeningModes[item.id]) {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockListeningRequired')));
            return;
        }
        options.onConfirm?.();
        void moveTo(step + 1);
    });

    back.addEventListener('click', () => {
        if (actionBusy) return;
        options.onCancel?.();
        if (step === 0) {
            actionBusy = true;
            void Promise.resolve(options.onBack()).finally(() => { actionBusy = false; });
            return;
        }
        void moveTo(step - 1);
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (actionBusy || !draft) return;
        updateProductionFromControls(false);
        if (!productionIsComplete(draft)) {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockProductionIncomplete')));
            return;
        }
        actionBusy = true;
        submit.disabled = true;
        back.disabled = true;
        options.onConfirm?.();
        const submittedDraft = cloneDraft(draft);
        const confidence = {
            speaking: submittedDraft.production.speaking.confidence,
            writing: submittedDraft.production.writing.confidence,
        };
        void persistCurrent(steps.length - 1, true).then(() => options.onResult(
            scoreOrientationMock(
                submittedDraft.targetBand,
                submittedDraft.responses,
                confidence,
                submittedDraft.listeningModes,
            ),
            submittedDraft,
        )).catch(() => {
            reportSaveError();
            actionBusy = false;
            submit.disabled = false;
            back.disabled = false;
        });
    });

    if (draft) buildAssessment(draft.targetBand);
    showStep(draft ? Math.min(step, steps.length - 1) : 0);
    screen.addEventListener('focusin', event => {
        if ((event.target as HTMLElement | null)?.matches('button, input, select, textarea')) options.onMove?.();
    });
    screen.addEventListener('academy:dispose', () => {
        disposed = true;
        if (inputSaveTimer !== undefined) window.clearTimeout(inputSaveTimer);
        stopPlayback();
        sourcePlayers.forEach(player => player.removeAttribute('src'));
        sourcePlayers.clear();
    }, { once: true });
    return screen;
}

export interface PlacementResultOptions {
    readonly language: AcademyLanguage;
    readonly result: OrientationMockResult;
    readonly draft?: PlacementMockDraft;
    readonly onAccept: () => Promise<void> | void;
    readonly onChoose: () => Promise<void> | void;
    readonly onReview: () => Promise<void> | void;
}

export function renderPlacementResultScreen(options: PlacementResultOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-placement-result-screen',
        plate: 'classroom',
        title: 'mockResultTitle',
        body: 'mockResultBody',
    });
    screen.dataset.academyRoute = 'placement-result';
    panel.classList.add('academy-placement-stage');
    appendRieGuide(panel, options.language);
    const scores = element('dl', 'academy-score-grid');
    const rows: readonly [AcademyCopyKey, number, 'graded' | 'self-reported'][] = [
        ['mockKnowledge', options.result.scores['language-knowledge'], 'graded'],
        ['mockReading', options.result.scores.reading, 'graded'],
        ['mockListening', options.result.scores.listening, 'graded'],
        ['mockSpeaking', options.result.scores['speaking-confidence'], 'self-reported'],
        ['mockWriting', options.result.scores['writing-confidence'], 'self-reported'],
    ];
    rows.forEach(([key, value, kind]) => {
        scores.append(copyElement('dt', '', options.language, key), scoreBar(value, options.language, kind));
    });
    const recommendation = element('div', 'academy-recommendation');
    recommendation.append(
        copyElement('span', 'academy-eyebrow', options.language, 'mockRecommendation'),
        element('strong', 'academy-recommendation-band'),
    );
    const band = recommendation.querySelector('strong');
    if (band) band.textContent = options.result.recommendedStart === 'lesson-zero'
        ? (options.language === 'ja' ? 'レッスン0' : 'Lesson 0')
        : options.result.recommendedStart.toUpperCase();
    const evidenceNote = copyElement('p', 'academy-placement-evidence-note', options.language, 'mockResultEvidence');
    const usedTextAlternative = Object.values(options.draft?.listeningModes ?? {})
        .includes('transcript-alternative');
    const transcriptNote = usedTextAlternative
        ? copyElement('p', 'academy-placement-transcript-evidence-note', options.language, 'mockResultTranscriptEvidence')
        : null;
    const continuityNote = copyElement('p', 'academy-placement-continuity-note', options.language, 'mockResultContinuity');
    continuityNote.dataset.storyProgression = ORIENTATION_MOCK_POLICY.storyProgression;
    const accept = copyButton(options.language, 'mockUseRecommendation', 'academy-button academy-button-primary');
    const choose = copyButton(options.language, 'mockChooseMyself', 'academy-button academy-button-secondary');
    const back = backButton(options.language);
    back.classList.add('academy-placement-back', 'academy-placement-review');
    const feedback = element('div', 'academy-form-feedback');
    const buttons = [back, choose, accept];
    let busy = false;
    const invoke = (action: () => Promise<void> | void): void => {
        if (busy) return;
        busy = true;
        buttons.forEach(button => { button.disabled = true; });
        void Promise.resolve(action()).catch(() => {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockSaveError')));
            busy = false;
            buttons.forEach(button => { button.disabled = false; });
        });
    };
    accept.addEventListener('click', () => invoke(options.onAccept));
    choose.addEventListener('click', () => invoke(options.onChoose));
    back.addEventListener('click', () => invoke(options.onReview));
    const actions = element('div', 'academy-placement-actions');
    actions.append(back, choose, accept);
    content.append(scores, recommendation, evidenceNote);
    if (transcriptNote) content.append(transcriptNote);
    content.append(continuityNote, feedback, actions);
    return screen;
}

function appendRieGuide(panel: HTMLElement, language: AcademyLanguage): void {
    const guide = element('div', 'academy-placement-guide');
    const image = element('img', 'academy-placement-guide-character');
    image.src = ACADEMY_ASSETS.rie;
    image.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    guide.append(image);
    panel.prepend(guide);
}

function placementBriefing(language: AcademyLanguage): HTMLElement {
    const section = element('section', 'academy-placement-briefing');
    section.append(
        copyElement('h2', 'academy-placement-step-title', language, 'mockGuideTitle'),
        copyElement('p', 'academy-placement-step-body', language, 'mockGuideBody'),
    );
    const lines = element('div', 'academy-placement-briefing-lines');
    (['mockGuideLanguage', 'mockGuideReading', 'mockGuideListening'] as const)
        .forEach(key => lines.append(copyElement('p', 'academy-placement-briefing-line', language, key)));
    section.append(lines);
    return section;
}

function createProductionDesk(
    language: AcademyLanguage,
    band: JlptBand,
    draft: PlacementMockDraft,
    onChange: () => void,
): HTMLElement {
    const section = element('section', 'academy-placement-production');
    section.append(
        copyElement('h2', 'academy-placement-step-title', language, 'mockProductionTitle'),
        copyElement('p', 'academy-placement-step-body', language, 'mockProductionBody'),
    );
    const prompts = placementProductionPrompt(band);
    section.append(
        productionTask(language, 'speaking', prompts.speaking, draft, onChange),
        productionTask(language, 'writing', prompts.writing, draft, onChange),
    );
    return section;
}

function productionTask(
    language: AcademyLanguage,
    kind: 'speaking' | 'writing',
    prompt: ReturnType<typeof placementProductionPrompt>['speaking'],
    draft: PlacementMockDraft,
    onChange: () => void,
): HTMLElement {
    const attempt = draft.production[kind];
    const fieldset = element('fieldset', `academy-placement-production-task academy-placement-production-${kind}`);
    fieldset.append(
        copyElement('legend', 'academy-placement-production-legend', language,
            kind === 'speaking' ? 'mockSpeakingConfidence' : 'mockWritingConfidence'),
        localizedElement('p', 'academy-placement-production-model', language, prompt.model),
        localizedElement('p', 'academy-placement-production-prompt', language, prompt.task),
    );
    const modes = element('div', 'academy-placement-production-modes');
    const modeValues = kind === 'speaking'
        ? ([['aloud', 'mockModeAloud'], ['typed-alternative', 'mockModeTypeInstead']] as const)
        : ([['typed', 'mockModeTyped'], ['paper-alternative', 'mockModePaper']] as const);
    modeValues.forEach(([value, key]) => {
        const label = element('label', 'academy-placement-mode');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `placement-${kind}-mode`;
        input.value = value;
        input.checked = attempt.mode === value;
        input.addEventListener('change', () => {
            syncProductionMode(fieldset, kind, value);
            onChange();
        });
        label.append(input, copyElement('span', '', language, key));
        modes.append(label);
    });
    fieldset.append(modes);

    const direct = element('label', 'academy-placement-production-direct');
    const directCheck = document.createElement('input');
    directCheck.type = 'checkbox';
    directCheck.name = `placement-${kind}-complete`;
    directCheck.checked = attempt.completed && (kind === 'speaking' ? attempt.mode === 'aloud' : attempt.mode === 'paper-alternative');
    directCheck.addEventListener('change', onChange);
    direct.append(directCheck, copyElement('span', '', language,
        kind === 'speaking' ? 'mockTriedAloud' : 'mockWroteOnPaper'));
    fieldset.append(direct);

    const response = document.createElement('textarea');
    response.className = 'academy-input academy-placement-production-response';
    response.name = `placement-${kind}-response`;
    response.rows = 3;
    response.maxLength = 2_000;
    response.placeholder = academyText(language, 'mockResponsePlaceholder');
    response.setAttribute('aria-label', academyText(language,
        kind === 'speaking' ? 'mockSpeakingConfidence' : 'mockWritingConfidence'));
    response.value = attempt.response;
    response.addEventListener('input', onChange);
    fieldset.append(response);

    const confidence = element('fieldset', 'academy-placement-self-check');
    confidence.append(copyElement('legend', 'academy-placement-self-check-legend', language, 'mockConfidenceLegend'));
    ([
        [0, 'mockConfidenceNotYet'],
        [0.5, 'mockConfidenceSupported'],
        [1, 'mockConfidenceIndependent'],
    ] as const).forEach(([value, key]) => {
        const label = element('label', 'academy-placement-self-check-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `placement-${kind}-confidence`;
        input.value = String(value);
        input.checked = attempt.rated && attempt.confidence === value;
        input.addEventListener('change', onChange);
        label.append(input, copyElement('span', '', language, key));
        confidence.append(label);
    });
    fieldset.append(confidence);
    syncProductionMode(fieldset, kind, attempt.mode);
    return fieldset;
}

function syncProductionMode(fieldset: HTMLElement, kind: 'speaking' | 'writing', mode: string): void {
    const direct = fieldset.querySelector<HTMLElement>('.academy-placement-production-direct');
    const response = fieldset.querySelector<HTMLTextAreaElement>('.academy-placement-production-response');
    const directMode = kind === 'speaking' ? mode === 'aloud' : mode === 'paper-alternative';
    if (direct) direct.hidden = !directMode;
    if (response) response.hidden = directMode;
}

function productionIsComplete(draft: PlacementMockDraft): boolean {
    return draft.production.speaking.completed
        && draft.production.speaking.rated
        && draft.production.writing.completed
        && draft.production.writing.rated;
}

function checkedValue<T extends string>(root: ParentNode, name: string): T | undefined {
    return root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value as T | undefined;
}

function checkedNumber(root: ParentNode, name: string): number | undefined {
    const value = checkedValue(root, name);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function cloneDraft(draft: PlacementMockDraft): PlacementMockDraft {
    return {
        targetBand: draft.targetBand,
        responses: { ...draft.responses },
        listeningModes: { ...draft.listeningModes },
        production: {
            speaking: { ...draft.production.speaking },
            writing: { ...draft.production.writing },
        },
    };
}

function bandSelect(language: AcademyLanguage): { fieldset: HTMLFieldSetElement; select: HTMLSelectElement } {
    const fieldset = element('fieldset', 'academy-target-band');
    fieldset.setAttribute('aria-label', academyText(language, 'mockTargetLegend'));
    fieldset.append(copyElement('legend', 'academy-label', language, 'mockTargetLegend'));
    const select = element('select', 'academy-input');
    select.required = true;
    select.setAttribute('aria-label', academyText(language, 'mockTargetLegend'));
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = language === 'ja' ? 'レベルを選ぶ' : 'Choose N5–N1';
    select.append(placeholder);
    ACADEMY_BANDS.forEach(([value, key]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = academyText(language, key);
        select.append(option);
    });
    fieldset.append(select);
    return { fieldset, select };
}

function isJlptBand(value: string): value is JlptBand {
    return ['n5', 'n4', 'n3', 'n2', 'n1'].includes(value);
}

function scoreBar(value: number, language: AcademyLanguage, kind: 'graded' | 'self-reported' = 'graded'): HTMLElement {
    const row = element('dd', kind === 'self-reported' ? 'academy-score academy-score-self-reported' : 'academy-score');
    const meter = element('span', kind === 'self-reported' ? 'academy-score-meter academy-score-meter-hollow' : 'academy-score-meter');
    meter.style.setProperty('--academy-score', String(value));
    const copy = element('span', 'academy-score-value');
    if (kind === 'self-reported') {
        const key: AcademyCopyKey = value <= 0 ? 'mockConfidenceNotYet'
            : value < 1 ? 'mockConfidenceSupported'
                : 'mockConfidenceIndependent';
        copy.textContent = academyText(language, key);
        row.setAttribute('aria-label', `${academyText(language, key)}. ${language === 'ja' ? '自己確認' : 'Self-check'}`);
    } else {
        copy.textContent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value);
    }
    row.append(meter, copy);
    return row;
}
