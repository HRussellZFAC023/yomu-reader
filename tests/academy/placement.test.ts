import fs from 'node:fs';
import path from 'node:path';
import {
    collectFormControlTextTargetsIn,
    collectTextTargetsIn,
} from '../../src/reader/dom';
import { refreshAcademyAnnotationSurfaces } from '../../src/academy/integration/yomu-runtime';
import {
    ORIENTATION_MOCK_POLICY,
    ORIENTATION_MOCK_ITEMS,
    orientationItemsForBand,
    placementAudioDelivery,
    placementEntryChoice,
    scoreOrientationMock,
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
        expect(ORIENTATION_MOCK_POLICY.caveats.join(' ')).toMatch(/Speaking and writing are not directly assessed/i);
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
    function render(): HTMLElement {
        return renderPlacementMockScreen({
            language: 'en',
            pronunciation: { play: vi.fn(async () => ({ dispose: vi.fn() })) },
            onResult: vi.fn(),
            onBack: vi.fn(),
        });
    }

    it('uses real packaged Soya audio at N5 and retains honest speech playback where no mapping exists', () => {
        const pronunciation = { play: vi.fn(async () => ({ dispose: vi.fn() })) };
        const started = vi.fn();
        const stopped = vi.fn();
        const n5 = renderPlacementMockScreen({
            language: 'en', pronunciation, onListeningStart: started, onListeningStop: stopped,
            onResult: vi.fn(), onBack: vi.fn(),
        });
        document.body.replaceChildren(n5);
        chooseBand(n5, 'n5');

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
        expect(pronunciation.play).not.toHaveBeenCalled();

        const n4 = renderPlacementMockScreen({
            language: 'en', pronunciation, onResult: vi.fn(), onBack: vi.fn(),
        });
        chooseBand(n4, 'n4');
        expect(n4.querySelectorAll('audio')).toHaveLength(0);
        expect(n4.querySelectorAll('[data-audio-delivery="browser-speech"]')).toHaveLength(2);
    });

    function chooseBand(screen: HTMLElement, band: 'n5' | 'n4' | 'n3' | 'n2' | 'n1'): void {
        const select = screen.querySelector<HTMLSelectElement>('.academy-target-band select')!;
        select.value = band;
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
    }

    it('keeps every pre-commit answer outside Reader text and control lookup targets', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        chooseBand(screen, 'n3');
        refreshAcademyAnnotationSurfaces(screen);

        const answers = Array.from(screen.querySelectorAll<HTMLElement>('.academy-mock-option'));
        expect(answers).toHaveLength(orientationItemsForBand('n3').reduce((count, item) => count + item.options.length, 0));
        for (const answer of answers) {
            const copy = answer.querySelector<HTMLElement>('.academy-mock-option-copy');
            const input = answer.querySelector<HTMLInputElement>('input[type="radio"]');
            expect(answer.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.yomuRuntimeSurface).toBeUndefined();
            expect(copy?.dataset.yomuFuriganaMode).toBeUndefined();
            expect(input?.hasAttribute('aria-label')).toBe(false);
            expect(input?.hasAttribute('title')).toBe(false);
            expect(input?.labels?.item(0)).toBe(answer);
        }

        const proseTargets = collectTextTargetsIn(screen, 100, false);
        expect(proseTargets.some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
        const controlTargets = collectFormControlTextTargetsIn(screen, 100, false);
        expect(controlTargets.some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
    });

    it('selects a radio answer directly without Reader-owned interaction DOM', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        chooseBand(screen, 'n5');
        refreshAcademyAnnotationSurfaces(screen);
        const answer = screen.querySelector<HTMLLabelElement>('.academy-mock-option');
        const input = answer?.querySelector<HTMLInputElement>('input[type="radio"]');

        answer?.click();

        expect(input?.checked).toBe(true);
        expect(answer?.querySelector('.jpdb-reader-word')).toBeNull();
        expect(answer?.querySelector('.jpdb-reader-control-text-mirror')).toBeNull();
    });

    it('starts with an explicit level choice and only mounts that level\'s questions', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        expect(screen.querySelectorAll('.academy-mock-item')).toHaveLength(0);
        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Choose a JLPT mock');

        chooseBand(screen, 'n1');

        const questions = [...screen.querySelectorAll<HTMLElement>('.academy-mock-item')];
        expect(questions).toHaveLength(6);
        expect(questions.every(question => question.dataset.mockItem?.startsWith('orientation:n1:'))).toBe(true);
        expect(screen.querySelector<HTMLFieldSetElement>('.academy-target-band')?.hidden).toBe(true);
        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Step 1 of 7');
    });

    it('moves keyboard focus to the active control as the learner chooses a level and steps back', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        const target = screen.querySelector<HTMLSelectElement>('.academy-target-band select')!;
        target.focus();
        expect(document.activeElement).toBe(target);

        chooseBand(screen, 'n5');
        const firstQuestion = screen.querySelector<HTMLElement>('.academy-mock-item:not([hidden])')!;
        const firstAnswer = firstQuestion.querySelector<HTMLInputElement>('input[type="radio"]')!;
        expect(document.activeElement).toBe(firstAnswer);

        firstAnswer.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        const secondQuestion = screen.querySelector<HTMLElement>('.academy-mock-item:not([hidden])')!;
        expect(document.activeElement).toBe(secondQuestion.querySelector('input[type="radio"]'));

        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();
        expect(document.activeElement).toBe(firstAnswer);
    });

    it('restores focus to the saved answer when returning to a placement question', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        chooseBand(screen, 'n1');
        const answers = [...screen.querySelectorAll<HTMLInputElement>('.academy-mock-item:not([hidden]) input[type="radio"]')];
        const savedAnswer = answers[1]!;
        savedAnswer.click();

        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();

        expect(savedAnswer.checked).toBe(true);
        expect(document.activeElement).toBe(savedAnswer);
    });

    it('resets the Academy shell scroller without turning the placement screen into a nested scroller', () => {
        const host = document.createElement('main');
        host.className = 'academy-screen-host';
        const screen = render();
        host.append(screen);
        document.body.replaceChildren(host);
        chooseBand(screen, 'n1');
        const firstAnswer = screen.querySelector<HTMLInputElement>('.academy-mock-item:not([hidden]) input[type="radio"]')!;
        firstAnswer.click();
        host.scrollTop = 240;
        screen.scrollTop = 80;

        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();

        expect(host.scrollTop).toBe(0);
        expect(screen.scrollTop).toBe(0);
        expect(document.activeElement).toBe(screen.querySelector('.academy-mock-item:not([hidden]) input[type="radio"]'));
    });

    it('preserves answers when Back returns through questions and the level chooser', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        chooseBand(screen, 'n3');
        const firstAnswer = screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]')!;
        firstAnswer.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();
        expect(firstAnswer.checked).toBe(true);

        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();
        expect(screen.querySelector('.academy-placement-progress-label')?.textContent).toBe('Choose a JLPT mock');
        chooseBand(screen, 'n3');

        expect(screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]:checked')?.value)
            .toBe(firstAnswer.value);
    });

    it('preserves each band\'s answers when the learner compares starting levels', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        chooseBand(screen, 'n5');
        const n5Answer = screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]')!;
        n5Answer.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();

        const select = screen.querySelector<HTMLSelectElement>('.academy-target-band select')!;
        select.value = 'n1';
        chooseBand(screen, 'n1');
        const n1Answer = screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]')!;
        n1Answer.click();
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();

        select.value = 'n5';
        chooseBand(screen, 'n5');
        expect(screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]:checked')?.value)
            .toBe(n5Answer.value);
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-lesson-overview-back')!.click();
        select.value = 'n1';
        chooseBand(screen, 'n1');
        expect(screen.querySelector<HTMLInputElement>('.academy-mock-item input[type="radio"]:checked')?.value)
            .toBe(n1Answer.value);
    });

    it('restores a submitted mock for review without duplicating its choices', () => {
        const item = orientationItemsForBand('n4')[0]!;
        const selected = item.options[1]!;
        const screen = renderPlacementMockScreen({
            language: 'en',
            pronunciation: { play: vi.fn(async () => ({ dispose: vi.fn() })) },
            draft: {
                targetBand: 'n4',
                responses: { [item.id]: selected.id },
                confidence: { speaking: 0.75, writing: 0.25 },
            },
            onResult: vi.fn(),
            onBack: vi.fn(),
        });
        document.body.replaceChildren(screen);
        screen.querySelector<HTMLButtonElement>('.academy-placement-actions .academy-button-primary:not([type="submit"])')!.click();

        expect(screen.querySelector<HTMLInputElement>(`.academy-mock-item input[value="${selected.id}"]`)?.checked).toBe(true);
        expect(screen.querySelectorAll('.academy-mock-item:not([hidden]) .academy-mock-option')).toHaveLength(item.options.length);
    });
});

