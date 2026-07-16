import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import {
    LESSON_ZERO_KANA_SEQUENCE,
    LESSON_ZERO_SOURCE_MEDIA,
    LESSON_ZERO_SOURCE_PROVENANCE,
} from '../../content/lesson-zero-source-material';
import {
    createKanaMasterySession,
    type KanaMasteryItem,
    KANASH_UPSTREAM,
} from '../../vendor/kanash/kana-mastery-engine';

export interface KanaMasteryResponse {
    readonly masteredIds: readonly string[];
}

export interface KanaMasteryModel extends ActivityModel {
    readonly kind: 'academy-kana-mastery';
    readonly responseKind: 'clean-romaji-kana-mastery';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly sourceMedia: string;
        readonly payloadSha256: string;
        readonly upstream: typeof KANASH_UPSTREAM;
    };
    readonly payload: {
        readonly items: readonly KanaMasteryItem[];
    };
}

export interface KanaMasteryGate {
    readonly element: HTMLElement;
    dispose(): void;
}

export function createLessonZeroKanaMasteryModel(): KanaMasteryModel {
    const items = LESSON_ZERO_KANA_SEQUENCE.map(item => Object.freeze({
        id: item.id,
        kana: item.kana,
        romaji: item.romaji,
    }));
    return Object.freeze({
        id: 'activity:lesson-zero-kana-mastery',
        kind: 'academy-kana-mastery',
        sourceQuestionId: 'source:lesson-zero:hiragana-a-row',
        conceptIds: items.map(item => `concept:lesson-zero:kana:${item.id}`),
        responseKind: 'clean-romaji-kana-mastery',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: 'あ・い・う・え・おを、答えを見ずにローマ字で読んでください。',
            en: 'Read each taught kana in romaji or hiragana without answer support.',
        },
        provenance: {
            sourceMedia: LESSON_ZERO_SOURCE_MEDIA.hiraganaARow,
            payloadSha256: LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256,
            upstream: KANASH_UPSTREAM,
        },
        payload: { items: Object.freeze(items) },
    });
}

export const kanaMasteryPlugin: ActivityPlugin<KanaMasteryModel, KanaMasteryResponse> = {
    kind: 'academy-kana-mastery',
    validate,
    render,
    grade(model, response) {
        const mastered = parseResponse(model, response);
        const missing = model.payload.items.filter(item => !mastered.has(item.id));
        const score = mastered.size / model.payload.items.length;
        return missing.length === 0
            ? {
                outcome: 'pass',
                score,
                errorTags: [],
                feedback: {
                    explanation: {
                        ja: '五つのかなを、答えの助けなしですべて読めました。',
                        en: 'All five source-taught kana were read without answer support.',
                    },
                },
            }
            : {
                outcome: 'lapse',
                score,
                errorTags: missing.map(item => errorTag(item)).sort(),
                feedback: {
                    explanation: {
                        ja: 'まだ助けなしで読めていないかながあります。',
                        en: 'Some kana still need a clean answer without support.',
                    },
                    repairPrompt: {
                        ja: '答えを見た文字は、もう一度自分で読んでください。',
                        en: 'Return to any supported kana and read it cleanly once more.',
                    },
                    nearbyExample: {
                        ja: 'あ は a です。',
                        en: 'For example, あ is read a.',
                    },
                },
            };
    },
    toReviewSeeds(model, result) {
        return model.payload.items.flatMap((item, index) => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(errorTag(item))) return [];
            return [{
                id: `review:lesson-zero:kana:${item.id}`,
                conceptId: model.conceptIds[index]!,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: model.sourceQuestionId,
                content: {
                    expression: item.kana,
                    reading: item.romaji,
                    meanings: [`hiragana vowel ${item.romaji}`],
                    sentence: `${item.kana} = ${item.romaji}`,
                },
            } satisfies ReviewSeed];
        });
    },
};

