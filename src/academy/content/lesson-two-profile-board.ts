import lessonPackage from '../../../public/academy/content/lessons/003-l1-l02.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ProfileBoardModel, ProfileBoardRound } from '../minigames/profile-board';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const PACKAGE_ID = 'l1-l02';
const MODULE_ID = 5792908;
const VOCABULARY_COMPONENT_ID = 'sensei-chapter-1-2-vocabulary';
const VOCABULARY_SHA256 = '67d2f2f85ee3a0a5e0044ae31d2aa1ad870ab051c0ff2676cbc7540bd2fb372d';
const PROFILE_SHA256 = '501846818390b51c277bd67ea9b929dfcf41e06f4af2a26bd1836ae479184115';
const PROFILE_PAGE_IMAGE_SHA256 = 'c474a7aa7bb950d60deb1d84bbcfb3abbf15c0db682f16202f10ac3088d83dcc';

export function createLessonTwoSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = sourceVocabularyComponent();
    const provenance = record(component.provenance, 'l1-l02 vocabulary provenance');
    const sourceId = exactText(provenance.sourceId, 'l1-l02 vocabulary sourceId');
    const payloadSha256 = digest(provenance.payloadSha256, 'l1-l02 vocabulary payloadSha256');
    const sourceTitle = exactText(provenance.title, 'l1-l02 vocabulary title');
    if (payloadSha256 !== VOCABULARY_SHA256) throw new TypeError('Unexpected l1-l02 vocabulary payload.');

    const itemIds = new Set<string>();
    let previousPage = 0;
    let previousRow = 0;
    const items = array(component.items, 'l1-l02 vocabulary items');
    if (items.length !== 32) throw new TypeError('The exact 32-row l1-l02 vocabulary sheet is required.');
    return Object.freeze(items.map((candidate, index) => {
        const item = record(candidate, `l1-l02 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l02 vocabulary row ${index + 1} source`);
        const sourceQuestionId = exactText(source.itemId, `l1-l02 vocabulary row ${index + 1} itemId`);
        if (itemIds.has(sourceQuestionId)) throw new TypeError(`Duplicate l1-l02 vocabulary item ${sourceQuestionId}.`);
        itemIds.add(sourceQuestionId);
        if (digest(source.payloadSha256, `${sourceQuestionId} payloadSha256`) !== payloadSha256
            || exactText(source.title, `${sourceQuestionId} title`) !== sourceTitle
            || source.answerVisibility !== 'after-attempt') {
            throw new TypeError(`Vocabulary source identity changed for ${sourceQuestionId}.`);
        }
        const locus = record(source.locus, `${sourceQuestionId} locus`);
        const page = positiveInteger(locus.page, `${sourceQuestionId} page`);
        const row = positiveInteger(locus.row, `${sourceQuestionId} row`);
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            throw new TypeError('The l1-l02 vocabulary rows must remain in exact source order.');
        }
        previousPage = page;
        previousRow = row;
        const exact = record(source.exact, `${sourceQuestionId} exact fields`);
        const fieldProvenance = record(source.fieldProvenance, `${sourceQuestionId} field provenance`);
        const model: SourceVocabularySheetModel = {
            id: `authored:${PACKAGE_ID}/${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet',
            sourceQuestionId,
            conceptIds: [`concept:${PACKAGE_ID}:${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall',
            prompt: {
                ja: '先生の行を見て、意味を思い出してから確認しましょう。',
                en: 'Read the teacher row, recall its meaning, then check it.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID,
                componentId: VOCABULARY_COMPONENT_ID,
                sourceId,
                sourceQuestionId,
                payloadSha256,
                sourceTitle,
                locus: { page, row },
            },
            payload: {
                exact: {
                    words: exactText(exact.words, `${sourceQuestionId} exact words`),
                    pronunciation: nullableText(exact.pronunciation, `${sourceQuestionId} exact pronunciation`),
                    meaning: nullableText(exact.meaning, `${sourceQuestionId} exact meaning`),
                },
                support: {
                    words: exactText(item.ja, `${sourceQuestionId} support words`),
                    reading: exactText(item.reading, `${sourceQuestionId} support reading`),
                    meaning: exactText(item.en, `${sourceQuestionId} support meaning`),
                },
                fieldProvenance: {
                    words: exactText(fieldProvenance.words, `${sourceQuestionId} words provenance`),
                    reading: exactText(fieldProvenance.reading, `${sourceQuestionId} reading provenance`),
                    meaning: exactText(fieldProvenance.meaning, `${sourceQuestionId} meaning provenance`),
                },
            },
        };
        return Object.freeze(model);
    }));
}