describe('orientation placement result', () => {
    it('states the evidence limit, playback truth, and preserved story continuity', () => {
        const items = orientationItemsForBand('n2');
        const result = scoreOrientationMock('n2', Object.fromEntries(items.map(item => [
            item.id,
            item.options.find(option => option.correct)!.id,
        ])), { speaking: 0.5, writing: 0.5 });

        const screen = renderPlacementResultScreen({
            language: 'en',
            result,
            onAccept: vi.fn(),
            onChoose: vi.fn(),
            onReview: vi.fn(),
        });

        expect(screen.querySelector('.academy-placement-evidence-note')?.textContent).toContain('6 N2 questions');
        expect(screen.querySelector('.academy-placement-evidence-note')?.textContent).toContain('not an official JLPT score');
        expect(screen.querySelector('.academy-placement-evidence-note')?.textContent).toContain('browser speech');
        expect(screen.querySelector('.academy-placement-continuity-note')?.textContent).toContain('does not reset or skip');
        expect((screen.querySelector('.academy-placement-continuity-note') as HTMLElement).dataset.storyProgression)
            .toBe('preserve');
        expect(screen.querySelectorAll('.academy-score-grid dt')).toHaveLength(5);
        expect(screen.querySelector('.academy-score-grid')?.textContent).toContain('Speaking confidence');
        expect(screen.querySelector('.academy-score-grid')?.textContent).toContain('Writing confidence');
    });

    it('reports source recordings only for a level whose exact audio is packaged', () => {
        const result = (band: 'n5' | 'n4') => scoreOrientationMock(band, {}, { speaking: 0.5, writing: 0.5 });
        const renderResult = (band: 'n5' | 'n4') => renderPlacementResultScreen({
            language: 'en', result: result(band), onAccept: vi.fn(), onChoose: vi.fn(), onReview: vi.fn(),
        });
        expect(renderResult('n5').querySelector('.academy-placement-evidence-note')?.textContent)
            .toContain('byte-verified source recordings');
        expect(renderResult('n4').querySelector('.academy-placement-evidence-note')?.textContent)
            .toContain('source recordings are not yet packaged for this level');
    });

    it('uses the same Back control as the mock to return to review or retake it', () => {
        const review = vi.fn();
        const screen = renderPlacementResultScreen({
            language: 'en',
            result: scoreOrientationMock('n5', {}, { speaking: 0.5, writing: 0.5 }),
            onAccept: vi.fn(),
            onChoose: vi.fn(),
            onReview: review,
        });

        const back = screen.querySelector<HTMLButtonElement>('.academy-placement-review');
        expect(back?.classList.contains('academy-lesson-overview-back')).toBe(true);
        expect(back?.textContent).toBe('← Back');
        back?.click();
        expect(review).toHaveBeenCalledOnce();
    });
});

