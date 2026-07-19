import fs from 'node:fs';
import path from 'node:path';
import type {
    AuthoredChoiceEvaluation,
    AuthoredWeekResponse,
    LearnerAuthoredActivity,
    LearnerAuthoredCloze,
    LearnerAuthoredChoice,
    LearnerAuthoredMatching,
    LearnerAuthoredOrdering,
    LearnerAuthoredWeek,
} from '../../src/academy/content/authored-week-adapter';
import { adaptAuthoredWeek } from '../../src/academy/content/authored-week-adapter';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../src/academy/domain/activity-runtime';
import type { SourceVocabularySheetModel } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { sha256File } from './helpers/hash-memo';

afterEach(() => document.body.replaceChildren());

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('authored week learner screen', () => {
    it('renders a supplied story setup as a name-only host, without a portrait contract', () => {
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: weekFixture(),
            storyContext: {
                hostId: 'stasi',
                hostName: 'Stasi-san',
                originPlaceId: 'classroom',
                setup: { ja: '教室で小さな展示を準備します。', en: 'A small classroom display is being prepared.' },
                callback: { ja: '一つのラベルは空いたままです。', en: 'One label remains open.' },
                dialogue: [
                    { speakerId: 'stasi', speakerName: 'Stasi-san', purpose: 'need', line: { ja: '札が一枚足りません。', en: 'One card is missing.' } },
                    { speakerId: 'mika', speakerName: 'Mika-san', purpose: 'model', line: { ja: '先に名前を聞きましょう。', en: 'Let us ask the name first.' } },
                    { speakerId: 'stasi', speakerName: 'Stasi-san', purpose: 'transfer', line: { ja: '答えを待ちます。', en: 'We will wait for the answer.' } },
                ],
            },
        });

        const context = screen.element.querySelector<HTMLElement>('.academy-authored-week-story-context')!;
        expect(context.dataset.storyHost).toBe('stasi');
        expect(context.dataset.storyPresentation).toBe('name-only');
        expect(context.dataset.storyOriginPlace).toBe('classroom');
        expect([...context.querySelectorAll<HTMLElement>('.academy-authored-week-story-turn')].map(turn => [
            turn.dataset.storySpeaker,
            turn.dataset.storyPurpose,
        ])).toEqual([
            ['stasi', 'need'],
            ['mika', 'model'],
            ['stasi', 'transfer'],
        ]);
        expect(context.textContent).toContain('Stasi-san');
        expect(context.textContent).toContain('One label remains open.');
        expect(context.querySelector('img')).toBeNull();
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
    });

    it('conceals answer material until commitment and presents a Japanese-first bilingual prompt', () => {
        const screen = createAuthoredWeekScreen({ language: 'en', week: weekFixture() });
        document.body.append(screen.element);

        expect(screen.element.querySelector('.academy-lesson-teaching-support')).not.toBeNull();
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();
        openQuestion(screen.element);
        const prompt = screen.element.querySelector('.academy-authored-week-prompt')!;
        expect(prompt.children[0]).toMatchObject({ textContent: 'は どれですか', lang: 'ja' });
        expect(prompt.children[1]).toMatchObject({ textContent: 'Which one is wa?', lang: 'en' });
        expect(screen.element.textContent).not.toContain('HIDDEN TARGET');
        expect(screen.element.textContent).not.toContain('hidden repair');
        expect(screen.element.textContent).not.toContain('secret review expression');
        expect(screen.element.innerHTML).not.toMatch(/correct|modelAnswer|answer-key/i);
        expect(screen.element.querySelectorAll('.academy-authored-week-activity')).toHaveLength(1);
    });

    it('presents authored teaching one reversible note at a time before the first assessed response', () => {
        const base = weekFixture();
        const fixture: LearnerAuthoredWeek = {
            ...base,
            preAssessment: [
                {
                    id: 'explanation',
                    kind: 'explanation',
                    order: 5,
                    title: { en: 'Meeting people', ja: '人と会う' },
                    entries: [{ en: 'Use the polite frame before you answer.' }],
                },
                {
                    id: 'passage',
                    kind: 'passage',
                    order: 50,
                    title: { en: 'Class roster', ja: 'クラスの名簿' },
                    entries: [{ ja: 'わたしは アーカッシュです。', en: "I'm Aakash." }],
                },
                {
                    id: 'prompt',
                    kind: 'prompt',
                    order: 60,
                    title: { en: 'Your introduction', ja: '自己紹介' },
                    entries: [{ en: 'Introduce yourself in your own words.' }],
                },
                {
                    id: 'mission',
                    kind: 'mission',
                    order: 91,
                    title: { en: 'Meet three classmates' },
                    entries: [{ en: 'Ask a classmate one question.' }],
                },
            ],
        };
        const screen = createAuthoredWeekScreen({ language: 'ja', week: fixture });
        document.body.append(screen.element);

        expect(screen.element.dataset.lessonPhase).toBe('teaching');
        expect([...screen.element.querySelectorAll<HTMLElement>('[data-exposure-kind]')]
            .map(section => section.dataset.exposureKind)).toEqual(['explanation']);
        const teachingEntries = screen.element.querySelector<HTMLElement>('.academy-lesson-teaching-entries')!;
        expect(teachingEntries.tabIndex).toBe(0);
        expect(teachingEntries.getAttribute('aria-label')).toBe('学習例');
        expect(screen.element.querySelector('.academy-authored-week-briefing-step')?.textContent)
            .toBe('学習ポイント 1 / 4');
        expect(screen.element.textContent).toContain('Use the polite frame before you answer.');
        const authoredEnglish = [...screen.element.querySelectorAll<HTMLElement>('[data-exposure-kind="explanation"] [lang="en"]')]
            .find(node => node.textContent === 'Use the polite frame before you answer.');
        expect(authoredEnglish?.hidden).toBe(false);
        expect(screen.element.textContent).not.toContain('わたしは アーカッシュです。');
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();
        expect(screen.element.querySelector('.academy-choice-option')).toBeNull();

        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        expect(screen.element.querySelector('[data-exposure-kind="passage"]')).not.toBeNull();
        expect(screen.element.textContent).toContain('わたしは アーカッシュです。');
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-back')!.click();
        expect(screen.element.querySelector('[data-exposure-kind="explanation"]')).not.toBeNull();

        for (let step = 0; step < 4; step += 1) {
            screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        }
        expect(screen.element.querySelector('[data-exposure-kind]')).toBeNull();
        expect(screen.element.dataset.lessonPhase).toBe('support');
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-back')!.click();
        expect(screen.element.querySelector('[data-exposure-kind="mission"]')).not.toBeNull();
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        openQuestion(screen.element);
        expect(screen.element.dataset.lessonPhase).toBe('question');
        expect(screen.element.querySelector('.academy-authored-week-prompt')).not.toBeNull();
        expect(screen.element.textContent).not.toContain('Introduce yourself in your own words.');
    });

    it('keeps the real l1-l01 beginner path source-first, reversible, and varied', () => {
        const fixturePath = path.resolve('public/academy/content/lessons/002-l1-l01.json');
        const bytes = fs.readFileSync(fixturePath);
        const week = adaptAuthoredWeek(JSON.parse(bytes.toString('utf8')) as unknown, {
            path: fixturePath,
            sha256: sha256File(fixturePath),
        });
        const screen = createAuthoredWeekScreen({ language: 'en', week });
        document.body.append(screen.element);

        expect(week.preAssessment).toHaveLength(5);
        expect(new Set(week.activities.map(activity => activity.kind))).toEqual(new Set([
            'choice',
            'academy-authored-cloze',
            'academy-authored-matching',
            'academy-authored-ordering',
        ]));
        expect(screen.element.dataset.lessonPhase).toBe('teaching');
        expect(screen.element.querySelectorAll('[data-exposure-kind]')).toHaveLength(1);
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();

        for (let step = 0; step < week.preAssessment.length; step += 1) {
            screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        }
        expect(screen.element.dataset.lessonPhase).toBe('support');
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-back')!.click();
        expect(screen.element.dataset.lessonPhase).toBe('teaching');
        expect(screen.element.querySelector('.academy-authored-week-briefing-step')?.textContent)
            .toBe('Lesson note 5 of 5');
    });

    it('locks a lapse before feedback, offers repair and retry, then gives a pass action', async () => {
        const evaluatedStates: boolean[] = [];
        const fixture = weekFixture((_, responseId) => {
            evaluatedStates.push([...document.querySelectorAll<HTMLButtonElement>('.academy-choice-option')]
                .every(button => button.disabled));
            return evaluation(responseId === 'right' ? 'pass' : 'lapse');
        });
        const screen = createAuthoredWeekScreen({ language: 'en', week: fixture });
        document.body.append(screen.element);

        openQuestion(screen.element);
        choice(screen.element, 'wrong').click();
        await flush();
        expect(evaluatedStates).toEqual([true]);
        expect(screen.element.querySelector('.academy-authored-week-feedback-summary')?.textContent).toContain('直しましょう');
        expect(screen.element.querySelector('.academy-feedback-repair')).toBeNull();
        const hint = screen.element.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        hint.click();
        expect(screen.element.querySelector('.academy-feedback-repair')?.textContent).toContain('hidden repair');
        expect(hint.textContent).toBe('Another hint');
        hint.click();
        expect(screen.element.querySelector('.academy-feedback-example')?.textContent).toContain('nearby example');
        expect(screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')?.textContent).toBe('Try again');
        expect([...screen.element.querySelectorAll<HTMLButtonElement>('.academy-choice-option')].every(button => button.disabled)).toBe(true);

        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(screen.element.textContent).not.toContain('hidden repair');
        choice(screen.element, 'right').click();
        await flush();
        expect(evaluatedStates).toEqual([true, true]);
        expect(screen.element.dataset.outcome).toBeUndefined();
        expect(screen.element.querySelector('.academy-authored-week-activity')?.getAttribute('data-outcome')).toBe('pass');
        expect(screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')?.textContent).toBe('Next question');
    });

    it('advances one activity at a time, updates progress, and supports keyboard choice navigation', async () => {
        const screen = createAuthoredWeekScreen({ language: 'en', week: weekFixture() });
        document.body.append(screen.element);
        openQuestion(screen.element);
        const first = choice(screen.element, 'wrong');
        const second = choice(screen.element, 'right');
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(second);

        second.click();
        await flush();
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('0 / 2');
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(screen.currentActivityIndex).toBe(1);
        expect(screen.currentActivityId).toBe('activity:two');
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('1 / 2');
        expect(screen.element.querySelector('.academy-authored-week-prompt')).toBeNull();
        openQuestion(screen.element);
        expect(screen.element.querySelector('.academy-authored-week-prompt')?.textContent).toContain('二つ目');
        expect(screen.element.querySelectorAll('.academy-authored-week-activity')).toHaveLength(1);
    });

    it('renders one multi-blank cloze and commits every field together by keyboard', async () => {
        const activity = structuredCloze();
        const seen: AuthoredWeekResponse[] = [];
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: structuredWeek(activity, response => {
                seen.push(response);
                return evaluation(typeof response !== 'string'
                    && response.kind === 'cloze'
                    && response.values.map(value => value.value).join('|') === 'は|の' ? 'pass' : 'lapse');
            }),
        });
        document.body.append(screen.element);
        openQuestion(screen.element);

        const fields = [...screen.element.querySelectorAll<HTMLInputElement>('[data-cloze-blank-id]')];
        const check = screen.element.querySelector<HTMLButtonElement>('.academy-authored-modality-check')!;
        expect(fields.map(field => field.dataset.clozeBlankId)).toEqual(['b1', 'b2']);
        expect(check.disabled).toBe(true);
        expect(screen.element.innerHTML).not.toMatch(/data-(?:answer|correct)|modelAnswer/iu);
        fields[0].value = 'は';
        fields[0].dispatchEvent(new Event('input', { bubbles: true }));
        fields[1].value = 'の';
        fields[1].dispatchEvent(new Event('input', { bubbles: true }));
        expect(check.disabled).toBe(false);
        fields[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await flush();

        expect(seen).toEqual([{
            kind: 'cloze',
            values: [{ blankId: 'b1', value: 'は' }, { blankId: 'b2', value: 'の' }],
        }]);
        expect(screen.element.querySelector('.academy-authored-week-activity')?.getAttribute('data-outcome')).toBe('pass');
    });

    it('renders one-to-one matching with mobile-native, keyboard-labelled selects', async () => {
        const activity = structuredMatching();
        const seen: AuthoredWeekResponse[] = [];
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: structuredWeek(activity, response => {
                seen.push(response);
                return evaluation(typeof response !== 'string'
                    && response.kind === 'matching'
                    && response.placements[0]?.targetId === 'target-1'
                    && response.placements[1]?.targetId === 'target-2' ? 'pass' : 'lapse');
            }),
        });
        document.body.append(screen.element);
        openQuestion(screen.element);

        const selects = [...screen.element.querySelectorAll<HTMLSelectElement>('[data-matching-item-id]')];
        const check = screen.element.querySelector<HTMLButtonElement>('.academy-authored-modality-check')!;
        expect(selects).toHaveLength(2);
        expect(selects.map(select => select.getAttribute('aria-label'))).toEqual(['Match for item 1', 'Match for item 2']);
        selects[0].value = 'target-1';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        expect([...selects[1].options].find(option => option.value === 'target-1')?.disabled).toBe(true);
        selects[1].value = 'target-2';
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
        expect(check.disabled).toBe(false);
        check.click();
        await flush();

        expect(seen[0]).toEqual({
            kind: 'matching',
            placements: [
                { itemId: 'item-1', targetId: 'target-1' },
                { itemId: 'item-2', targetId: 'target-2' },
            ],
        });
    });

    it('renders ordering as movable authored tiles with labelled button controls', async () => {
        const activity = structuredOrdering();
        const seen: AuthoredWeekResponse[] = [];
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: structuredWeek(activity, response => {
                seen.push(response);
                return evaluation(typeof response !== 'string'
                    && response.kind === 'ordering'
                    && response.sequences[0]?.itemIds.join('|') === 'a|b|c' ? 'pass' : 'lapse');
            }),
        });
        document.body.append(screen.element);
        openQuestion(screen.element);

        const order = () => [...screen.element.querySelectorAll<HTMLElement>('[data-sequence-id]')]
            .map(item => item.dataset.sequenceId);
        expect(order()).toEqual(['b', 'c', 'a']);
        const moveEarlier = () => screen.element
            .querySelector<HTMLButtonElement>('[data-sequence-id="a"] .academy-sequence-move:first-child')!;
        expect(moveEarlier().getAttribute('aria-label')).toBe('Move A earlier');
        moveEarlier().click();
        moveEarlier().click();
        expect(order()).toEqual(['a', 'b', 'c']);
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-modality-check')!.click();
        await flush();

        expect(seen[0]).toEqual({
            kind: 'ordering',
            sequences: [{ sequenceId: 'sequence-1', itemIds: ['a', 'b', 'c'] }],
        });
    });

    it('emits review seeds for every committed attempt and completes exactly once', async () => {
        const onReviewSeeds = vi.fn();
        const onComplete = vi.fn();
        const screen = createAuthoredWeekScreen({
            language: 'ja',
            week: weekFixture(),
            onReviewSeeds,
            onComplete,
            storyContext: {
                hostId: 'stasi',
                hostName: 'Stasi-san',
                setup: { ja: '始めます。', en: 'We begin.' },
                callback: { ja: '答えを待ちます。', en: 'We wait for the answer.' },
                handoff: { ja: '元の道へ戻ります。', en: 'Return to the route you came from.' },
            },
        });
        document.body.append(screen.element);

        openQuestion(screen.element);
        choice(screen.element, 'wrong').click();
        await flush();
        expect(onReviewSeeds).toHaveBeenLastCalledWith([expect.objectContaining({ reason: 'repair' })]);
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        choice(screen.element, 'right').click();
        await flush();
        expect(onReviewSeeds).toHaveBeenLastCalledWith([expect.objectContaining({ reason: 'new-learning' })]);
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        openQuestion(screen.element);
        choice(screen.element, 'right').click();
        await flush();
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();

        expect(onReviewSeeds).toHaveBeenCalledTimes(3);
        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.currentActivityId).toBeNull();
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('2 / 2');
        expect(screen.element.querySelector('[data-week-complete="true"]')).not.toBeNull();
        expect(screen.element.querySelector('.academy-authored-week-story-handoff')?.textContent)
            .toContain('元の道へ戻ります。');
        const returnToRoute = screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!;
        expect(returnToRoute.textContent).toBe('元の道へ戻る');
        returnToRoute.click();
        returnToRoute.click();
        expect(onComplete).toHaveBeenCalledOnce();
        expect(screen.element.querySelector('.academy-authored-week-next')).toBeNull();
    });

    it('exposes unresolved audio as unavailable without leaking its locator', () => {
        const screen = createAuthoredWeekScreen({ language: 'en', week: weekFixture() });
        document.body.append(screen.element);

        const audio = screen.element.querySelector<HTMLElement>('[data-audio-status="unavailable"]')!;
        expect(audio.getAttribute('role')).toBe('status');
        expect(audio.textContent).toContain('音声は利用できません');
        expect(audio.textContent).toContain('Audio is unavailable');
        expect(screen.element.textContent).not.toContain('academy://audio/secret');
    });

    it('renders packaged listening as an opt-in control and reveals its transcript only after an attempt', async () => {
        const base = weekFixture();
        const first = base.activities[0] as LearnerAuthoredChoice;
        const fixture: LearnerAuthoredWeek = {
            ...base,
            activities: [{
                ...first,
                listening: {
                    sourceLocator: 'academy/content/soya/audio/example.mp3',
                    url: '/academy/content/listening/media/example.mp3',
                    transcript: [{ speaker: '女', text: 'りんごを 四つ おねがいします。' }],
                    transcriptReveal: 'after-attempt' as const,
                },
            }, ...base.activities.slice(1)],
        };
        const onListeningStart = vi.fn();
        const onListeningStop = vi.fn();
        const screen = createAuthoredWeekScreen({ language: 'en', week: fixture, onListeningStart, onListeningStop });
        document.body.append(screen.element);

        openQuestion(screen.element);
        const audio = screen.element.querySelector<HTMLAudioElement>('audio')!;
        expect(audio.getAttribute('src')).toBe('/academy/content/listening/media/example.mp3');
        expect(audio.autoplay).toBe(false);
        expect(screen.element.querySelector('.academy-authored-week-transcript')).toBeNull();
        onListeningStop.mockClear();
        audio.dispatchEvent(new Event('play'));
        audio.dispatchEvent(new Event('pause'));
        expect(onListeningStart).toHaveBeenCalledOnce();
        expect(onListeningStop).toHaveBeenCalledOnce();

        choice(screen.element, 'wrong').click();
        await flush();
        const transcript = screen.element.querySelector<HTMLDetailsElement>('.academy-authored-week-transcript')!;
        expect(transcript.open).toBe(false);
        expect(transcript.textContent).toContain('りんごを 四つ');
    });

    it('recovers accessibly when evaluation fails without exposing answer material', () => {
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: weekFixture(() => { throw new TypeError('adapter detail with secret review expression'); }),
        });
        document.body.append(screen.element);

        openQuestion(screen.element);
        const selected = choice(screen.element, 'right');
        selected.click();

        expect(screen.element.querySelector('.academy-activity-feedback')?.getAttribute('role')).toBe('alert');
        expect(screen.element.textContent).toContain('答えを確認できませんでした');
        expect(screen.element.textContent).not.toContain('secret review expression');
        expect([...screen.element.querySelectorAll<HTMLButtonElement>('.academy-choice-option')]
            .every(button => !button.disabled)).toBe(true);
        expect(document.activeElement).toBe(selected);
    });

    it('blocks progression and offers an accessible retry when persistence fails', async () => {
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: weekFixture(),
            onReviewSeeds: () => Promise.reject(new Error('review persistence failed')),
        });
        document.body.append(screen.element);

        openQuestion(screen.element);
        choice(screen.element, 'right').click();
        await flush();

        expect(screen.element.querySelector('.academy-activity-feedback')?.getAttribute('role')).toBe('alert');
        expect(screen.element.textContent).toContain('Your answer was not saved');
        expect(screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')).toBeNull();
        expect(screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-retry-save')).not.toBeNull();
    });

    it('exposes a real in-content Back action', () => {
        const onBack = vi.fn();
        const screen = createAuthoredWeekScreen({ language: 'en', week: weekFixture(), onBack });
        document.body.append(screen.element);

        expect(screen.element.querySelectorAll('.academy-authored-week-back')).toHaveLength(1);
        expect(screen.element.querySelector('.academy-lesson-activity-back')).toBeNull();
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-back')?.click();

        expect(onBack).toHaveBeenCalledOnce();
    });

    it('runs exact source vocabulary rows through the central plugin before advancing', async () => {
        const base = weekFixture();
        const sourceRow = sourceVocabularyRow();
        const onEvaluation = vi.fn();
        const fixture: LearnerAuthoredWeek = { ...base, activities: [sourceRow, ...base.activities] };
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: fixture,
            onEvaluation,
        });
        document.body.append(screen.element);

        expect(screen.currentActivityId).toBe(sourceRow.id);
        expect(screen.element.textContent).not.toContain('today');
        expect(screen.element.querySelector('[data-source-vocabulary-answer]')).not.toBeNull();
        screen.element.querySelector<HTMLButtonElement>('[data-source-vocabulary-response="reveal"]')!.click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('today'));
        expect(onEvaluation).toHaveBeenCalledTimes(1);
        expect(screen.element.querySelector('.academy-authored-week-next')).toBeNull();

        const input = screen.element.querySelector<HTMLInputElement>('[data-source-vocabulary-answer]')!;
        input.value = 'today';
        screen.element.querySelector<HTMLFormElement>('.academy-source-vocabulary-form')!.requestSubmit();
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-authored-week-next')).not.toBeNull());
        expect(onEvaluation).toHaveBeenCalledTimes(2);
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(screen.currentActivityId).toBe('activity:one');
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('1 / 3');
    });

    it('keeps language controls stable and revisits earlier support without inflating progress', async () => {
        const screen = createAuthoredWeekScreen({ language: 'en', week: weekFixture() });
        document.body.append(screen.element);
        const panel = screen.element.querySelector<HTMLElement>('.academy-authored-week-panel')!;

        const translation = screen.element.querySelector<HTMLButtonElement>('.academy-lesson-language-tool:nth-child(2)')!;
        translation.click();
        expect(screen.element.querySelector<HTMLElement>('.academy-lesson-teaching-translation')?.hidden).toBe(true);
        translation.click();
        panel.scrollTop = 151;
        openQuestion(screen.element);
        expect(panel.scrollTop).toBe(0);
        expect(document.activeElement).toBe(choice(screen.element, 'wrong'));
        choice(screen.element, 'right').click();
        await flush();
        screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next')!.click();
        expect(screen.currentActivityIndex).toBe(1);
        panel.scrollTop = 151;
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-back')!.click();
        expect(screen.currentActivityIndex).toBe(0);
        expect(panel.scrollTop).toBe(0);
        expect(document.activeElement).toBe(screen.element.querySelector('.academy-lesson-teaching-title'));
        expect(screen.element.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('1 / 2');

        const readings = screen.element.querySelector<HTMLButtonElement>('.academy-lesson-language-tool:first-child')!;
        readings.click();
        expect(screen.element.querySelector<HTMLElement>('.academy-lesson-teaching-japanese')?.dataset.yomuFuriganaMode).toBe('all');
    });
});

