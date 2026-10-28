import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFourteenReasonWorkbookBeat, createLessonFourteenReasonWorkbookModel } from '../../src/academy/content/lesson-fourteen-reason-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { reasonWorkbookPlugin, type ReasonWorkbookAnswer, type ReasonWorkbookResponse, type ReasonWorkbookRound } from '../../src/academy/minigames/reason-workbook';

const runtime = createActivityRuntime([reasonWorkbookPlugin]);
afterEach(() => document.body.replaceChildren());

describe('Lesson 14 reason workbook', () => {
    it('binds the exact Moodle sources first, records the honest Minna map, then pins Genki hashes', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l14', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: { moduleId: 6097314, archiveSha256: 'e30252905f7a07c7651519eae7c1b306de5b85e3082aae17a4442e02087cf9cb', documents: [
                { payloadSha256: 'a31989128cc698fc13a5722326c0d23b41087168c7de7a40ad261475ae53deef' },
                { payloadSha256: '30428f5f3168b44f3f2cc5901c952dd0ceca2e8cc557995e99520d334441320e' },
                { payloadSha256: 'f7854a77f500534ed5a91e69354ccf76fb863c2f63caf7e67f45d17672c0ef2f' },
            ] },
            minna: { payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229', pdfPage: 97, printedPage: 77, relation: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l14:lesson-6-workbook-7', payloadSha256: '9d14d05b28a80886dfdad068b30a979a6df917b2696df09fdedd6b820a9cbbc2', scriptSha256: '93d56a81d9f5e3f233c3771259c38b98bb3070e8500d9a985104d2eeeb7aff32', lineLocus: { start: 76, end: 133 }, sourceSlice: [1, 2, 3] },
        });
        expect(activity.provenance.minna.reason).toContain('no Minna answer is presented');
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual(['reason ですから、result', 'どうして + unchanged action + か', 'N が ありますか。はい、たくさん あります。／いいえ、ぜんぜん ありません。']);
    });

    it('keeps eight verbatim Moodle cues before three Genki fills in deterministic varied modes', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
        expect(rounds.map(round => round.mode)).toEqual(['result-choice', 'result-choice', 'why-choice', 'why-choice', 'why-choice', 'availability-choice', 'availability-choice', 'availability-choice', 'typed', 'typed', 'typed']);
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual([
            'ちかてつは たかいですから、＿＿。', 'きのう たくさん のみましたから、＿＿。',
            'ゴードンさんに りょうりを ならいます（わたしは りょうりが へたです）', 'タイごの ほんを かいました（らいげつ タイへ いきます）', 'きのう パブへ いきませんでした（しごとが たくさん ありました）',
            'じしょ（はい）', 'こまかい おかね（はい／たくさん）', 'おかね（いいえ／ぜんぜん）',
        ]);
        expect(rounds.slice(8).map(round => round.sourceQuestionId)).toEqual([
            'genki-2e:l1-l14:lesson-6-workbook-7:slot-1', 'genki-2e:l1-l14:lesson-6-workbook-7:slot-2', 'genki-2e:l1-l14:lesson-6-workbook-7:slot-3',
        ]);
    });

    it('grades every mode and sends only missed exact sources to repair', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = structuredClone(perfectResponse()) as { answers: ReasonWorkbookAnswer[] };
        response.answers[0] = { mode: 'result-choice', roundId: 'moodle-kara-subway', optionId: 'distractor-1' };
        response.answers[9] = { mode: 'typed', roundId: 'genki-test', value: 'テストはむずかしいです' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 9 / 11, errorTags: ['l1-l14-reason-1', 'l1-l14-reason-10'] });
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:6097314:a3198912:p1:q1:1', 'genki-2e:l1-l14:lesson-6-workbook-7:slot-2']);
    });

    it('teaches before assessment, hides successful work after a lapse, and offers progressive hints', async () => {
        const hostElement = document.createElement('main'); const supportUse = vi.fn(); const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), { language: 'en', replace(view) { hostElement.replaceChildren(view); }, announce() {}, recordSupportUse: supportUse }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);
        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-reason-start')!.click();
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name$="moodle-kara-subway-option"]')!.value = 'distractor-1';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-reason-round:not([hidden])')).toHaveLength(1));
        const hint = hostElement.querySelector<HTMLButtonElement>('.academy-reason-hint-button')!; hint.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-reason-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({ activityId: 'activity:l1-l14-reason-workbook', supportKind: 'hint', choiceId: 'moodle-kara-subway' });
        controller.dispose();
    });

    it('wraps a beat and carries the compact touch, mobile, and reduced-motion contracts', () => {
        expect(createLessonFourteenReasonWorkbookBeat()).toMatchObject({ id: 'reason-workbook', activity: { id: 'activity:l1-l14-reason-workbook', kind: 'academy-reason-workbook' } });
        const css = readFileSync(path.resolve('src/academy/minigames/reason-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/); expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*1fr/s); expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() { return createLessonFourteenReasonWorkbookModel(); }
function perfectResponse(): ReasonWorkbookResponse { return { answers: model().payload.rounds.map(answerFor) }; }
function answerFor(round: ReasonWorkbookRound): ReasonWorkbookAnswer { return round.mode === 'typed' ? { mode: 'typed', roundId: round.id, value: round.acceptedAnswers[0]! } : { mode: round.mode, roundId: round.id, optionId: round.correctOptionId }; }
function fillForm(root: HTMLElement, rounds: readonly ReasonWorkbookRound[]): void { rounds.forEach(round => { const name = round.mode === 'typed' ? `${round.id}-value` : `${round.id}-option`; const value = round.mode === 'typed' ? round.acceptedAnswers[0]! : round.correctOptionId; const element = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name$="${name}"]`)!; element.value = value; }); }