describe('orientation placement responsive accessibility', () => {
    it('keeps placement controls readable, focusable, and motion-safe across screen widths', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/screens.css'), 'utf8');

        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-stage,[\s\S]*min-width:\s*0/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-mock-option-copy\s*\{[^}]*min-width:\s*0/s);
        expect(css).toMatch(/\.academy-placement-form \.academy-target-band\[hidden\]\s*\{[^}]*display:\s*none/s);
        expect(css).toMatch(/\.academy-placement-form:has\(\.academy-target-band:not\(\[hidden\]\)\) \.academy-placement-confidence\s*\{[^}]*display:\s*none/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-actions \.academy-lesson-overview-back\s*\{[^}]*color:\s*#fffdf5/s);
        expect(css).toMatch(/\.academy-placement-screen \.academy-placement-actions \.academy-lesson-overview-back\s*\{[^}]*min-height:\s*44px/s);
        expect(css).toMatch(/\.academy-mock-prompt\s*\{[^}]*float:\s*left[^}]*width:\s*100%/s);
        expect(css).toMatch(/academy-mock-option:has\(input:focus-visible\)[\s\S]*outline:\s*3px solid/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-screen-host:has\(> \.academy-placement-screen\)\s*\{[^}]*height:\s*100dvh/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-screen\s*\{[^}]*overflow-x:\s*clip[^}]*overflow-y:\s*visible/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-screen\s*\{[^}]*overflow-y:\s*visible/s);
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.academy-placement-screen \.academy-panel-content\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/s);
        expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-placement-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*academy-placement-screen[\s\S]*transition:\s*none !important/s);
    });
});
