import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { JlptBand } from '../domain/learner-record';
import {
    ORIENTATION_MOCK_POLICY,
    orientationItemsForBand,
    placementAudioDelivery,
    scoreOrientationMock,
    type PlacementMockDraft,
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
    readonly draft?: PlacementMockDraft;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
    readonly onResult: (result: OrientationMockResult, draft: PlacementMockDraft) => void;
    readonly onBack: () => void;
}

export function renderPlacementMockScreen(options: PlacementMockOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-placement-screen',
        plate: 'classroom',
        title: 'mockTitle',
        body: 'mockBody',
    });
    panel.classList.add('academy-placement-stage');
    const rieCutout = element('div', 'academy-placement-guide');
    const rie = element('img', 'academy-placement-guide-character');
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    rieCutout.append(rie);
    panel.prepend(rieCutout);
    const form = element('form', 'academy-form academy-placement-form');
    let playback: Disposable | null = null;
    let playbackRequest = 0;
    let disposed = false;
    const sourcePlayers = new Set<HTMLAudioElement>();
    let listeningActive = false;
    let step = 0;
    const assessments = new Map<JlptBand, Readonly<{ items: readonly PlacementItem[]; questions: readonly HTMLElement[] }>>();
    const target = bandSelect(options.language);
    const progress = element('div', 'academy-placement-progress');
    progress.setAttribute('aria-live', 'polite');
    progress.setAttribute('aria-atomic', 'true');
    const progressLabel = element('span', 'academy-placement-progress-label');
    const progressDots = element('span', 'academy-placement-progress-dots');
    progress.append(progressLabel, progressDots);
    const assessmentHost = element('div', 'academy-placement-assessment-host');
    let activeItems: readonly PlacementItem[] = [];
    let steps: HTMLElement[] = [target.fieldset];
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
    const createQuestion = (item: PlacementItem): HTMLElement => {
        const fieldset = element('fieldset', 'academy-mock-item');
        fieldset.dataset.mockItem = item.id;
        fieldset.setAttribute('aria-label', item.prompt[options.language]);
        const legend = localizedElement('legend', 'academy-mock-prompt', options.language, item.prompt);
        fieldset.append(legend);
        if (item.passage) fieldset.append(localizedElement('p', 'academy-mock-passage', 'ja', item.passage));
        const audioDelivery = placementAudioDelivery(item);
        if (audioDelivery?.kind === 'source-recording') {
            const player = document.createElement('audio');
            player.className = 'academy-placement-source-audio';
            player.controls = true;
            player.preload = 'metadata';
            player.src = audioDelivery.url;
            player.dataset.audioDelivery = 'source-recording';
            player.dataset.audioSha256 = audioDelivery.sha256;
            player.setAttribute('aria-label', academyText(options.language, 'mockSourceRecordingLabel'));
            const audioError = element('span', 'academy-field-error');
            player.addEventListener('play', () => {
                sourcePlayers.forEach(other => { if (other !== player && !other.paused) other.pause(); });
                if (!listeningActive) {
                    listeningActive = true;
                    options.onListeningStart?.();
                }
            });
            ['pause', 'ended', 'error'].forEach(type => player.addEventListener(type, () => {
                if (type === 'error') {
                    audioError.textContent = academyText(options.language, 'mockSourceRecordingUnavailable');
                }
                stopListening();
            }));
            sourcePlayers.add(player);
            fieldset.append(player, audioError);
        } else if (audioDelivery?.kind === 'browser-speech') {
            const play = copyButton(options.language, 'mockPlayAudio', 'academy-button academy-button-secondary');
            play.dataset.audioDelivery = 'browser-speech';
            const audioError = element('span', 'academy-field-error');
            play.addEventListener('click', () => {
                const request = ++playbackRequest;
                playback?.dispose();
                playback = null;
                audioError.textContent = '';
                play.disabled = true;
                void options.pronunciation.play(audioDelivery.text).then(active => {
                    if (disposed || request !== playbackRequest) {
                        active.dispose();
                        return;
                    }
                    playback = active;
                }).catch(() => {
                    if (!disposed && request === playbackRequest) {
                        audioError.textContent = academyText(options.language, 'mockAudioUnavailable');
                    }
                }).finally(() => {
                    if (!disposed && request === playbackRequest) play.disabled = false;
                });
            });
            fieldset.append(play, audioError);
        }
        fieldset.append(copyElement('p', 'academy-mock-instruction', options.language, 'mockChooseAnswer'));
        const choices = element('div', 'academy-mock-options');
        item.options.forEach(option => {
            const label = element('label', 'academy-mock-option');
            // A placement answer is an assessed surface, not Reader prose.
            // Keep the whole label lookup-inert so ruby, pitch, and dictionary
            // popovers cannot reveal or intercept an answer before commitment.
            label.dataset.jpdbReaderSurfaceIgnore = '';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = item.id;
            input.value = option.id;
            input.required = true;
            // The wrapping label supplies the accessible name. Do not mirror
            // the answer into aria-label/title: Reader intentionally scans
            // those attributes on controls as a separate lookup surface.
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
    const confidence = element('section', 'academy-confidence-grid academy-placement-confidence');
    confidence.setAttribute('aria-label', options.language === 'ja' ? '話す・書く自信' : 'Speaking and writing confidence');
    const speaking = confidenceSelect(options.language, 'mockSpeakingConfidence', 'speaking');
    const writing = confidenceSelect(options.language, 'mockWritingConfidence', 'writing');
    confidence.append(speaking.label, writing.label);
    const buildAssessment = (band: JlptBand): void => {
        stopPlayback();
        let assessment = assessments.get(band);
        if (!assessment) {
            const items = orientationItemsForBand(band);
            assessment = { items, questions: items.map(createQuestion) };
            assessments.set(band, assessment);
        }
        activeItems = assessment.items;
        assessmentHost.replaceChildren(...assessment.questions);
        assessment.items.forEach(item => {
            const saved = options.draft?.targetBand === band ? options.draft.responses[item.id] : undefined;
            const input = saved
                ? [...(assessment.questions.find(question => question.dataset.mockItem === item.id)
                    ?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])]
                    .find(candidate => candidate.value === saved)
                : undefined;
            if (input) input.checked = true;
        });
        steps = [target.fieldset, ...assessment.questions, confidence];
    };
    const feedback = element('div', 'academy-form-feedback');
    const submit = copyButton(options.language, 'mockSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    submit.hidden = true;
    const next = copyButton(options.language, 'continue', 'academy-button academy-button-primary');
    const back = backButton(options.language);
    const actions = element('div', 'academy-placement-actions');
    actions.append(back, next, submit);
    form.append(target.fieldset, progress, assessmentHost, confidence, feedback, actions);
    const showStep = (nextStep: number): void => {
        stopPlayback();
        step = Math.max(0, Math.min(nextStep, steps.length - 1));
        steps.forEach((entry, index) => { entry.hidden = index !== step; });
        const choosingLevel = step === 0;
        const assessmentSteps = Math.max(0, steps.length - 1);
        const finalStep = !choosingLevel && step === steps.length - 1;
        submit.hidden = !finalStep;
        next.hidden = finalStep;
        progressLabel.textContent = choosingLevel
            ? (options.language === 'ja' ? '受ける模試を選ぶ' : 'Choose a JLPT mock')
            : (options.language === 'ja' ? `${step} / ${assessmentSteps}` : `Step ${step} of ${assessmentSteps}`);
        progressDots.replaceChildren(...steps.slice(1).map((_, index) => {
            const dot = element('i', index < step ? 'is-active' : '');
            dot.setAttribute('aria-hidden', 'true');
            return dot;
        }));
        feedback.replaceChildren();
        const activeStep = steps[step];
        const activeControl = activeStep?.querySelector<HTMLElement>('input:checked')
            ?? activeStep?.querySelector<HTMLElement>('select, input, button');
        const scrollHost = screen.parentElement?.classList.contains('academy-screen-host')
            ? screen.parentElement
            : null;
        content.scrollTop = 0;
        screen.scrollTop = 0;
        if (scrollHost) scrollHost.scrollTop = 0;
        (choosingLevel ? activeStep : progress)?.scrollIntoView?.({ block: 'nearest' });
        activeControl?.focus({ preventScroll: true });
    };
    next.addEventListener('click', () => {
        if (step === 0) {
            if (!isJlptBand(target.select.value)) {
                // In-world paper feedback below is the only error surface here —
                // the native reportValidity() bubble broke the living-paper scene
                // with an OS tooltip (F027).
                feedback.replaceChildren(fieldError(options.language === 'ja'
                    ? '受けるレベルを選んでください。'
                    : 'Choose the JLPT level you want to test.'));
                return;
            }
            buildAssessment(target.select.value);
            showStep(1);
            return;
        }
        const radio = steps[step]?.querySelector<HTMLInputElement>('input[type="radio"]');
        if (radio && !steps[step]?.querySelector<HTMLInputElement>('input[type="radio"]:checked')) {
            // See note above: skip reportValidity() so the fieldError slip is the
            // only feedback surface (F027).
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockIncomplete')));
            return;
        }
        showStep(step + 1);
    });
    back.addEventListener('click', () => {
        if (step === 0) {
            options.onBack();
            return;
        }
        showStep(step - 1);
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        // checkValidity, not reportValidity: the in-world fieldError slip is the
        // only feedback surface — the native bubble broke the scene (F027/F029).
        if (!form.checkValidity()) {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockIncomplete')));
            return;
        }
        const values = new FormData(form);
        const responses = Object.fromEntries(activeItems.map(item => [item.id, String(values.get(item.id) ?? '')]));
        const targetBand = target.select.value as JlptBand;
        const confidenceValues = { speaking: Number(speaking.select.value), writing: Number(writing.select.value) };
        options.onResult(scoreOrientationMock(
            targetBand,
            responses,
            confidenceValues,
        ), { targetBand, responses, confidence: confidenceValues });
    });
    if (options.draft) {
        target.select.value = options.draft.targetBand;
        speaking.select.value = String(options.draft.confidence.speaking);
        writing.select.value = String(options.draft.confidence.writing);
    }
    content.append(form);
    showStep(0);
    screen.addEventListener('academy:dispose', () => {
        disposed = true;
        stopPlayback();
        sourcePlayers.forEach(player => {
            player.removeAttribute('src');
        });
        sourcePlayers.clear();
    }, { once: true });
    return screen;
}

export interface PlacementResultOptions {
    readonly language: AcademyLanguage;
    readonly result: OrientationMockResult;
    readonly onAccept: () => void;
    readonly onChoose: () => void;
    readonly onReview: () => void;
}

export function renderPlacementResultScreen(options: PlacementResultOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-placement-result-screen',
        plate: 'classroom',
        title: 'mockResultTitle',
        body: 'mockBody',
    });
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
    const hasSourceRecording = orientationItemsForBand(options.result.targetBand)
        .some(item => item.audio?.runtimeDelivery === 'packaged-source-recording');
    const playbackTruth = academyText(options.language, hasSourceRecording
        ? 'mockEvidenceSourceAudio'
        : 'mockEvidenceSpeechAudio');
    const evidenceNote = element('p', 'academy-placement-evidence-note');
    evidenceNote.textContent = options.language === 'ja'
        ? `${options.result.targetBand.toUpperCase()} の${options.result.itemIds.length}問に基づく目安です。公式JLPTの得点や合格予測ではありません。${playbackTruth}`
        : `This starting point is based on ${options.result.itemIds.length} ${options.result.targetBand.toUpperCase()} questions. It is not an official JLPT score or pass prediction. ${playbackTruth}`;
    const continuityNote = element('p', 'academy-placement-continuity-note');
    continuityNote.textContent = options.language === 'ja'
        ? '出発レベルを変えても、物語や出会いの進行は失われません。'
        : 'Changing your starting level does not reset or skip your story progress.';
    continuityNote.dataset.storyProgression = ORIENTATION_MOCK_POLICY.storyProgression;
    const accept = copyButton(options.language, 'mockUseRecommendation', 'academy-button academy-button-primary');
    accept.addEventListener('click', options.onAccept);
    const choose = copyButton(options.language, 'mockChooseMyself', 'academy-button academy-button-secondary');
    choose.addEventListener('click', options.onChoose);
    const back = backButton(options.language);
    back.classList.add('academy-placement-back', 'academy-placement-review');
    back.addEventListener('click', options.onReview);
    const actions = element('div', 'academy-placement-actions');
    actions.append(back, choose, accept);
    content.append(scores, recommendation, evidenceNote, continuityNote, actions);
    return screen;
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

function confidenceSelect(language: AcademyLanguage, key: AcademyCopyKey, name: string) {
    const label = copyElement('label', 'academy-label', language, key);
    const select = element('select', 'academy-input');
    select.name = name;
    select.setAttribute('aria-label', academyText(language, key));
    for (let index = 0; index <= 4; index += 1) {
        const option = document.createElement('option');
        option.value = String(index / 4);
        option.textContent = `${index} / 4`;
        if (index === 2) option.selected = true;
        select.append(option);
    }
    label.append(select);
    return { label, select };
}

/**
 * The three graded skills are scored against answer keys; speaking/writing
 * are the learner's own self-rating. Presenting both with an identical
 * percentage meter overstates the confidence values as measured results, so
 * self-reported entries get a plain, hollow, explicitly-labelled treatment
 * instead of a percentage.
 */
function scoreBar(value: number, language: AcademyLanguage, kind: 'graded' | 'self-reported' = 'graded'): HTMLElement {
    const row = element('dd', kind === 'self-reported' ? 'academy-score academy-score-self-reported' : 'academy-score');
    const meter = element('span', kind === 'self-reported' ? 'academy-score-meter academy-score-meter-hollow' : 'academy-score-meter');
    meter.style.setProperty('--academy-score', String(value));
    const copy = element('span', 'academy-score-value');
    if (kind === 'self-reported') {
        copy.textContent = language === 'ja' ? '自己申告' : 'Self-reported';
        row.setAttribute('aria-label', language === 'ja' ? '自己申告（採点なし）' : 'Self-reported, not graded');
    } else {
        copy.textContent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value);
    }
    row.append(meter, copy);
    return row;
}
