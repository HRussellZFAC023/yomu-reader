import fs from 'node:fs';
import path from 'node:path';
import {
    collectFormControlTextTargetsIn,
    collectTextTargetsIn,
} from '../../src/reader/dom';
import { refreshAcademyAnnotationSurfaces } from '../../src/academy/integration/yomu-runtime';
import type { PlacementMockDraft, PlacementMockProgress } from '../../src/academy/domain/placement-session';
import {
    ORIENTATION_MOCK_POLICY,
    ORIENTATION_MOCK_ITEMS,
    orientationItemsForBand,
    placementAudioDelivery,
    placementEntryChoice,
    scoreOrientationMock,
    type OrientationMockResult,
    validateOrientationMockItems,
} from '../../src/academy/placement/orientation';
import { renderPlacementMockScreen, renderPlacementResultScreen } from '../../src/academy/ui/placement-screen';

describe('orientation placement mock', () => {
    it('reports receptive skills separately and recommends without locking', () => {
        const items = orientationItemsForBand('n3');
        const responses = Object.fromEntries(items.map(item => [
            item.id,
            item.options.find(option => option.correct)!.id,
        ]));
        const result = scoreOrientationMock('n3', responses, { speaking: 0.5, writing: 0.25 });

        expect(result.scores).toEqual({
            'language-knowledge': 1,
            reading: 1,
            listening: 1,
            'speaking-confidence': 0.5,
            'writing-confidence': 0.25,
        });
        expect(result.recommendedBand).toBe('n3');
        expect(result.recommendedStart).toBe('n3');
        expect(result.calibration).toBe('vertical-slice');
        expect(result.itemIds).toEqual(items.map(item => item.id));
        expect(result.skillRecommendations).toMatchObject({
            'language-knowledge': { attempted: 2, correct: 2, available: 2, recommendedStart: 'n3' },
            reading: { attempted: 2, correct: 2, available: 2, recommendedStart: 'n3' },
            listening: { attempted: 2, correct: 2, available: 2, recommendedStart: 'n3' },
        });
        expect(result.storyProgression).toBe('preserve');
        expect(result.mockRevisit).toBe('always-available');
    });

    it('can route weak evidence all the way to Lesson 0', () => {
        const result = scoreOrientationMock('n2', {}, { speaking: -1, writing: 2 });
        expect(result.recommendedBand).toBe('n5');
        expect(result.recommendedStart).toBe('lesson-zero');
        expect(result.scores['speaking-confidence']).toBe(0);
        expect(result.scores['writing-confidence']).toBe(1);
    });

    it('keeps the mock optional, preserves story, and allows direct Lesson 0 entry and retakes', () => {
        expect(ORIENTATION_MOCK_POLICY).toMatchObject({
            optional: true,
            storyProgression: 'preserve',
            canSkipStory: false,
            revisit: 'always-available',
            sections: ['language-knowledge', 'reading', 'listening'],
        });
        expect(ORIENTATION_MOCK_POLICY.entryChoices).toEqual(['lesson-zero', 'n5', 'n4', 'n3', 'n2', 'n1']);
        expect(placementEntryChoice('lesson-zero')).toEqual({ kind: 'lesson-zero' });
        expect(placementEntryChoice('n2')).toEqual({ kind: 'mock', targetBand: 'n2' });
        expect(ORIENTATION_MOCK_POLICY.caveats.join(' ')).toMatch(/not an official JLPT score/i);
        expect(ORIENTATION_MOCK_POLICY.caveats.join(' ')).toMatch(/short production attempts/i);
        expect(ORIENTATION_MOCK_POLICY.caveats.join(' ')).toMatch(/transcript alternative/i);
    });

    it('provides two exact-source items for every receptive skill at every JLPT band', () => {
        for (const band of ['n5', 'n4', 'n3', 'n2', 'n1'] as const) {
            const items = orientationItemsForBand(band);
            expect(items).toHaveLength(6);
            expect(items.filter(item => item.skill === 'language-knowledge')).toHaveLength(2);
            expect(items.filter(item => item.skill === 'reading')).toHaveLength(2);
            expect(items.filter(item => item.skill === 'listening')).toHaveLength(2);
            expect(new Set(items.map(item => item.referenceId)).size).toBe(6);
            expect(items.every(item => item.options.length >= 3)).toBe(true);
            expect(items.every(item => item.options.filter(option => option.correct).length === 1)).toBe(true);
            expect(items.every(item => item.provenance.contentFidelity === 'exact')).toBe(true);
            expect(items.every(item => item.provenance.answerGate === 'after-attempt')).toBe(true);
        }
    });

    it('carries auditable source and honest audio provenance without private paths', () => {
        for (const item of ORIENTATION_MOCK_ITEMS) {
            expect(item.provenance).toMatchObject({
                sourceScope: 'soya-research',
                sourceItemId: item.referenceId,
                corpusRightsState: 'item-review-required',
                useAuthorization: 'user-permitted',
            });
            expect(item.provenance.sourceFile).not.toMatch(/^\//u);
            expect(item.provenance.sourceFileSha256).toMatch(/^[a-f0-9]{64}$/u);
        }

        const listening = ORIENTATION_MOCK_ITEMS.filter(item => item.skill === 'listening');
        expect(listening.every(item => item.audio && item.spokenJapanese)).toBe(true);
        const packaged = listening.filter(item => item.audio?.runtimeDelivery === 'packaged-source-recording');
        expect(packaged.map(item => item.referenceId)).toEqual(['n5_mock1_l_04', 'n5_mock1_l_11']);
        expect(packaged.every(item => item.audio?.deliveryLocator?.startsWith('academy/content/soya/audio/'))).toBe(true);
        expect(listening.filter(item => item.audio?.runtimeDelivery === 'browser-speech-synthesis')).toHaveLength(8);
        const recorded = listening.filter(item => item.audio?.sourceAvailability === 'recorded-source');
        expect(recorded).toHaveLength(8);
        expect(recorded.every(item => item.audio?.remoteUrl?.startsWith('https://'))).toBe(true);
        expect(recorded.every(item => /^[a-f0-9]{64}$/u.test(item.audio?.sha256 ?? ''))).toBe(true);
        const ttsOnly = listening.filter(item => item.audio?.sourceAvailability === 'source-text-only');
        expect(ttsOnly.map(item => item.band)).toEqual(['n1', 'n1']);
        expect(ttsOnly.every(item => !item.audio?.remoteUrl && !item.audio?.sha256)).toBe(true);
    });

    it('resolves packaged placement audio through the completed crosswalk without URL guessing', () => {
        const n5 = orientationItemsForBand('n5').filter(item => item.skill === 'listening');
        expect(n5.map(placementAudioDelivery)).toEqual([
            {
                kind: 'source-recording',
                url: '/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3',
                sha256: 'da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664',
            },
            {
                kind: 'source-recording',
                url: '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
                sha256: '32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8',
            },
        ]);
        expect(placementAudioDelivery(orientationItemsForBand('n4').find(item => item.skill === 'listening')!))
            .toMatchObject({ kind: 'browser-speech' });
    });

    it('retains exact source choices and recorded-audio identity for representative items', () => {
        const n5 = ORIENTATION_MOCK_ITEMS.find(item => item.referenceId === 'n5_mock1_v_01');
        expect(n5?.prompt.ja).toBe('きのう 【友だち】 と 映画を 見ました。');
        expect(n5?.options.map(option => option.label.ja)).toEqual(['ともだち', 'ゆうだち', 'ともたち', 'ゆうたち']);
        expect(n5?.options.find(option => option.correct)?.label.ja).toBe('ともだち');

        const n2Audio = ORIENTATION_MOCK_ITEMS.find(item => item.referenceId === 'n2_m1_listening_point_3_1');
        expect(n2Audio?.options.map(option => option.label.ja)).toEqual([
            '給料が安いから',
            '勤務地が遠いから',
            '海外出張があるから',
            '経理の経験がないから',
        ]);
        expect(n2Audio?.audio).toEqual({
            sourceAvailability: 'recorded-source',
            runtimeDelivery: 'browser-speech-synthesis',
            transcriptFidelity: 'exact-utterance-text',
            sourcePath: '/assets/audio/n2_mock1/n2_m1_listening_point_3_1.mp3',
            remoteUrl: 'https://soya-eagle-online.com/assets/audio/n2_mock1/n2_m1_listening_point_3_1.mp3',
            sha256: '2cac29860f4894536fa855d2714c0a04e77ae96fc0a49977fc5f901e180062da',
        });
    });

    it('does not reuse a fake choice set across source items', () => {
        const signatures = ORIENTATION_MOCK_ITEMS.map(item => item.options.map(option => option.label.ja).join('\u0000'));
        expect(new Set(signatures).size).toBe(signatures.length);
    });

    it('rejects duplicate source answers before they can render as options', () => {
        const [first] = ORIENTATION_MOCK_ITEMS;
        expect(first).toBeDefined();
        expect(() => validateOrientationMockItems([
            ...ORIENTATION_MOCK_ITEMS.slice(0, 1).map(item => ({
                ...item,
                options: [
                    item.options[0]!,
                    { ...item.options[1]!, label: item.options[0]!.label },
                    ...item.options.slice(2),
                ],
            })),
            ...ORIENTATION_MOCK_ITEMS.slice(1),
        ])).toThrow(/Duplicate or empty option/);
    });

    it('rejects duplicate localized choices before they can render ambiguously', () => {
        const [first] = ORIENTATION_MOCK_ITEMS;
        expect(first).toBeDefined();
        expect(() => validateOrientationMockItems([
            ...ORIENTATION_MOCK_ITEMS.slice(0, 1).map(item => ({
                ...item,
                options: [
                    item.options[0]!,
                    { ...item.options[1]!, label: { ...item.options[1]!.label, en: item.options[0]!.label.en } },
                    ...item.options.slice(2),
                ],
            })),
            ...ORIENTATION_MOCK_ITEMS.slice(1),
        ])).toThrow(/Duplicate or empty option \(en\)/);
    });

    it('recommends each receptive start independently and never rewards missing answers', () => {
        const items = orientationItemsForBand('n3');
        const knowledge = items.filter(item => item.skill === 'language-knowledge');
        const reading = items.filter(item => item.skill === 'reading');
        const listening = items.filter(item => item.skill === 'listening');
        const responses = Object.fromEntries([
            ...knowledge.map(item => [item.id, item.options.find(option => option.correct)!.id]),
            [reading[0]!.id, reading[0]!.options.find(option => option.correct)!.id],
            ...listening.map(item => [item.id, item.options.find(option => !option.correct)!.id]),
        ]);

        const result = scoreOrientationMock('n3', responses, { speaking: 1, writing: 1 });

        expect(result.skillRecommendations).toMatchObject({
            'language-knowledge': { attempted: 2, correct: 2, recommendedStart: 'n3' },
            reading: { attempted: 1, correct: 1, score: 0.5, recommendedStart: 'n4' },
            listening: { attempted: 2, correct: 0, recommendedStart: 'n5' },
        });
        expect(result.recommendedStart).toBe('n5');
        expect(result.scores['speaking-confidence']).toBe(1);
        expect(result.scores['writing-confidence']).toBe(1);

        const missingListening = scoreOrientationMock('n3', Object.fromEntries([
            ...knowledge.map(item => [item.id, item.options.find(option => option.correct)!.id]),
            ...reading.map(item => [item.id, item.options.find(option => option.correct)!.id]),
        ]), { speaking: 1, writing: 1 });
        expect(missingListening.skillRecommendations?.listening).toMatchObject({
            attempted: 0,
            correct: 0,
            recommendedStart: 'lesson-zero',
        });
        expect(missingListening.recommendedStart).toBe('lesson-zero');

        const invalidListening = scoreOrientationMock('n3', Object.fromEntries([
            ...knowledge.map(item => [item.id, item.options.find(option => option.correct)!.id]),
            ...reading.map(item => [item.id, item.options.find(option => option.correct)!.id]),
            ...listening.map(item => [item.id, 'not-a-source-choice']),
        ]), { speaking: 1, writing: 1 });
        expect(invalidListening.skillRecommendations?.listening).toMatchObject({
            attempted: 0,
            correct: 0,
            recommendedStart: 'lesson-zero',
        });
    });
});

describe('orientation placement answer surfaces', () => {
    const pronunciation = () => ({ play: vi.fn(async () => ({ dispose: vi.fn() })) });

    function render(overrides: Partial<Parameters<typeof renderPlacementMockScreen>[0]> = {}): HTMLElement {
        return renderPlacementMockScreen({
            language: 'en',
            pronunciation: pronunciation(),
            onResult: vi.fn(),
            onBack: vi.fn(),
            ...overrides,
        });
    }

    async function chooseBand(screen: HTMLElement, band: 'n5' | 'n4' | 'n3' | 'n2' | 'n1'): Promise<void> {
        const select = screen.querySelector<HTMLSelectElement>('.academy-target-band select')!;
        select.value = band;
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        await vi.waitFor(() => expect(screen.querySelector<HTMLElement>('.academy-placement-briefing')?.hidden).toBe(false));
    }

    async function continuePlacement(screen: HTMLElement): Promise<void> {
        const before = screen.querySelector('.academy-placement-progress-label')?.textContent;
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        await vi.waitFor(() => expect(screen.querySelector('.academy-placement-progress-label')?.textContent).not.toBe(before));
    }

    it('uses packaged audio at N5 and speech playback where no exact package is available', async () => {
        const service = pronunciation();
        const started = vi.fn();
        const stopped = vi.fn();
        const n5 = render({ pronunciation: service, onListeningStart: started, onListeningStop: stopped });
        document.body.replaceChildren(n5);
        await chooseBand(n5, 'n5');

        const recordings = [...n5.querySelectorAll<HTMLAudioElement>('audio[data-audio-delivery="source-recording"]')];
        expect(recordings.map(player => player.getAttribute('src'))).toEqual([
            '/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3',
            '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
        ]);
        expect(recordings.every(player => !player.autoplay && player.controls && player.preload === 'metadata')).toBe(true);
        recordings[0]!.dispatchEvent(new Event('play'));
        recordings[0]!.dispatchEvent(new Event('pause'));
        expect(started).toHaveBeenCalledOnce();
        expect(stopped).toHaveBeenCalledOnce();
        expect(service.play).not.toHaveBeenCalled();

        const n4 = render({ pronunciation: service });
        await chooseBand(n4, 'n4');
        expect(n4.querySelectorAll('audio')).toHaveLength(0);
        expect(n4.querySelectorAll('[data-audio-delivery="browser-speech"]')).toHaveLength(2);
    });

    it('teaches the task before the first scored item and exposes exactly eight resumable steps', async () => {
        const screen = render();
        document.body.replaceChildren(screen);
        expect(screen.dataset.academyRoute).toBe('placement-mock');
        expect(screen.querySelectorAll('.academy-mock-item')).toHaveLength(0);
        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Choose a level');

        await chooseBand(screen, 'n1');

        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Step 1 of 8');
        expect(screen.querySelector('.academy-placement-briefing:not([hidden])')?.textContent)
            .toContain('One example, then one small stretch');
        expect(screen.querySelector('.academy-mock-item:not([hidden])')).toBeNull();
        const questions = [...screen.querySelectorAll<HTMLElement>('.academy-mock-item')];
        expect(questions).toHaveLength(6);
        expect(questions.every(question => question.dataset.mockItem?.startsWith('orientation:n1:'))).toBe(true);

        await continuePlacement(screen);
        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Step 2 of 8');
        expect(screen.querySelector('.academy-mock-item:not([hidden])')).not.toBeNull();
    });

    it('keeps every pre-commit answer outside Reader text and control lookup targets', async () => {
        const screen = render();
        document.body.replaceChildren(screen);
        await chooseBand(screen, 'n3');
        refreshAcademyAnnotationSurfaces(screen);

        const answers = Array.from(screen.querySelectorAll<HTMLElement>('.academy-mock-option'));
        expect(answers).toHaveLength(orientationItemsForBand('n3').reduce((count, item) => count + item.options.length, 0));
        for (const answer of answers) {
            const copy = answer.querySelector<HTMLElement>('.academy-mock-option-copy');
            const input = answer.querySelector<HTMLInputElement>('input[type="radio"]');
            expect(answer.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.yomuRuntimeSurface).toBeUndefined();
            expect(input?.hasAttribute('aria-label')).toBe(false);
            expect(input?.hasAttribute('title')).toBe(false);
            expect(input?.labels?.item(0)).toBe(answer);
        }
        expect(collectTextTargetsIn(screen, 100, false)
            .some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
        expect(collectFormControlTextTargetsIn(screen, 100, false)
            .some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
    });

    it('persists the exact step and answer, then restores both after a cold remount', async () => {
        const onProgress = vi.fn(async (_progress: PlacementMockProgress) => undefined);
        const screen = render({ onProgress });
        document.body.replaceChildren(screen);
        await chooseBand(screen, 'n4');
        await continuePlacement(screen);
        const answer = screen.querySelector<HTMLInputElement>('.academy-mock-item:not([hidden]) input[type="radio"]')!;
        answer.click();

        await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
            step: 2,
            submitted: false,
            draft: expect.objectContaining({ responses: expect.objectContaining({ [answer.name]: answer.value }) }),
        })));
        const saved = onProgress.mock.calls.at(-1)![0];
        const restored = render({ progress: saved });
        document.body.replaceChildren(restored);

        expect(restored.querySelector('.academy-placement-progress-label')?.textContent).toBe('Step 2 of 8');
        expect(restored.querySelector<HTMLInputElement>(`input[name="${answer.name}"][value="${answer.value}"]`)?.checked)
            .toBe(true);
    });

    it('requires playback or an explicit text alternative and excludes that alternative from listening evidence', async () => {
        const onProgress = vi.fn(async (_progress: PlacementMockProgress) => undefined);
        const screen = render({ onProgress });
        document.body.replaceChildren(screen);
        await chooseBand(screen, 'n5');
        await continuePlacement(screen);
        for (let index = 0; index < 4; index += 1) {
            screen.querySelector<HTMLInputElement>('.academy-mock-item:not([hidden]) input[type="radio"]')!.click();
            await continuePlacement(screen);
        }
        const listening = screen.querySelector<HTMLElement>('.academy-mock-item:not([hidden])')!;
        const itemId = listening.dataset.mockItem!;
        listening.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        expect(screen.querySelector('.academy-form-feedback')?.textContent).toContain('Play the line or use the text alternative');

        listening.querySelector<HTMLButtonElement>('.academy-placement-text-alternative')!.click();
        expect(listening.querySelector<HTMLElement>('.academy-placement-transcript')?.hidden).toBe(false);
        await continuePlacement(screen);
        await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
            draft: expect.objectContaining({ listeningModes: expect.objectContaining({ [itemId]: 'transcript-alternative' }) }),
        })));

        const items = orientationItemsForBand('n5');
        const responses = Object.fromEntries(items.map(item => [item.id, item.options.find(option => option.correct)!.id]));
        expect(scoreOrientationMock('n5', responses, { speaking: 1, writing: 1 }, {
            [itemId]: 'transcript-alternative',
        }).skillRecommendations?.listening.attempted).toBe(1);
    });

    it('requires real speaking and writing attempts before returning a result', async () => {
        const onResult = vi.fn(async (_result: OrientationMockResult, _draft: PlacementMockDraft) => undefined);
        const screen = render({ onResult });
        document.body.replaceChildren(screen);
        await chooseBand(screen, 'n5');
        await continuePlacement(screen);
        for (let index = 0; index < 6; index += 1) {
            const current = screen.querySelector<HTMLElement>('.academy-mock-item:not([hidden])')!;
            if (current.querySelector('.academy-placement-listening')) {
                current.querySelector<HTMLButtonElement>('.academy-placement-text-alternative')!.click();
            }
            current.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
            await continuePlacement(screen);
        }
        expect(screen.querySelector('.academy-placement-production:not([hidden])')).not.toBeNull();
        screen.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
        expect(screen.querySelector('.academy-form-feedback')?.textContent).toContain('Try both production prompts');
        expect(onResult).not.toHaveBeenCalled();

        screen.querySelector<HTMLInputElement>('[name="placement-speaking-complete"]')!.click();
        screen.querySelector<HTMLInputElement>('[name="placement-speaking-confidence"][value="0.5"]')!.click();
        const writing = screen.querySelector<HTMLTextAreaElement>('[name="placement-writing-response"]')!;
        writing.value = 'ねこが すきです。';
        writing.dispatchEvent(new InputEvent('input', { bubbles: true }));
        screen.querySelector<HTMLInputElement>('[name="placement-writing-confidence"][value="1"]')!.click();
        screen.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

        await vi.waitFor(() => expect(onResult).toHaveBeenCalledOnce());
        expect(onResult.mock.calls[0]![1]).toMatchObject({
            production: {
                speaking: { mode: 'aloud', completed: true, confidence: 0.5, rated: true },
                writing: { mode: 'typed', completed: true, response: 'ねこが すきです。', confidence: 1, rated: true },
            },
        });
    });

    it('Back preserves the answer and returns focus to it', async () => {
        const screen = render();
        document.body.replaceChildren(screen);
        await chooseBand(screen, 'n5');
        await continuePlacement(screen);
        const answer = screen.querySelector<HTMLInputElement>('.academy-mock-item:not([hidden]) input[type="radio"]')!;
        answer.click();
        await continuePlacement(screen);
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();
        await vi.waitFor(() => expect(document.activeElement).toBe(answer));
        expect(answer.checked).toBe(true);
    });
});