export function createLessonTwoProfileBoardModel(): ProfileBoardModel {
    const sourceTitle = requiredSourceMember(PROFILE_SHA256);
    const rounds: readonly ProfileBoardRound[] = Object.freeze([
        profile('yamada', 'やまださん', 'にほん', 'bank employee', '銀行員', 'nihon-jin', 'ginkouin'),
        profile('watt', 'ワットさん', 'イギリス', 'teacher', '先生', 'igirisu-jin', 'sensei'),
        profile('tawapon', 'タワポンさん', 'タイ', 'student', '学生', 'tai-jin', 'gakusei'),
        profile('schmidt', 'シュミットさん', 'ドイツ', 'company employee', '会社員', 'doitsu-jin', 'kaishain'),
    ]);
    return Object.freeze({
        id: 'activity:l1-l02-source-profile-board',
        kind: 'academy-profile-board',
        responseKind: 'profile-board-radio-grid',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.flatMap(round => [round.nationality.conceptId, round.occupation.conceptId]),
        prompt: {
            ja: '先生の四人のプロフィールを、国せきと仕事で完成させましょう。',
            en: 'Complete the teacher’s four profiles with nationality and occupation.',
        },
        provenance: {
            sourceId: `moodle-payload:${PROFILE_SHA256}`,
            payloadSha256: PROFILE_SHA256,
            sourceTitle,
            author: 'Rie Tsuruta-Barratt',
            moodleModuleId: MODULE_ID,
            locus: { page: 2 as const, tasks: ['A', 'B'] as const },
            answerVisibility: 'after-attempt' as const,
            exactFields: ['name', 'country', 'occupation'] as const,
            yomuFraming: 'The source portraits, country labels, and occupation labels are preserved in the worksheet reference. English occupation clues are Yomu support for accessibility, not source text.',
            sourceReference: {
                imageUrl: '/academy/content/lessons/l1-l02/moodle-chapter-1-2-grammar-nationality-occupation-page-2.png',
                imageSha256: PROFILE_PAGE_IMAGE_SHA256,
                alt: {
                    ja: '先生の文法練習プリント2ページ目。ミラー、やまだ、ワット、タワポン、シュミットの肖像、国の地図、仕事のラベル、国せきと仕事を答えるAとB、否定文のCがある。',
                    en: 'Teacher grammar worksheet page 2 with portraits of Miller, Yamada, Watt, Tawapon, and Schmidt; country maps, occupation labels, A and B nationality and occupation prompts, and C negative-sentence prompts.',
                },
                caption: {
                    ja: '先生の原資料: Chapter 1-2 Grammar Exercise nationality and occupation, 2ページ目。AとBをこのあと完成させます。Cの否定文はこのスライスでは未変換です。',
                    en: 'Teacher source: Chapter 1-2 Grammar Exercise nationality and occupation, page 2. Complete A and B next; C negative sentences are not converted in this slice.',
                },
            },
            support: lessonSupport(),
        },
        payload: {
            teaching: [
                {
                    title: { ja: '人について言う', en: 'Say who someone is' },
                    pattern: 'Noun 1 は Noun 2 です。',
                    explanation: {
                        ja: '先生の例は「ミラーさんは かいしゃいんです。」です。人の名前、は、仕事、ですの順です。',
                        en: 'The teacher example is ミラーさんは かいしゃいんです: person, は, occupation, です.',
                    },
                },
                {
                    title: { ja: '国から国せきを作る', en: 'Make a nationality from a country' },
                    pattern: '国 + じん → 国せき',
                    explanation: {
                        ja: '国の名前に「じん」を足します。先生の例は「ミラーさんは アメリカじんです。」です。',
                        en: 'Add じん to a country name. The teacher example is ミラーさんは アメリカじんです.',
                    },
                },
            ],
            nationalityOptions: [
                { id: 'nihon-jin', label: 'にほんじん' },
                { id: 'igirisu-jin', label: 'イギリスじん' },
                { id: 'tai-jin', label: 'タイじん' },
                { id: 'doitsu-jin', label: 'ドイツじん' },
            ],
            occupationOptions: [
                { id: 'ginkouin', label: 'ぎんこういん' },
                { id: 'sensei', label: 'せんせい' },
                { id: 'gakusei', label: 'がくせい' },
                { id: 'kaishain', label: 'かいしゃいん' },
            ],
            rounds,
            passScore: 1 as const,
            feedback: {
                pass: {
                    explanation: {
                        ja: '四人の国せきと仕事が、先生のプロフィール表と合いました。',
                        en: 'All four nationalities and occupations match the teacher profile board.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '国せきか仕事が、先生のプロフィール表と違うところがあります。',
                        en: 'At least one nationality or occupation differs from the teacher profile board.',
                    },
                    repairPrompt: {
                        ja: '国には「じん」を足し、仕事の手がかりは先生の単語帳で確認しましょう。',
                        en: 'Add じん to the country, then check the occupation clue against the teacher vocabulary sheet.',
                    },
                    nearbyExample: {
                        ja: 'ミラーさんは アメリカじんです。ミラーさんは かいしゃいんです。',
                        en: 'Mr Miller is American. Mr Miller is a company employee.',
                    },
                },
            },
        },
    });
}

