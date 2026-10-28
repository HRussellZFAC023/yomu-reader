import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonL2L25ProbabilityBriefingBeat } from '../../src/academy/content/lesson-l2-l25-probability-briefing';
import {
    loadLessonActivityChapter,
    loadReachableLessonActivityChapter,
} from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const PACKAGE_SHA256 = 'a38f92840b06bb66cec4587a6d5b3005d4860f454152f5d5347f7c1b8526f00a';
const DESHOU_SHA256 = '4327bdf7c9734ac453b5453d6eb8997121d5f3e2e693d37e1d32772f830fad1b';
const KAMOSHIREMASEN_SHA256 = 'b2d999296ac31099b6dafcb7aa129663490c2d4048f12b02a8ac9351635ebc08';
const ANSWERS = [
    '明日(あした)は 曇(くも)りでしょう。',
    '明後日(あさって)は 雨(あめ)じゃないでしょう。',
    '午後(ごご)は すこし 晴(は)れるでしょう。',
    '日本の ロケットの 研究(けんきゅう)は 成功(せいこう)するでしょう。',
    '風邪(かぜ)を ひきました。インフルエンザかも しれません',
    '雲(くも)が あります。雨(あめ)が 降(ふ)るかも しれません。',
    '道(みち)が 混(こ)んでいますから、待ち合わせ(まちあわせ)に 間に合わない(まにあわない)かも しれません。',
    'Whatapp に返事(へんじ)が ありません。ともだちは 仕事(しごと)で 忙(いそが)しいかも しれません。',
] as const;

function model(): StateInspectionModel {
    return createLessonL2L25ProbabilityBriefingBeat().activity as StateInspectionModel;
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

afterEach(() => document.body.replaceChildren());

describe('l2-l25 exact-source Chapter 32 probability briefing', () => {
    it('pins the exact package, six source pages, three quarantined audio members, and declared crosswalk gap', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l25-probability-briefing',
            responseKind: 'moodle-chapter-32-probability-briefing',
            provenance: {
                packageId: 'l2-l25',
                packageOrder: 52,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121279,
                    archiveId: 'archive-000078',
                    answerKeyBasis: 'sensei-verbatim-probability-examples-over-canonical-source-pages',
                    media: {
                        status: 'audio-members-quarantined-unpaired',
                        sourceAudioMembers: 3,
                        sourceAudioTracksDelivered: 0,
                    },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 32', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: 'No Genki prerequisite anchor; curriculum crosswalk gap declared', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(6);
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'state-select', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'action-choice', 'typed-report',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('preserves all eight printed examples and binds them to committed package provenance', () => {
        const activity = model();
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual(ANSWERS);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            ...Array.from({ length: 4 }, (_, index) => (
                `moodle:8121279:${DESHOU_SHA256}:pdf-p1:example-${index + 1}`
            )),
            ...Array.from({ length: 4 }, (_, index) => (
                `moodle:8121279:${KAMOSHIREMASEN_SHA256}:pdf-p1:example-${index + 1}`
            )),
        ]);

        const packageRecord = JSON.parse(readFileSync(
            path.resolve('public/academy/content/lessons/052-l2-l25.json'),
            'utf8',
        )) as {
            sourceCoverage: { members: Array<Record<string, unknown>> };
        };
        expect(packageRecord.sourceCoverage.members.filter(member => (
            member.payloadSha256 === DESHOU_SHA256 || member.payloadSha256 === KAMOSHIREMASEN_SHA256
        ))).toEqual([
            expect.objectContaining({
                role: 'source-worksheet',
                payloadSha256: DESHOU_SHA256,
                uncompressedBytes: 2_175_907,
            }),
            expect.objectContaining({
                role: 'source-worksheet',
                payloadSha256: KAMOSHIREMASEN_SHA256,
                uncompressedBytes: 5_287_207,
            }),
        ]);
    });

    it('conceals the source-example key until submission, then grades and repairs only a missed line', async () => {
        const activity = model();
        const host = document.createElement('main');
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {});
        document.body.append(host);
        const key = host.querySelector<HTMLElement>('.academy-state-inspection-key')!;
        expect(key.hidden).toBe(true);
        expect(key.querySelector('h3')?.textContent).toBe('Sensei’s source examples after your attempt');

        const form = host.querySelector<HTMLFormElement>('form')!;
        activity.payload.rounds.forEach(round => {
            const name = `${activity.id}:${round.id}:answer`;
            const control = form.elements.namedItem(name);
            if (control instanceof RadioNodeList) control.value = round.answerValue;
            else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.value = round.answerValue;
        });
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        controller.dispose();

        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 7
                ? { ...answer, value: answer.value.replace('Whatapp', 'WhatsApp') }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse', score: 7 / 8, errorTags: ['l2-l25-probability-8'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(`${KAMOSHIREMASEN_SHA256}:pdf-p1:example-4`);
    });

    it('is directly and defensively reachable as the sole l2-l25 lesson chapter', async () => {
        const direct = await loadLessonActivityChapter('l2-l25', { lookup: async () => null });
        const reachable = await loadReachableLessonActivityChapter('l2-l25', { lookup: async () => null });
        for (const chapter of [direct, reachable]) {
            expect(chapter).toMatchObject({
                lessonPackageId: 'l2-l25',
                host: { id: 'rie' },
                beats: [{ id: 'probability-briefing', activity: { kind: 'academy-state-inspection' } }],
            });
        }

        const packageFiles = readdirSync(path.resolve('public/academy/content/lessons'))
            .filter(filename => /^\d{3}-l2-l25\.json$/u.test(filename));
        expect(packageFiles).toEqual(['052-l2-l25.json']);
        const packageRecord = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons/052-l2-l25.json'), 'utf8')) as {
            id: string; order: number; identity: { moduleId: number }; sourceCoverage: { archiveId: string };
        };
        expect(packageRecord).toMatchObject({ id: 'l2-l25', order: 52, identity: { moduleId: 8121279 }, sourceCoverage: { archiveId: 'archive-000078' } });
    });

    it('pins byte-identical public/docs assets, offline registration, and the honest ledger boundary', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l25', filename))).toBe(visual.sha256);
            expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/l2-l25', filename), path.resolve('public/academy/content/lessons/l2-l25', filename))).toBe(true);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/052-l2-l25.json'))).toBe(PACKAGE_SHA256);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/052-l2-l25.json'), path.resolve('public/academy/content/lessons/052-l2-l25.json'))).toBe(true);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/052-l2-l25.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/l2-l25\/[^']+\.mp3/u);
        }

        const ledgerBytes = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(ledgerBytes.toString('utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(slice => slice.lessonId === 'l2-l25');
        expect(slices).toHaveLength(1);
        expect(slices[0]).toMatchObject({
            moodleModuleId: 8121279,
            sourcePackage: { filename: '052-l2-l25.json', sha256: PACKAGE_SHA256 },
            sourceArchive: { id: 'archive-000078' },
            audio: { sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
            claims: { worksheetPagesRendered: 6, verbatimExamplesAssessed: 8, sourceAnswerKeysExposed: 0 },
        });
        expect(JSON.stringify(slices[0])).toContain('missing-genki-prerequisite-anchor');
        expect(JSON.stringify(slices[0])).toContain('no Genki, Soya, or other Japanese-corpus learner-facing material');
    });
});