describe('orientation placement result', () => {
    it('states the evidence limit and preserved story continuity without leaking implementation details', () => {
        const items = orientationItemsForBand('n2');
        const result = scoreOrientationMock('n2', Object.fromEntries(items.map(item => [
            item.id,
            item.options.find(option => option.correct)!.id,
        ])), { speaking: 0.5, writing: 0.5 });

        const screen = renderPlacementResultScreen({
            language: 'en',
            result,
            draft: {
                targetBand: 'n2',
                responses: {},
                listeningModes: { [items.find(item => item.skill === 'listening')!.id]: 'transcript-alternative' },
                production: {
                    speaking: { mode: 'aloud', completed: true, response: '', confidence: 0.5, rated: true },
                    writing: { mode: 'typed', completed: true, response: '例です。', confidence: 0.5, rated: true },
                },
            },
            onAccept: vi.fn(),
            onChoose: vi.fn(),
            onReview: vi.fn(),
        });

        expect(screen.dataset.academyRoute).toBe('placement-result');
        expect(screen.querySelector('.academy-placement-evidence-note')?.textContent).toContain('six short questions');
        expect(screen.querySelector('.academy-placement-evidence-note')?.textContent).toContain('not an official score');
        expect(screen.querySelector('.academy-placement-transcript-evidence-note')?.textContent)
            .toContain('not counted as listening');
        expect(screen.querySelector('.academy-placement-continuity-note')?.textContent).toContain('will not reset or skip');
        expect((screen.querySelector('.academy-placement-continuity-note') as HTMLElement).dataset.storyProgression)
            .toBe('preserve');
        expect(screen.querySelectorAll('.academy-score-grid dt')).toHaveLength(5);
        expect(screen.querySelector('.academy-score-grid')?.textContent).toContain('Speaking self-check');
        expect(screen.querySelector('.academy-score-grid')?.textContent).toContain('Writing self-check');
        expect(screen.textContent).not.toMatch(/source recording|browser speech|byte-verified|provenance/i);
    });

    it('uses the same Back control and prevents duplicate action activation', async () => {
        let release!: () => void;
        const review = vi.fn();
        const screen = renderPlacementResultScreen({
            language: 'en',
            result: scoreOrientationMock('n5', {}, { speaking: 0.5, writing: 0.5 }),
            onAccept: () => new Promise<void>(resolve => { release = resolve; }),
            onChoose: vi.fn(),
            onReview: review,
        });

        const back = screen.querySelector<HTMLButtonElement>('.academy-placement-review');
        expect(back?.classList.contains('academy-lesson-overview-back')).toBe(true);
        expect(back?.textContent).toBe('← Back');
        const accept = screen.querySelector<HTMLButtonElement>('.academy-button-primary')!;
        accept.click();
        accept.click();
        expect(accept.disabled).toBe(true);
        release();
        await Promise.resolve();
        expect(review).not.toHaveBeenCalled();
    });
});