export function createKanaMasteryGate(options: Readonly<{
    language: 'en' | 'ja';
    model?: KanaMasteryModel;
    onMastered?(response: KanaMasteryResponse): void | Promise<unknown>;
    onComplete?(): void;
    random?: () => number;
}>): KanaMasteryGate {
    const lifecycle = new AbortController();
    const model = options.model ?? createLessonZeroKanaMasteryModel();
    const session = createKanaMasterySession(model.payload.items, options.random);
    const root = document.createElement('section');
    root.className = 'academy-lesson-zero-kana-mastery';
    root.dataset.activityId = model.id;
    root.dataset.upstreamRepository = KANASH_UPSTREAM.repository;
    root.dataset.upstreamCommit = KANASH_UPSTREAM.commit;
    root.dataset.upstreamLicense = KANASH_UPSTREAM.license;
    root.setAttribute('aria-label', options.language === 'ja' ? 'レッスン0かな習得ゲート' : 'Lesson 0 kana mastery gate');
    let disposed = false;
    let committing = false;

    const finish = (status: HTMLElement): void => {
        if (committing) return;
        committing = true;
        const response: KanaMasteryResponse = { masteredIds: session.snapshot.masteredIds };
        const complete = (): void => {
            if (!disposed) options.onComplete?.();
        };
        try {
            const pending = options.onMastered?.(response);
            if (!pending) {
                complete();
                return;
            }
            status.textContent = options.language === 'ja' ? '学習記録を保存しています…' : 'Saving study record...';
            void pending.then(complete).catch(error => {
                committing = false;
                status.textContent = error instanceof Error ? error.message : String(error);
            });
        } catch (error) {
            committing = false;
            status.textContent = error instanceof Error ? error.message : String(error);
        }
    };

    const renderGate = (): void => {
        root.replaceChildren();
        const snapshot = session.snapshot;
        if (snapshot.complete) {
            root.dataset.mastered = 'true';
            const result = document.createElement('p');
            result.className = 'academy-lesson-zero-kana-mastery-result';
            result.setAttribute('role', 'status');
            result.textContent = options.language === 'ja'
                ? 'あ・い・う・え・おを、助けなしですべて読みました。'
                : 'All five taught kana were read once without answer support.';
            const finishButton = document.createElement('button');
            finishButton.type = 'button';
            finishButton.className = 'academy-vn-primary-action academy-lesson-zero-mastery-complete';
            finishButton.textContent = options.language === 'ja' ? 'レッスン0を完了' : 'Complete Lesson 0';
            finishButton.addEventListener('click', () => finish(result), { signal: lifecycle.signal });
            root.append(result, finishButton);
            finishButton.focus();
            return;
        }

        const current = session.current!;
        root.dataset.currentKanaId = current.id;
        const counters = document.createElement('p');
        counters.className = 'academy-lesson-zero-kana-mastery-counters';
        counters.textContent = options.language === 'ja'
            ? `習得 ${snapshot.masteredIds.length}/${model.payload.items.length}・やり直し ${snapshot.errors}`
            : `Mastered ${snapshot.masteredIds.length}/${model.payload.items.length} · repairs ${snapshot.errors}`;
        const progress = document.createElement('progress');
        progress.max = model.payload.items.length;
        progress.value = snapshot.masteredIds.length;
        progress.setAttribute('aria-label', options.language === 'ja' ? 'かな習得の進み' : 'Kana mastery progress');
        const cue = document.createElement('strong');
        cue.className = 'academy-lesson-zero-kana-mastery-cue';
        cue.lang = 'ja';
        cue.textContent = current.kana;
        const form = document.createElement('form');
        const label = document.createElement('label');
        label.textContent = options.language === 'ja' ? 'ローマ字かひらがなで読み方を入力' : 'Type the romaji or hiragana reading';
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'text';
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.maxLength = 4;
        input.setAttribute('aria-describedby', 'lesson-zero-kana-mastery-status');
        const check = document.createElement('button');
        check.type = 'submit';
        check.className = 'academy-vn-primary-action';
        check.textContent = options.language === 'ja' ? '確認' : 'Check';
        const reveal = document.createElement('button');
        reveal.type = 'button';
        reveal.className = 'academy-lesson-zero-kana-mastery-reveal';
        reveal.textContent = options.language === 'ja' ? '答えを見る' : 'Show answer';
        reveal.disabled = true;
        const status = document.createElement('p');
        status.id = 'lesson-zero-kana-mastery-status';
        status.className = 'academy-lesson-zero-kana-mastery-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const review = document.createElement('details');
        review.className = 'academy-lesson-zero-kana-mastery-review';
        const reviewLabel = document.createElement('summary');
        reviewLabel.textContent = options.language === 'ja' ? '習った五文字を見直す' : 'Review the five taught kana';
        const reviewList = document.createElement('dl');
        reviewList.className = 'academy-lesson-zero-kana-mastery-chart';
        for (const item of model.payload.items) {
            const kana = document.createElement('dt');
            kana.lang = 'ja';
            kana.textContent = item.kana;
            const reading = document.createElement('dd');
            reading.textContent = item.romaji;
            reviewList.append(kana, reading);
        }
        review.append(reviewLabel, reviewList);
        review.addEventListener('toggle', () => {
            if (!review.open) return;
            session.review();
            status.textContent = options.language === 'ja'
                ? '見直した文字は、助けを閉じてからもう一度出ます。'
                : 'This supported kana will return for one clean answer after you close the chart.';
        }, { signal: lifecycle.signal });

        let composing = false;
        input.addEventListener('compositionstart', () => { composing = true; }, { signal: lifecycle.signal });
        input.addEventListener('compositionend', () => { composing = false; }, { signal: lifecycle.signal });
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (composing) return;
            if (!input.value.trim()) {
                status.textContent = options.language === 'ja' ? '読み方を入力してください。' : 'Enter a reading.';
                input.focus();
                return;
            }
            const result = session.submit(input.value);
            if (result.outcome === 'retry') {
                status.textContent = options.language === 'ja'
                    ? 'まだ違います。この文字は、あとでもう一度出ます。'
                    : 'Not yet. This kana will return for a clean answer.';
                reveal.disabled = false;
                input.select();
                return;
            }
            renderGate();
        }, { signal: lifecycle.signal });
        reveal.addEventListener('click', () => {
            const answer = session.reveal();
            status.textContent = `${current.kana} = ${answer}`;
            reveal.disabled = true;
            input.focus();
        }, { signal: lifecycle.signal });
        label.append(input);
        form.append(label, check, reveal);
        root.append(counters, progress, cue, form, review, status);
        input.focus();
    };

    renderGate();
    return {
        element: root,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            root.remove();
        },
    };
}

