import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';

describe('Academy resource-ledger claim honesty', () => {
    it('counts only grounded complete class Weeks as playable', () => {
        const lessonRoot = path.resolve('public/academy/content/lessons');
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const playableWeekIds = ACADEMY_LESSON_CONTENT_REGISTRY.flatMap(entry => {
                if (entry.kind === 'authored-week') return [entry.classWeekId];
                if (entry.kind !== 'lesson' || !entry.classWeekId) return [];
                const value = JSON.parse(fs.readFileSync(path.join(lessonRoot, entry.filename), 'utf8'));
                return entry.audit(value).status === 'playable' ? [entry.classWeekId] : [];
            });

        expect(new Set(playableWeekIds).size).toBe(playableWeekIds.length);
        expect(ledger.coverage.sourceQuestionsAudited).toBe(246);
        expect(ledger.coverage.sourceQuestionsImplemented).toBe(397);
        expect(ledger.coverage.sourceQuestionsPlayable).toBe(397);
        expect(ledger.stage1VerticalSlice.currentRouteState).toBe('trusted-source-playable');
        expect(ledger.stage1VerticalSlice.learnerEvidenceWritesAllowed).toBe(true);
        expect(ledger.coverage.classWeeksPlayable).toBe(playableWeekIds.length);
        expect(ledger.coverage.classWeeksTotal).toBe(73);
        expect(ledger.stage2LibraryCensus.note).toMatch(/contributes no verified or playable source questions/i);
    });

    it('accounts for Lesson 42 exact vocabulary, pages, and quarantined source audio', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l2-l17');

        expect(lesson).toMatchObject({
            moodleModuleId: 8121270,
            sourcePackage: {
                filename: '044-l2-l17.json',
                sha256: 'a319510a34b185d008fd631849f56539f360bd61f32ad017812b5714fe38c834',
            },
            audio: { sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
            claims: { sourceVocabularyRowsProjected: 23, worksheetPagesRendered: 8, sourceAnswerKeysExposed: 0 },
        });
        expect(lesson.offline.precache).toHaveLength(9);
        expect(lesson.offline.precache.some((url: string) => /\.mp3$/i.test(url))).toBe(false);
        expect(lesson.sourceVisualAssets).toHaveLength(8);
    });

    it('pins the completed Lesson 12 preference workbook to its source package and materials', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l12');

        expect(lesson).toMatchObject({
            moodleModuleId: 5489594,
            sourcePackage: {
                filename: '013-l1-l12.json',
                sha256: 'b4eb6c44d1043a1936fd2ed0b1ced7c8a0c1f0bccf3dd1477c28546793c95cf0',
            },
            claims: { sourceRoundsDelivered: 22, answerVisibility: 'after-attempt' },
        });
        expect(lesson.documents.map((document: { payloadSha256: string }) => document.payloadSha256)).toEqual([
            '6e0a3e02c061f7203d7c8f65db7555993f463e5fee9adf241c36255b959186e4',
            'f1757ed9b43c4fb969deb55aa81351e5c2a873d3af902ed5f5fba05df36240ed',
            '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
            '500b8acfd6c6e821a7c3399a34849741975ef6f423198ca0565174335689b71d',
        ]);
        expect(lesson.documents.at(-1)).toMatchObject({
            scriptSha256: '938ef1d732db679ae76b6ce604f670456412ba84fa531ef1b867ace3ca5e0264',
            lineLocus: { start: 76, end: 138 },
        });
    });

    it('pins the completed Lesson 13 skill-and-understanding workbook to its delivered source materials only', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l13');

        expect(lesson).toMatchObject({
            moodleModuleId: 5489595,
            sourcePackage: {
                filename: '014-l1-l13.json',
                sha256: '35e0aba3f4755c4e78546fd860342104df0800eefefbddf3c2abbda89524c517',
            },
            sourceArchive: { sha256: 'e06668d27acd438d5b0e546042a4aa2dc063ba8e75595f96190d7aa4a844a839' },
            scope: expect.stringMatching(/15-item skill-and-understanding workbook slice/i),
            claims: {
                sourcePromptsDelivered: 15,
                sourceRoundsDelivered: 15,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256: string }) => document.payloadSha256)).toEqual([
            '189a165207404014343ed19be7bdba76e59212586273f68d9e27c5f0651d3fde',
            '5703647975dcf519399c5a911254a9a418ace4af7f8403242f1255e9e1dcfd1e',
            '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
            '3ccb538a2f9708ae43fcfd56640f7ee040a784eb790f61df0e401adb2506bff7',
        ]);
        expect(lesson.documents.at(-1)).toMatchObject({
            scriptSha256: '02d771397a001cb17900fce9f63abc17221db0fb14f01839ddf34a102febcd21',
            lineLocus: { start: 76, end: 139 },
            sourceSlice: [7, 8, 9],
        });
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/tracks 35\/36/i),
            expect.stringMatching(/picture-dependent skill prompts/i),
        ]));
    });

    it('pins the completed Lesson 14 reason workbook to its delivered sources without treating Minna as an answer source', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l14');

        expect(lesson).toMatchObject({
            moodleModuleId: 6097314,
            sourcePackage: {
                filename: '015-l1-l14.json',
                sha256: '2088851b83dcfc88926f3d74ca0e00b8cb40230e789f53ea408526a70519ee3e',
            },
            sourceArchive: { sha256: 'e30252905f7a07c7651519eae7c1b306de5b85e3082aae17a4442e02087cf9cb' },
            scope: expect.stringMatching(/11-item reason, why-question, and availability workbook slice/i),
            claims: {
                sourcePromptsDelivered: 11,
                sourceRoundsDelivered: 11,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256: string }) => document.payloadSha256)).toEqual([
            'a31989128cc698fc13a5722326c0d23b41087168c7de7a40ad261475ae53deef',
            '30428f5f3168b44f3f2cc5901c952dd0ceca2e8cc557995e99520d334441320e',
            'f7854a77f500534ed5a91e69354ccf76fb863c2f63caf7e67f45d17672c0ef2f',
            '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
            '9d14d05b28a80886dfdad068b30a979a6df917b2696df09fdedd6b820a9cbbc2',
        ]);
        expect(lesson.documents[3]).toMatchObject({
            status: expect.stringMatching(/chronology-map-only/i),
            sourcePromptsDelivered: 0,
        });
        expect(lesson.documents.at(-1)).toMatchObject({
            scriptSha256: '93d56a81d9f5e3f233c3771259c38b98bb3070e8500d9a985104d2eeeb7aff32',
            lineLocus: { start: 76, end: 133 },
            sourceSlice: [1, 2, 3],
        });
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/no Minna answer is presented/i),
            expect.stringMatching(/scanned homework pages/i),
        ]));
    });

    it('pins the completed Lesson 16 existence-location workbook to all text-visible Moodle prompts before Genki', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l16');

        expect(lesson).toMatchObject({
            moodleModuleId: 5881257,
            sourcePackage: {
                filename: '017-l1-l16.json',
                sha256: 'd524cd54e4c2441e7613f065c3aa51b8bfffd33ed70db2dd773def02bcff8c02',
            },
            sourceArchive: { sha256: 'ab7585b4d14d945535b90b6c64509e9c1b34caa96f0659b83b23920e893f46ba' },
            scope: expect.stringMatching(/10-item existence-and-location workbook slice/i),
            claims: {
                sourcePromptsDelivered: 10,
                sourceRoundsDelivered: 10,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256?: string; sourceId?: string }) =>
            document.payloadSha256 ?? document.sourceId)).toEqual([
            'b2143f1f2ce2469fe7e54d8f778d75956ae6c060bc44e2c39421bde470b8ac0b',
            'japanese-minna:10-10',
            'a4af27440a6e72bde55d011df350acd921199a0b558eb168ec46b380a3949e09',
        ]);
        expect(lesson.documents[1]).toMatchObject({
            status: expect.stringMatching(/chronology-map-only/i),
            sourcePromptsDelivered: 0,
        });
        expect(lesson.documents.at(-1)).toMatchObject({
            scriptSha256: 'aad41fec9195385ef13a7e8280c6b2292c48d8857dfbcabd9c93c82fe968733a',
            lineLocus: { start: 76, end: 141 },
            sourceSlice: [1, 4],
        });
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/no Minna wording or answer is presented/i),
            expect.stringMatching(/picture tasks/i),
        ]));
    });

    it('pins the completed Lesson 17 museum-location workbook and its answer-key-free visual crops before Genki', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l17');

        expect(lesson).toMatchObject({
            moodleModuleId: 5489600,
            sourcePackage: {
                filename: '018-l1-l17.json',
                sha256: '04fe995f2e56ecab4f504c2c64e31d9952ed087a1503a9c714a75e5fb565f0d0',
            },
            sourceArchive: { sha256: '61c9d1b3633f418f55fbb047b2ea941eed7f4a2245ea33a45ef8945656150815' },
            scope: expect.stringMatching(/10-item museum-and-location workbook slice/i),
            claims: {
                sourcePromptsDelivered: 10,
                sourceRoundsDelivered: 10,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256?: string; sourceId?: string }) =>
            document.payloadSha256 ?? document.sourceId)).toEqual([
            '321fd611a707f2820764a563662b3b7b2ad70d6122ebf48e2dbea8951b4486a9',
            'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620',
            '2eb33ab6da711f25198843922600959965fbb7aee5c279f06598ffe109687e09',
            'japanese-minna:10-10',
            '1bc8b462c5c75728e9e891c35f71e9df13e05c7917b81e5aa4c07496582d9686',
        ]);
        expect(lesson.documents[0]).toMatchObject({
            status: expect.stringMatching(/teaching-pattern-preserved/i),
            sourcePromptsDelivered: 0,
        });
        expect(lesson.documents[1]).toMatchObject({
            pages: [1, 3],
            status: expect.stringMatching(/all-eight-source-prompts-delivered/i),
        });
        expect(lesson.documents[2]).toMatchObject({
            status: expect.stringMatching(/people-free-museum-context-crop-delivered/i),
            sourcePromptsDelivered: 0,
        });
        expect(lesson.documents[3]).toMatchObject({
            status: expect.stringMatching(/chronology-map-only/i),
            sourcePromptsDelivered: 0,
        });
        expect(lesson.documents.at(-1)).toMatchObject({
            scriptSha256: '4165f6dcecba03b99b8f7124f35d863fa6232585949619633905cc18a93ccd89',
            lineLocus: { start: 76, end: 153 },
            sourceSlice: [1, 6],
        });
        expect(lesson.sourceVisualAssets).toEqual([
            expect.objectContaining({ url: '/academy/content/lessons/l1-l17/moodle-position-picture-strip.png', page: 1, answerKeyVisible: false }),
            expect.objectContaining({ url: '/academy/content/lessons/l1-l17/moodle-position-room-garden.png', page: 3, answerKeyVisible: false }),
            expect.objectContaining({ url: '/academy/content/lessons/l1-l17/moodle-museum-object-panels.png', page: 2, answerKeyVisible: false, peopleFree: true }),
        ]);
        expect(lesson.claims).toMatchObject({ sourceVisualCropsDelivered: 3, sourceAnswerKeysExposed: 0 });
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/no Minna wording or answer is presented/i),
            expect.stringMatching(/source visual crops are delivered without answer-key text/i),
        ]));
    });

    it('pins the completed Lesson 18 fridge workbook to Moodle before support references and records absent source audio', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l18');

        expect(lesson).toMatchObject({
            moodleModuleId: 6200250,
            sourcePackage: {
                filename: '019-l1-l18.json',
                sha256: '01b56f04bc5cdb64986669d01cf32a76606f3898b241766277c30ed9bbd0d854',
            },
            sourceArchive: { sha256: '2412b5cffe9f22758f583ac773293f1af371ef60e3c979650d10722499c593fa' },
            scope: expect.stringMatching(/8-item counter-and-fridge information-gap workbook slice/i),
            audio: { status: 'not-present-in-moodle-archive', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
            claims: {
                sourcePromptsDelivered: 8,
                sourceRoundsDelivered: 8,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256?: string; sourceId?: string }) =>
            document.payloadSha256 ?? document.sourceId)).toEqual([
            '26c694d907c740415f1c4ea82635d7bd6ed64a3106406a4f033398f056c3f1f8',
            '425fb0138247c6a0328ca9d3006ffd0c6fa088c29945400598bda07f38f89b58',
            'fdb6883084e6340d7e0ba3dcef7cb868b8e57c220759135f8e84051ce4192fa4',
            'japanese-minna:11-11',
            'b20d58f1ada0f1785367cacaaf56e04363cf20e4134b4a4ef2aa0fee8114239c',
        ]);
        expect(lesson.documents[3]).toMatchObject({ status: expect.stringMatching(/chronology-map-only/i), sourcePromptsDelivered: 0 });
        expect(lesson.documents.at(-1)).toMatchObject({
            status: expect.stringMatching(/support-only-no-source-prompts-delivered/i),
            sourcePromptsDelivered: 0,
            scriptSha256: '2232e46b99640e7232015d3aebce123865b5b2abf778119063fb8b45661cfd36',
            lineLocus: { start: 76, end: 92 },
        });
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/contains no audio member/i),
            expect.stringMatching(/no Minna wording or answer is presented/i),
            expect.stringMatching(/no Genki wording or answer is presented/i),
        ]));
    });

    it('pins the Lesson 19 food-order page and five exact Moodle listening grids without promoting support material', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l19');

        expect(lesson).toMatchObject({
            moodleModuleId: 6223185,
            sourcePackage: {
                filename: '020-l1-l19.json',
                sha256: 'a6063210b4962cc1b39f2e79a8b00de8a28fe2dedcacf20beb02a85e446fe87c',
            },
            sourceArchive: { sha256: 'fa14f292cf886bb5e5eff9f82f6169956cd151223b98c9c0125e1388d06cbd03' },
            claims: {
                sourcePromptsDelivered: 6,
                sourceRoundsDelivered: 6,
                sourceVisualCropsDelivered: 1,
                originalAudioTracksDelivered: 2,
                listeningTasksBound: 5,
                sourceAnswerKeysExposed: 0,
            },
        });
        expect(lesson.documents.map((document: { payloadSha256?: string; sourceId?: string }) =>
            document.payloadSha256 ?? document.sourceId)).toEqual([
            'e316f2b99ea18663277b112f99680efee75a9dfe60d5ef5e00246e4498e27d6b',
            '797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8',
            'japanese-minna:11-11',
            'ee0628196ac3925a88cca35a8aae8dff56a782d346270d03a22463a961db956c',
        ]);
        expect(lesson.media.map((media: { payloadSha256: string }) => media.payloadSha256)).toEqual([
            '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372',
            'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd',
        ]);
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/only the five exact CD A-43\/A-44 page-1 response grids/i),
            expect.stringMatching(/no Minna wording or answer/i),
            expect.stringMatching(/no Genki wording or answer/i),
        ]));
    });

    it('pins the Lesson 20 frequency lens and three exact Moodle A-45 bindings', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l20');

        expect(lesson).toMatchObject({
            moodleModuleId: 6310077,
            sourcePackage: {
                filename: '021-l1-l20.json',
                sha256: '2b3c8c0baa203870361c321df089c6354e4f3cf6bf51b40983d1506a9d053c12',
            },
            sourceArchive: { sha256: '0d4a991fc8dcc2f8487f6ce3d44513c5a45306541b35fee5c5ac8e5937f55a0a' },
            claims: {
                sourcePromptsDelivered: 9,
                sourceRoundsDelivered: 9,
                sourceVisualCropsDelivered: 1,
                originalAudioTracksDelivered: 2,
                listeningTasksBound: 3,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
            },
        });
        expect(lesson.documents.map((document: { payloadSha256?: string; sourceId?: string }) =>
            document.payloadSha256 ?? document.sourceId)).toEqual([
            '14bf6fe4ba20b651eebe5639f9e87b2492592dc6ec92893ccd162e78289cc737',
            '797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8',
            'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-11',
            '6b8d397d95313e5fe17eb8de2d5cebb557f6365ee835309caff3d7c6a25fa5fa',
        ]);
        expect(lesson.media.map((media: { payloadSha256: string }) => media.payloadSha256)).toEqual([
            '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8',
            'bca7547d5207c2a6b2abe6fd2df8716a1858fd02bbdf34d6195291900c75389d',
        ]);
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/no digitized source transcript or answer key/i),
            expect.stringMatching(/track 039 remains unbound/i),
            expect.stringMatching(/duration support only/i),
        ]));
    });

    it('pins the Lesson 21 A-46 commute labels and post-attempt worksheet dialogue', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l21');

        expect(lesson).toMatchObject({
            moodleModuleId: 6375062,
            sourcePackage: { filename: '022-l1-l21.json', sha256: '8ef06397d57ef46717063fcae364992ade0b562f6d8aabda95125cb89be5e9c0' },
            claims: {
                sourcePromptsDelivered: 3,
                sourceRoundsDelivered: 3,
                originalAudioTracksDelivered: 1,
                listeningTasksBound: 3,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
            },
        });
        expect(lesson.media).toEqual([expect.objectContaining({
            payloadSha256: '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97',
            status: expect.stringMatching(/byte-verified-packaged-and-paired/i),
        })]);
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/page-2 map task remains outside/i),
            expect.stringMatching(/no Minna wording or answer/i),
            expect.stringMatching(/no Genki prompt or answer/i),
        ]));
    });

    it('pins Lesson 22 to its two Moodle charts and does not misrepresent runtime pronunciation as source audio', () => {
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const lesson = ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) =>
            slice.lessonId === 'l1-l22');

        expect(lesson).toMatchObject({
            moodleModuleId: 5489603,
            sourcePackage: { filename: '023-l1-l22.json', sha256: 'ef41f2a6433bf92a586ef078524e827bd734386ec621325d0db6b04cb9166bd9' },
            audio: {
                status: 'not-present-in-moodle-archive',
                sourceAudioMembers: 0,
                sourceAudioTracksDelivered: 0,
                runtimeSupport: { provider: 'canonical-yomu-pronunciation-service' },
            },
            claims: { sourcePromptsDelivered: 0, sourceChartCellsDelivered: 5, sourceRoundsDelivered: 5 },
        });
        expect(lesson.sourceVisualAssets).toHaveLength(2);
        expect(lesson.unconverted).toEqual(expect.arrayContaining([
            expect.stringMatching(/no audio member/i),
            expect.stringMatching(/no Minna wording or answer/i),
            expect.stringMatching(/カ-through-コ.*Lesson 23/i),
        ]));
    });
});