describe('orientation placement responsive accessibility', () => {
    it('keeps the Rie stage, living paper and production controls responsive and motion-safe', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');

        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-stage,[\s\S]*min-width:\s*0/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-mock-option-copy\s*\{[^}]*min-width:\s*0/s);
        expect(css).toMatch(/\.academy-placement-form \.academy-target-band\[hidden\]\s*\{[^}]*display:\s*none/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-actions \.academy-lesson-overview-back\s*\{[^}]*color:\s*#fffdf5/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-actions \.academy-lesson-overview-back\s*\{[^}]*min-height:\s*44px/s);
        expect(css).toMatch(/academy-mock-option:has\(input:focus-visible\)[\s\S]*outline:\s*3px solid/s);
        expect(css).toMatch(/\.academy-placement-production-response\s*\{[^}]*width:\s*100%[^}]*min-height:\s*88px/s);
        expect(css).toMatch(/\.academy-placement-mode,[\s\S]*min-height:\s*44px/s);
        expect(css).toMatch(/\.academy-placement-result-screen \.academy-panel-content\s*\{[^}]*overflow:\s*auto/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-screen-host:has\(> \.academy-placement-screen\)\s*\{[^}]*height:\s*100dvh/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-screen \.academy-panel-content\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-result-screen \.academy-placement-stage\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-placement-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*academy-placement-screen[\s\S]*transition:\s*none !important/s);
    });
});
