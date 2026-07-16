import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonElevenAdjectiveWorkbookBeat,
    createLessonElevenAdjectiveWorkbookModel,
} from '../../src/academy/content/lesson-eleven-adjective-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    adjectiveDescriptionWorkbookPlugin,
    type AdjectiveDescriptionAnswer,
    type AdjectiveDescriptionRound,
    type AdjectiveDescriptionWorkbookResponse,
} from '../../src/academy/minigames/adjective-description-workbook';

const runtime = createActivityRuntime([adjectiveDescriptionWorkbookPlugin]);

afterEach(() => document.body.replaceChildren());

describe('Lesson 11 exact-source adjective description workbook', () => {
    it('binds exact Moodle, Minna, and Genki provenance and teaches before assessment', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l11',
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: 6053028,
                archiveOccurrenceId: 'archive-000011',
                documents: [
                    { payloadSha256: 'dfec00d8e4c6d049a2251e0ef90035cbe92edef7fdde0c7ca96ced1e8ed40aba', pages: '1-6' },
                    { payloadSha256: '869c7d8430e6d18a2c7d56aceda2789408e2fa9dada1643f30ff9bc600cb1623', pages: '1-3' },
                ],
            },
            minna: {
                payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
                pdfPage: 90,
                printedPage: 70,
                locus: 'Practice B, exercises 5-7',
            },
            genki: {
                taskId: 'genki-2e:l1-l11:lesson-5-workbook-2',
                payloadSha256: '5ab2683d567a265548fa0dbfb02af9961bd0bf367b669c2e7cc22aa38d149a65',
                scriptSha256: '470977b7f3e135dcbeefe9121426387f43f20fded2eda92eb6037fd5921cc2fc',
                lineLocus: { start: 76, end: 140 },
            },
        });
        expect(activity.payload.teaching.map(step => [step.pattern, step.example])).toEqual([
            ['い-adjective + noun / な-adjective + な + noun',
                'れい）ロンドン まち 〈たのしい〉 → ロンドンは たのしい まちです。／れい）ロンドン まち 〈にぎやかな〉 → ロンドンは にぎやかな まちです。'],
            ['X は どんな N ですか。— adjective + N です。',
                '奈良・町（静か） → 奈良はどんな町ですか。静かな町です。'],
            ['A です。そして、B です。／A ですが、B です。',
                'にほんの さくらは きれいです。そして、ゆうめいです。／にほんごの べんきょうは むずかしいですが、おもしろいです。'],
            ['い → くないです / な → じゃないです',
                'やさしい → やさしくないです／きれい → きれいじゃないです'],
        ]);
    });

    it('preserves 8 Moodle, 12 Minna, and 10 Genki rounds in exact order with three modes', () => {
        const rounds = model().payload.rounds;
        expect(rounds).toHaveLength(30);
        expect(rounds.map(round => round.sourceOrder)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
        expect(new Set(rounds.map(round => round.mode))).toEqual(new Set(['modifier', 'connector', 'typed']));
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual([
            'ワットさん／せんせい〈しんせつな〉',
            'ハイドパーク／こうえん〈きれいな〉',
            'ハリーポッター／ほん〈おもしろい〉',
            'ふじさんは（ゆうめいです → ＿＿）やまです。',
            'さくらは（きれいです → ＿＿）はなです。',
            'きょうとは どんな まちですか。〈きれい〉',
            'にほんの たべもの（おいしい、たかい）',
            'にほんの ちかてつ（べんり、きれい）',
        ]);
        expect(rounds.slice(8, 20).map(round => round.sourcePrompt)).toEqual([
            '会社の 社員（新しい、きれい）', '先生（親切、おもしろい）',
            '日本の 食べ物（おいしい、高い）', '日本の 生活（忙しい、おもしろい）',
            'IMC・新しい・会社', '神戸病院・有名・病院', 'ワットさん・いい・先生', '富士山・きれい・山',
            '「七人の侍」・映画（おもしろい）', 'サントスさん・人（親切）',
            'さくら大学・大学（新しい）', 'スイス・国（きれい）',
        ]);
        expect(rounds[20]?.sourcePrompt).toBe('日本語の宿題はやさしいですか。\n(No, Japanese homework is not easy.)');
        expect(rounds[29]?.sourcePrompt).toBe('I will not be free tomorrow.');
        expect(rounds[8]?.answerExpression).toBe('会社の社員はどうですか。新しいです。そして、きれいです。');
        expect(rounds[11]).toMatchObject({
            correctConnector: 'ga',
            answerExpression: '日本の生活はどうですか。忙しいですが、おもしろいです。',
        });
        expect(rounds.every(round => round.sourceQuestionId && round.hints.length === 3)).toBe(true);
    });

    it('passes exact answers and emits only missed source rounds as repair seeds', () => {
        const passed = runtime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(30);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning' && seed.sourceQuestionId)).toBe(true);

        const response = structuredClone(perfectResponse()) as { answers: AdjectiveDescriptionAnswer[] };
        response.answers[0] = { mode: 'modifier', roundId: 'source-1', attachment: 'direct', value: 'しんせつせんせいです' };
        response.answers[10] = { mode: 'connector', roundId: 'source-11', connector: 'soshite', value: '日本の食べ物はおいしいです。そして、高いです。' };
        response.answers[20] = { mode: 'typed', roundId: 'source-21', value: 'はい、日本語の宿題はやさしいです' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 27 / 30 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l11-adjective-description-1',
            'l1-l11-adjective-description-11',
            'l1-l11-adjective-description-21',
        ]);
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6053028:dfec00d8:p1:q1:1',
            'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-8:pdf-p90:practice-b:5:3',
            'genki-2e:l1-l11:lesson-5-workbook-2:slot-1',
        ]);
        expect(lapsed.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
    });

    it('rejects incomplete, duplicate, and wrong-mode response envelopes', () => {
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact Lesson 11 source item');
        const duplicate = structuredClone(perfectResponse()) as { answers: AdjectiveDescriptionAnswer[] };
        duplicate.answers[1] = duplicate.answers[0]!;
        expect(() => runtime.evaluate(model(), duplicate)).toThrow('every source item once');
        const wrongMode = structuredClone(perfectResponse()) as { answers: AdjectiveDescriptionAnswer[] };
        wrongMode.answers[0] = { mode: 'typed', roundId: 'source-1', value: 'しんせつなせんせいです' };
        expect(() => runtime.evaluate(model(), wrongMode)).toThrow('interaction mode');
    });

    it('rejects source prompt or accepted-answer drift', () => {
        const changedPrompt = structuredClone(model());
        (changedPrompt.payload.rounds[0] as unknown as { sourcePrompt: string }).sourcePrompt = 'changed';
        expect(runtime.validate(changedPrompt).map(issue => issue.message)).toContainEqual(
            expect.stringContaining('Exact source sequence changed'),
        );
        const changedAnswer = structuredClone(model());
        (changedAnswer.payload.rounds[29] as unknown as { acceptedAnswers: string[] }).acceptedAnswers[0] = 'changed';
        expect(runtime.validate(changedAnswer).map(issue => issue.message)).toContainEqual(
            expect.stringContaining('Exact source sequence changed'),
        );
    });

    it('shows teaching first, earns progressive hints after a lapse, and repairs only missed rounds', async () => {
        const hostElement = document.createElement('main');
        const supportUse = vi.fn();
        const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);

        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.textContent).toContain('Learn the forms and meaning first');
        expect(hostElement.textContent).toContain('奈良はどんな町ですか。静かな町です。');
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        expect(hostElement.textContent).not.toContain('しんせつなせんせいです');
        hostElement.querySelector<HTMLButtonElement>('.academy-adjective-start')!.click();

        expect(hostElement.querySelectorAll('.academy-adjective-round')).toHaveLength(30);
        expect(hostElement.querySelectorAll('input[type="text"]')).toHaveLength(30);
        expect(hostElement.querySelectorAll('.academy-adjective-hints:not([hidden])')).toHaveLength(0);
        expect(hostElement.textContent).not.toContain('しんせつなせんせいです');
        expect(hostElement.querySelector('label')?.textContent).toContain('1.');
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name$="source-1-attachment"]')!.value = 'direct';
        hostElement.querySelector<HTMLInputElement>('input[name$="source-1-value"]')!.value = 'しんせつせんせいです';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));

        expect(evaluations[0]?.result.outcome).toBe('lapse');
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-adjective-round:not([hidden])')).toHaveLength(1));
        const hint = hostElement.querySelector<HTMLButtonElement>('.academy-adjective-hint')!;
        expect(hint).not.toBeNull();
        expect(hostElement.querySelector<HTMLElement>('.academy-adjective-hint-output')?.textContent).toBe('');
        hint.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-adjective-hint-output')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l1-l11-adjective-description-workbook',
            supportKind: 'hint',
            choiceId: 'source-1',
        });
        hint.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-adjective-hint-output')?.dataset.hintIndex).toBe('2');
        expect(hint.disabled).toBe(false);
        hint.click();
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);

        hostElement.querySelector<HTMLSelectElement>('select[name$="source-1-attachment"]')!.value = 'na';
        hostElement.querySelector<HTMLInputElement>('input[name$="source-1-value"]')!.value = 'しんせつなせんせいです';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(2));
        expect(evaluations[1]?.result.outcome).toBe('pass');
        await vi.waitFor(() => expect(hostElement.querySelector('form')?.getAttribute('aria-busy')).toBe('false'));
        expect(hostElement.querySelector<HTMLButtonElement>('.academy-adjective-check')?.disabled).toBe(false);
        controller.dispose();
    });

    it('wraps one lesson beat and keeps touch, mobile, and reduced-motion CSS contracts', () => {
        expect(createLessonElevenAdjectiveWorkbookBeat()).toMatchObject({
            id: 'adjective-description-workbook',
            activity: {
                id: 'activity:l1-l11-adjective-description-workbook',
                kind: 'academy-adjective-description-workbook',
            },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/adjective-description-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-adjective-round-grid[\s\S]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() {
    return createLessonElevenAdjectiveWorkbookModel();
}

function perfectResponse(): AdjectiveDescriptionWorkbookResponse {
    return { answers: model().payload.rounds.map(round => answerFor(round)) };
}

function answerFor(round: AdjectiveDescriptionRound): AdjectiveDescriptionAnswer {
    if (round.mode === 'modifier') {
        return { mode: round.mode, roundId: round.id, attachment: round.correctAttachment, value: round.acceptedAnswers[0]! };
    }
    if (round.mode === 'connector') {
        return { mode: round.mode, roundId: round.id, connector: round.correctConnector, value: round.acceptedAnswers[0]! };
    }
    return { mode: round.mode, roundId: round.id, value: round.acceptedAnswers[0]! };
}

function fillForm(root: HTMLElement, rounds: readonly AdjectiveDescriptionRound[]): void {
    rounds.forEach(round => {
        root.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
        if (round.mode === 'modifier') {
            root.querySelector<HTMLSelectElement>(`select[name$="${round.id}-attachment"]`)!.value = round.correctAttachment;
        } else if (round.mode === 'connector') {
            root.querySelector<HTMLSelectElement>(`select[name$="${round.id}-connector"]`)!.value = round.correctConnector;
        }
    });
}