function choice(root: ParentNode, id: string): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(`[data-choice-id="${id}"]`)!;
}

function openQuestion(root: ParentNode): void {
    root.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
}

function weekFixture(
    evaluateOverride?: (activityId: string, response: AuthoredWeekResponse) => AuthoredChoiceEvaluation,
): LearnerAuthoredWeek {
    const activities = [
        activity('activity:one', { en: 'Which one is wa?', ja: 'は どれですか' }),
        activity('activity:two', { en: 'Choose the second answer.', ja: '二つ目を えらんでください' }),
    ];
    return {
        id: 'l1-l01',
        preAssessment: [],
        activities,
        media: [{
            assetId: 'audio:test',
            status: 'unavailable',
            reason: 'unresolved-academy-locator',
            sourceLocator: 'academy://audio/secret',
        }],
        provenance: {
            source: { path: '/fixture/week.json', sha256: '0'.repeat(64) },
            packageId: 'l1-l01',
            packageProvenance: {},
        },
        evaluate(activityId, response) {
            return evaluateOverride?.(activityId, response) ?? evaluation(response === 'right' ? 'pass' : 'lapse');
        },
    };
}

function activity(id: string, prompt: { readonly en: string; readonly ja: string }): LearnerAuthoredChoice {
    return {
        id,
        kind: 'choice',
        sourceQuestionId: `source:${id}`,
        conceptIds: ['concept:test'],
        responseKind: 'choice',
        curriculumPhase: 'assessed-recognition',
        prompt,
        options: [
            { id: 'wrong', label: { en: 'Wrong', ja: 'が' } },
            { id: 'right', label: { en: 'Right', ja: 'は' } },
        ],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'context',
            title: { ja: 'この問題の前に', en: 'Before this question' },
            entries: [{ japanese: 'は', translation: 'wa' }],
        },
        provenance: { packageId: 'l1-l01', sourceQuestionId: `source:${id}` },
    };
}