function validate(model: KanaMasteryModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'Kana mastery requires assessed answer support.' });
    }
    if (model.sourceQuestionId !== 'source:lesson-zero:hiragana-a-row'
        || model.provenance?.sourceMedia !== LESSON_ZERO_SOURCE_MEDIA.hiraganaARow
        || model.provenance?.payloadSha256 !== LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256
        || model.provenance?.upstream?.commit !== KANASH_UPSTREAM.commit
        || model.provenance?.upstream?.license !== 'MIT') {
        issues.push({ path: 'provenance', message: 'Kana mastery requires the exact Moodle A-row source and pinned Kanash adaptation.' });
    }
    const items = model.payload?.items;
    if (!Array.isArray(items) || items.length !== LESSON_ZERO_KANA_SEQUENCE.length) {
        issues.push({ path: 'payload.items', message: 'The exact five taught Lesson 0 kana are required.' });
        return issues;
    }
    items.forEach((item, index) => {
        const expected = LESSON_ZERO_KANA_SEQUENCE[index];
        if (!expected || item.id !== expected.id || item.kana !== expected.kana || item.romaji !== expected.romaji
            || model.conceptIds[index] !== `concept:lesson-zero:kana:${expected.id}`) {
            issues.push({ path: `payload.items.${index}`, message: 'Kana mastery must preserve the source-taught A-row order and concept ids.' });
        }
    });
    return issues;
}

function render(
    model: KanaMasteryModel,
    host: ActivityHost,
    submit: (response: KanaMasteryResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const gate = createKanaMasteryGate({
        language: host.language ?? 'en',
        model,
        onMastered: submit,
    });
    host.replace(gate.element);
    return {
        focus() { gate.element.querySelector<HTMLElement>('input, button')?.focus(); },
        dispose() { gate.dispose(); },
    };
}

function parseResponse(model: KanaMasteryModel, response: KanaMasteryResponse): ReadonlySet<string> {
    if (!response || !Array.isArray(response.masteredIds)) {
        throw new TypeError('Kana mastery needs the ids read without answer support.');
    }
    const allowed = new Set(model.payload.items.map(item => item.id));
    const mastered = new Set(response.masteredIds);
    if (mastered.size !== response.masteredIds.length || [...mastered].some(id => !allowed.has(id))) {
        throw new TypeError('Kana mastery ids must be unique source-taught kana.');
    }
    return mastered;
}

function errorTag(item: KanaMasteryItem): string {
    return `lesson-zero-kana-${item.id}`;
}