function profile(
    id: string,
    name: string,
    country: string,
    occupationEn: string,
    occupationJa: string,
    nationalityId: string,
    occupationId: string,
): ProfileBoardRound {
    const sourceBase = `moodle-payload:${PROFILE_SHA256}:p2`;
    return Object.freeze({
        id,
        name,
        country,
        occupationClue: {
            ja: `よむの意味サポート：${occupationJa}`,
            en: `Yomu accessibility clue: ${occupationEn}`,
        },
        nationality: {
            conceptId: `concept:l1-l02:profile:${id}:nationality`,
            sourceQuestionId: `${sourceBase}:task-a:${id}`,
            correctOptionId: nationalityId,
            errorTag: `l1-l02-profile-${id}-nationality`,
        },
        occupation: {
            conceptId: `concept:l1-l02:profile:${id}:occupation`,
            sourceQuestionId: `${sourceBase}:task-b:${id}`,
            correctOptionId: occupationId,
            errorTag: `l1-l02-profile-${id}-occupation`,
        },
    });
}

function sourceVocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l02 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l02 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l02 package identity.');
    }
    const matches = array(root.components, 'l1-l02 components').map((value, index) =>
        record(value, `l1-l02 component ${index}`)).filter(component => {
        if (component.type !== 'vocabulary') return false;
        const provenance = record(component.provenance, 'l1-l02 component provenance');
        return provenance.payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected one exact l1-l02 source vocabulary component.');
    return matches[0];
}

function requiredSourceMember(payloadSha256: string): string {
    const root = record(lessonPackage, 'l1-l02 package');
    const coverage = record(root.sourceCoverage, 'l1-l02 source coverage');
    const members = array(coverage.members, 'l1-l02 source members').map((value, index) =>
        record(value, `l1-l02 source member ${index}`));
    const matches = members.filter(member => member.payloadSha256 === payloadSha256);
    if (matches.length !== 1) throw new TypeError(`Expected one l1-l02 source member for ${payloadSha256}.`);
    return exactText(matches[0].title, `${payloadSha256} source title`);
}

function lessonSupport(): ProfileBoardModel['provenance']['support'] {
    const root = record(lessonPackage, 'l1-l02 package');
    const provenance = record(root.provenance, 'l1-l02 package provenance');
    const mappings = array(provenance.sourceMappings, 'l1-l02 source mappings').map((value, index) =>
        record(value, `l1-l02 source mapping ${index}`));
    const minna = mappings.filter(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (minna.length !== 1
        || exactText(minna[0].reference, 'l1-l02 Minna reference') !== 'Minna no Nihongo I · Lesson 1'
        || exactText(minna[0].reuse, 'l1-l02 Minna reuse') !== 'sequence-only') {
        throw new TypeError('Expected the declared Minna Lesson 1 sequence support.');
    }

    const activities = array(root.genkiInteractiveActivities, 'l1-l02 Genki support').map((value, index) =>
        record(value, `l1-l02 Genki activity ${index}`));
    const genki = activities.filter(activity => activity.id === 'genki-2e:l1-l02:lesson-1-workbook-6');
    if (genki.length !== 1
        || exactText(genki[0].relation, 'l1-l02 Genki relation') !== 'post-instruction-guided-fill') {
        throw new TypeError('Expected the declared post-instruction Genki support.');
    }
    const source = record(genki[0].source, 'l1-l02 Genki source');
    const delivery = record(genki[0].delivery, 'l1-l02 Genki delivery');
    const support: ProfileBoardModel['provenance']['support'] = {
        phase: 'after-moodle-source',
        minna: {
            sourceId: 'source-minna-no-nihongo',
            reference: 'Minna no Nihongo I · Lesson 1',
            reuse: 'sequence-only',
        },
        genki: {
            sourceId: exactText(source.sourceId, 'l1-l02 Genki sourceId'),
            title: exactText(source.title, 'l1-l02 Genki title'),
            relation: 'post-instruction-guided-fill',
            prerequisitePolicy: exactText(delivery.prerequisitePolicy, 'l1-l02 Genki prerequisite policy'),
        },
    };
    return Object.freeze(support);
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function exactText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function nullableText(value: unknown, label: string): string | null {
    return value === null ? null : exactText(value, label);
}

function positiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
    return value;
}

function digest(value: unknown, label: string): string {
    const result = exactText(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