function structuredWeek(
    activity: LearnerAuthoredCloze | LearnerAuthoredMatching | LearnerAuthoredOrdering,
    evaluateResponse: (response: AuthoredWeekResponse) => AuthoredChoiceEvaluation,
): LearnerAuthoredWeek {
    return {
        id: 'l1-l01',
        preAssessment: [],
        activities: [activity],
        media: [],
        provenance: {
            source: { path: '/fixture/structured.json', sha256: '0'.repeat(64) },
            packageId: 'l1-l01',
            packageProvenance: {},
        },
        evaluate(_activityId, response) { return evaluateResponse(response); },
    };
}

function structuredCloze(): LearnerAuthoredCloze {
    return {
        ...structuredBase('cloze'),
        kind: 'academy-authored-cloze',
        responseKind: 'authored-cloze-fields',
        payload: {
            sentence: 'りえさん＿①＿ にほんご＿②＿ せんせいです。',
            blanks: [
                { id: 'b1', label: { en: 'Blank 1', ja: '1ばんの空欄' } },
                { id: 'b2', label: { en: 'Blank 2', ja: '2ばんの空欄' } },
            ],
        },
    };
}

function structuredMatching(): LearnerAuthoredMatching {
    return {
        ...structuredBase('matching'),
        kind: 'academy-authored-matching',
        responseKind: 'authored-one-to-one-matching',
        payload: {
            items: [{ id: 'item-1', label: '三人' }, { id: 'item-2', label: '五円' }],
            targets: [{ id: 'target-2', label: 'five yen' }, { id: 'target-1', label: 'three people' }],
        },
    };
}

