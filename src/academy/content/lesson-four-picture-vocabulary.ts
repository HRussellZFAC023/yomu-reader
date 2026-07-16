import lessonPackage from '../../../public/academy/content/lessons/005-l1-l04.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { PictureVocabularyBoardModel, PictureVocabularyItem } from '../minigames/picture-vocabulary-board';

const PACKAGE_ID = 'l1-l04';
const MODULE_ID = 5822243;
const PICTURE_SHA256 = '37dc9a453a0dfe5a42ac8f6f29e07136266aeca503aa1edd7a669091e2b9e524';
const VOCABULARY_SHA256 = 'a267243216a4c999d8733ed6febeeed938c47b593f0d1841b1dc8c244f37b253';
const SOURCE_IMAGE_SHA256 = '535b1b844e63c0a7a347f0a1756c354c672eeaaca881a3704009db7ba9a2710b';
const GENKI_PAYLOAD_SHA256 = '69eb24f468086afac22f58fbac149c4765026d38477926417f42835e0dfa9b53';

const SOURCE_ROWS = [
    ['book', '1）ほん', 'ほん', ['ほん', 'じしょ', 'ざっし']],
    ['dictionary', '2）じしょ', 'じしょ', ['じしょ', 'ほん', 'しんぶん']],
    ['magazine', '3）ざっし', 'ざっし', ['ざっし', 'ノート', 'カード']],
    ['newspaper', '4）しんぶん', 'しんぶん', ['しんぶん', 'ざっし', 'ほん']],
    ['notebook', '5）ノート', 'ノート', ['ノート', 'てちょう', 'かばん']],
    ['diary', '6）てちょう', 'てちょう', ['てちょう', 'ノート', 'さいふ']],
    ['business-card', '7）めいし', 'めいし', ['めいし', 'カード', 'かぎ']],
    ['card', '8）カード', 'カード', ['カード', 'めいし', 'かさ']],
] as const;

