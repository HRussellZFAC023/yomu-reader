import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { JlptBand } from '../domain/learner-record';
import {
    ORIENTATION_MOCK_ITEMS,
    scoreOrientationMock,
    type OrientationMockResult,
} from '../placement/orientation';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { ACADEMY_BANDS } from './start-screen';
import { copyButton, copyElement, element, fieldError, localizedElement, screenFrame } from './dom';

export interface PlacementMockOptions {
    readonly language: AcademyLanguage;
    readonly pronunciation: PronunciationService;
    readonly onResult: (result: OrientationMockResult) => void;
    readonly onBack: () => void;
}

export function renderPlacementMockScreen(options: PlacementMockOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-placement-screen',
        plate: 'classroom',
        title: 'mockTitle',
        body: 'mockBody',
    });
    const form = element('form', 'academy-form academy-placement-form');
    let playback: Disposable | null = null;
    let playbackRequest = 0;
    let disposed = false;
    const target = bandSelect(options.language);
    form.append(target.fieldset);
    ORIENTATION_MOCK_ITEMS.forEach(item => {
        const fieldset = element('fieldset', 'academy-mock-item');
        fieldset.dataset.mockItem = item.id;
        fieldset.setAttribute('aria-label', item.prompt[options.language]);
        const legend = localizedElement('legend', 'academy-mock-prompt', options.language, item.prompt);
        fieldset.append(legend);
        if (item.passage) fieldset.append(localizedElement('p', 'academy-mock-passage', 'ja', item.passage));
        if (item.spokenJapanese) {
            const play = copyButton(options.language, 'mockPlayAudio', 'academy-button academy-button-secondary');
            const audioError = element('span', 'academy-field-error');
            play.addEventListener('click', () => {
                const request = ++playbackRequest;
                playback?.dispose();
                playback = null;
                audioError.textContent = '';
                play.disabled = true;
                void options.pronunciation.play(item.spokenJapanese!).then(active => {
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
        form.append(fieldset);
    });
    const confidence = element('div', 'academy-confidence-grid');
    const speaking = confidenceSelect(options.language, 'mockSpeakingConfidence', 'speaking');
    const writing = confidenceSelect(options.language, 'mockWritingConfidence', 'writing');
    confidence.append(speaking.label, writing.label);
    const feedback = element('div', 'academy-form-feedback');
    const submit = copyButton(options.language, 'mockSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    const back = copyButton(options.language, 'back', 'academy-button academy-button-quiet');
    back.addEventListener('click', options.onBack);
    form.append(confidence, feedback, submit, back);
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) {
            feedback.replaceChildren(fieldError(academyText(options.language, 'mockIncomplete')));
            return;
        }
        const values = new FormData(form);
        const responses = Object.fromEntries(ORIENTATION_MOCK_ITEMS.map(item => [item.id, String(values.get(item.id) ?? '')]));
        options.onResult(scoreOrientationMock(
            target.select.value as JlptBand,
            responses,
            { speaking: Number(speaking.select.value), writing: Number(writing.select.value) },
        ));
    });
    content.append(form);
    screen.addEventListener('academy:dispose', () => {
        disposed = true;
        playbackRequest += 1;
        playback?.dispose();
    }, { once: true });
    return screen;
}

export interface PlacementResultOptions {
    readonly language: AcademyLanguage;
    readonly result: OrientationMockResult;
    readonly onAccept: () => void;
    readonly onChoose: () => void;
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
    const rows: readonly [AcademyCopyKey, number][] = [
        ['mockKnowledge', options.result.scores['language-knowledge']],
        ['mockReading', options.result.scores.reading],
        ['mockListening', options.result.scores.listening],
        ['mockProduction', (options.result.scores['speaking-confidence'] + options.result.scores['writing-confidence']) / 2],
    ];
    rows.forEach(([key, value]) => {
        scores.append(copyElement('dt', '', options.language, key), scoreBar(value, options.language));
    });
    const recommendation = element('div', 'academy-recommendation');
    recommendation.append(
        copyElement('span', 'academy-eyebrow', options.language, 'mockRecommendation'),
        element('strong', 'academy-recommendation-band'),
    );
    const band = recommendation.querySelector('strong');
    if (band) band.textContent = options.result.recommendedBand.toUpperCase();
    const accept = copyButton(options.language, 'mockUseRecommendation', 'academy-button academy-button-primary');
    accept.addEventListener('click', options.onAccept);
    const choose = copyButton(options.language, 'mockChooseMyself', 'academy-button academy-button-secondary');
    choose.addEventListener('click', options.onChoose);
    content.append(scores, recommendation, accept, choose);
    return screen;
}

function bandSelect(language: AcademyLanguage): { fieldset: HTMLFieldSetElement; select: HTMLSelectElement } {
    const fieldset = element('fieldset', 'academy-target-band');
    fieldset.setAttribute('aria-label', academyText(language, 'mockTargetLegend'));
    fieldset.append(copyElement('legend', 'academy-label', language, 'mockTargetLegend'));
    const select = element('select', 'academy-input');
    select.setAttribute('aria-label', academyText(language, 'mockTargetLegend'));
    ACADEMY_BANDS.forEach(([value, key]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = academyText(language, key);
        if (value === 'n4') option.selected = true;
        select.append(option);
    });
    fieldset.append(select);
    return { fieldset, select };
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

function scoreBar(value: number, language: AcademyLanguage): HTMLElement {
    const row = element('dd', 'academy-score');
    const meter = element('span', 'academy-score-meter');
    meter.style.setProperty('--academy-score', String(value));
    const copy = element('span', 'academy-score-value');
    copy.textContent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value);
    row.append(meter, copy);
    return row;
}