function structuredOrdering(): LearnerAuthoredOrdering {
    return {
        ...structuredBase('ordering'),
        kind: 'academy-authored-ordering',
        responseKind: 'authored-ordered-items',
        payload: {
            sequences: [{
                id: 'sequence-1',
                items: [{ id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'a', label: 'A' }],
            }],
        },
    };
}

function structuredBase(id: string): Pick<
    Extract<LearnerAuthoredActivity, { kind: `academy-authored-${string}` }>,
    'id' | 'sourceQuestionId' | 'conceptIds' | 'curriculumPhase' | 'prompt'
    | 'answerSupport' | 'teachingSupport' | 'provenance'
> {
    return {
        id: `activity:${id}`,
        sourceQuestionId: `source:${id}`,
        conceptIds: [`concept:${id}`],
        curriculumPhase: 'guided-practice',
        prompt: { en: `Complete the ${id}.`, ja: `${id}を しましょう。` },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'context',
            title: { en: 'Before this activity', ja: 'この問題の前に' },
            entries: [{ japanese: 'ゆっくり かくにんしましょう。', translation: 'Take it one step at a time.' }],
        },
        provenance: { packageId: 'l1-l01', sourceQuestionId: `source:${id}` },
    };
}

function evaluation(outcome: 'pass' | 'lapse'): AuthoredChoiceEvaluation {
    return {
        result: {
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : ['concept:test:repair'],
            feedback: {
                explanation: { en: 'HIDDEN TARGET explanation', ja: 'かくした せつめい' },
                ...(outcome === 'lapse' ? {
                    repairPrompt: { en: 'hidden repair', ja: 'かくした なおしかた' },
                    nearbyExample: { en: 'nearby example', ja: 'ちかい れい' },
                } : {}),
            },
        },
        reviewSeeds: [{
            id: 'review:test',
            conceptId: 'concept:test',
            reason: outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: 'source:test',
            content: { expression: 'secret review expression', meanings: ['secret meaning'] },
        }],
    };
}

function sourceVocabularyRow(): SourceVocabularySheetModel {
    return {
        id: 'authored:l1-l01/source-time:p1:r1',
        kind: 'academy-source-vocabulary-sheet',
        sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
        conceptIds: ['concept:l1-l01:source-time:p1:r1'],
        responseKind: 'source-vocabulary-recall',
        prompt: { ja: 'ことばの いみを 思い出しましょう。', en: 'Recall the source row.' },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: {
            packageId: 'l1-l01',
            componentId: 'source-time',
            sourceId: 'moodle-vocabulary:source',
            sourceQuestionId: 'moodle-vocabulary:source:p1:row-1',
            payloadSha256: 'a'.repeat(64),
            sourceTitle: 'Source vocabulary',
            locus: { page: 1, row: 1 },
        },
        payload: {
            exact: { words: 'きょう', pronunciation: null, meaning: null },
            support: { words: 'きょう', reading: 'きょう', meaning: 'today' },
            fieldProvenance: { words: 'source-provided', reading: 'yomu-support', meaning: 'yomu-support' },
        },
    };
}