export function createLessonFourPictureVocabularyModel(): PictureVocabularyBoardModel {
    const sourceRows = exactVocabularyRows();
    const items: readonly PictureVocabularyItem[] = Object.freeze(SOURCE_ROWS.map(([id, expected, label, choices], index) => {
        const sourceRow = sourceRows[index];
        if (sourceRow !== expected) throw new TypeError(`Unexpected Lesson 4 vocabulary row ${index + 1}.`);
        return Object.freeze({
            id,
            sourceOrder: index + 1,
            sourceQuestionId: `moodle:5822243:chapter-2-picture-vocabulary:p1:picture-${index + 1}`,
            sourceRow,
            prompt: { ja: `絵 ${index + 1}`, en: `Picture ${index + 1}` },
            options: choices.map(choice => ({ id: choice, label: choice })),
            correctOptionId: label,
            conceptId: `concept:l1-l04:picture-vocabulary:${id}`,
            errorTag: `l1-l04-picture-vocabulary-${id}`,
        });
    }));
    assertExactSources();
    const model: PictureVocabularyBoardModel = {
        id: 'activity:l1-l04-source-picture-vocabulary',
        kind: 'academy-picture-vocabulary-board',
        responseKind: 'source-picture-vocabulary-select',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: items.map(item => item.conceptId),
        prompt: {
            ja: '先生の絵と単語帳の番号を見て、ものの名前を選びましょう。',
            en: 'Use the teacher picture page and numbered vocabulary rows to identify the objects.',
        },
        provenance: {
            packageId: 'l1-l04',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                pictureHandout: {
                    sourceId: `moodle-payload:${PICTURE_SHA256}`,
                    payloadSha256: PICTURE_SHA256,
                    title: 'Chapter 2 pics for vocabulary',
                    locus: { page: 1, pictureNumbers: [1, 2, 3, 4, 5, 6, 7, 8] },
                },
                vocabularySheet: {
                    sourceId: `moodle-vocabulary:${MODULE_ID}:${VOCABULARY_SHA256}`,
                    payloadSha256: VOCABULARY_SHA256,
                    title: 'Chapter 2-1 Vocabulary Sheet',
                    rows: [1, 2, 3, 4, 5, 6, 7, 8],
                },
                sourceImage: {
                    url: '/academy/content/lessons/l1-l04/moodle-chapter-2-pics-for-vocabulary-page-1.png',
                    sha256: SOURCE_IMAGE_SHA256,
                    alt: {
                        ja: 'Chapter 2 pictures for new vocabularyのページ。番号1から25まで、ほん、じしょ、ざっし、しんぶんなどの物の絵がある。',
                        en: 'Chapter 2 pictures for new vocabulary page with numbered drawings 1 through 25, including a book, dictionary, magazine, newspaper, and other objects.',
                    },
                },
            },
            support: {
                phase: 'after-moodle-picture-vocabulary',
                minna: { reference: 'Minna no Nihongo I · Lessons 1–2', reuse: 'sequence-only' },
                genki: {
                    sourceId: `japanese-genki-interactive:${GENKI_PAYLOAD_SHA256}:generateQuiz`,
                    relation: 'post-instruction-guided-fill',
                },
            },
        },
        payload: {
            teaching: [{
                title: { ja: '番号と先生の単語帳を合わせる', en: 'Match the picture number to the teacher row' },
                instruction: {
                    ja: '絵の丸数字と、先生の単語帳の同じ番号を先に確認します。八つの行を声に出してから、下の絵番号を選びます。',
                    en: 'First connect the circled number in the picture page with the same number in the teacher vocabulary sheet. Read the eight rows, then identify the numbered pictures below.',
                },
                items,
            }],
            sourceCaption: {
                ja: '先生の原資料: Chapter 2 pictures for new vocabulary、1ページ目。ここでは絵1から8と、Chapter 2-1 Vocabulary Sheetの行1から8を使います。',
                en: 'Teacher source: Chapter 2 pictures for new vocabulary, page 1. This slice uses pictures 1 through 8 with rows 1 through 8 of the Chapter 2-1 Vocabulary Sheet.',
            },
            items,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '八つの絵番号が、先生の単語帳の行と合いました。',
                        en: 'All eight picture numbers match the teacher vocabulary rows.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '絵番号と単語帳の行が合っていないものがあります。',
                        en: 'At least one picture number does not match its vocabulary row.',
                    },
                    repairPrompt: {
                        ja: '丸数字を見直し、その同じ番号の先生の行だけ確認しましょう。',
                        en: 'Recheck the circled picture number, then look only at that same numbered teacher row.',
                    },
                    nearbyExample: {
                        ja: '絵1は、先生の単語帳の「1）ほん」です。',
                        en: 'Picture 1 is row 1, ほん, in the teacher vocabulary sheet.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

function exactVocabularyRows(): readonly string[] {
    const root = record(lessonPackage, 'l1-l04 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l04 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l04 package identity.');
    }
    const vocabulary = array(root.components, 'l1-l04 components').map((value, index) => record(value, `l1-l04 component ${index}`))
        .filter(component => record(component.provenance, 'l1-l04 vocabulary provenance').payloadSha256 === VOCABULARY_SHA256);
    if (vocabulary.length !== 1) throw new TypeError('Expected one exact l1-l04 vocabulary component.');
    const items = array(vocabulary[0].items, 'l1-l04 vocabulary items');
    return items.slice(0, 8).map((value, index) => {
        const item = record(value, `l1-l04 vocabulary item ${index + 1}`);
        const source = record(item.source, `l1-l04 vocabulary source ${index + 1}`);
        const locus = record(source.locus, `l1-l04 vocabulary locus ${index + 1}`);
        if (locus.page !== 1 || locus.row !== index + 1) throw new TypeError('The first eight picture rows must retain source order.');
        return exactText(record(source.exact, `l1-l04 vocabulary exact ${index + 1}`).words, `l1-l04 row ${index + 1}`);
    });
}

function assertExactSources(): void {
    const root = record(lessonPackage, 'l1-l04 package');
    const members = array(record(root.sourceCoverage, 'l1-l04 coverage').members, 'l1-l04 members')
        .map((value, index) => record(value, `l1-l04 member ${index}`));
    for (const [payloadSha256, title] of [
        [PICTURE_SHA256, 'Chapter 2 pics for vocabulary'],
        [VOCABULARY_SHA256, 'Chapter 2-1 Vocabulary Sheet'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (matches.length !== 1 || exactText(matches[0].title, `${payloadSha256} title`) !== title) {
            throw new TypeError(`Expected one exact l1-l04 source member for ${payloadSha256}.`);
        }
    }
    const provenance = record(root.provenance, 'l1-l04 provenance');
    const minna = array(provenance.sourceMappings, 'l1-l04 mappings').map((value, index) => record(value, `l1-l04 mapping ${index}`))
        .filter(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (minna.length !== 1 || exactText(minna[0].reference, 'l1-l04 Minna reference') !== 'Minna no Nihongo I · Lessons 1–2'
        || exactText(minna[0].reuse, 'l1-l04 Minna reuse') !== 'sequence-only') {
        throw new TypeError('Expected mapped Minna sequence support.');
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l04 Genki activities').map((value, index) => record(value, `l1-l04 Genki activity ${index}`));
    const genki = activities.filter(activity => activity.id === 'genki-2e:l1-l04:lesson-2-workbook-2');
    if (genki.length !== 1 || exactText(genki[0].relation, 'l1-l04 Genki relation') !== 'post-instruction-guided-fill'
        || record(genki[0].source, 'l1-l04 Genki source').payloadSha256 !== GENKI_PAYLOAD_SHA256) {
        throw new TypeError('Expected mapped Genki post-instruction support.');
    }
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
