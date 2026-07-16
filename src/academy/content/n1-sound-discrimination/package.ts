import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import { N1_SOUND_DISCRIMINATION_PACKAGE_ID, N1_SOUND_DISCRIMINATION_PROVENANCE } from './source';
import type {
    N1SoundDiscriminationPackage,
    N1SoundDiscriminationPrerequisite,
    N1SoundDiscriminationReaderSrsProjection,
} from './types';

const PRACTICE_SENTENCES = Object.freeze([
    '企画の費用を再計算しました。',
    '変更の理由を遠慮なく説明してください。',
    '前回の報告を参考に判断します。',
    '提案の内容を要約してください。',
]);

const PREREQUISITES: readonly N1SoundDiscriminationPrerequisite[] = Object.freeze([
    prerequisite('listening:n2-mora-boundaries', '拍を数え、長音と短音を区別できる。', 'Can count morae and distinguish long from short sounds.'),
    prerequisite('listening:n2-context-selection', '文脈に合う語を聞き分けられる。', 'Can select a heard word that fits its sentence context.'),
    prerequisite('reader:n2-audio-transcript-repair', '試行後のスクリプトで聞き違いを修正できる。', 'Can use a post-attempt transcript to repair a listening error.'),
]);

export function createN1SoundDiscriminationPackage(): N1SoundDiscriminationPackage {
    const activity = Object.freeze({
        id: 'activity:n1-sound-discrimination',
        kind: 'academy-n1-sound-discrimination' as const,
        sourceQuestionId: N1_SOUND_DISCRIMINATION_PROVENANCE.sourceId,
        conceptIds: [
            'listening:n1-near-sound-boundaries',
            'listening:n1-mora-and-consonant-cues',
            'listening:n1-contextual-lexical-selection',
            'production:n1-phonetic-noticing',
        ],
        responseKind: 'n1-sound-discrimination-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: '似た音の境界を学んでから、文の中で聞き分けましょう。',
            en: 'Learn the boundaries between near sounds, then retrieve them in context.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: N1_SOUND_DISCRIMINATION_PROVENANCE,
        payload: {
            teaching: [
                teaching('語頭の子音を固定する', 'Anchor the opening consonant', '費用 / 美容', '最初の一拍を先に取り、後ろの長音に引っぱられないようにします。', 'Catch the first mora before the shared long-vowel ending pulls attention away.'),
                teaching('拍の境界を保つ', 'Keep mora boundaries intact', '原料 / 遠慮', '似た母音が続いても、子音が始まる位置を一拍ずつ追います。', 'Track where each consonant begins even when neighboring vowels sound alike.'),
                teaching('文脈は最後の照合に使う', 'Use context as the final check', '参考 / 散歩', '音を先に仮決定し、その後で文脈に合うか確認します。', 'Make a provisional sound decision first, then confirm it against context.'),
            ],
            soundMap: [
                soundPair('hiyou-biyou', '費用', '美容', '語頭の h / b', 'Initial h / b'),
                soundPair('genryou-enryo', '原料', '遠慮', '語頭と拗音の位置', 'Opening sound and contracted mora'),
                soundPair('sankou-sanpo', '参考', '散歩', '語中の k / p', 'Medial k / p'),
                soundPair('naiyou-taiyou', '内容', '太陽', '語頭の n / t', 'Initial n / t'),
            ],
            questions: [
                question('cost', PRACTICE_SENTENCES[0], 'どちらの語が聞こえましたか。', 'Which word did you hear?', 'hiyou', '費用', 'hiyou', 'biyou', '美容', 'biyou', 'opening-h-b'),
                question('reserve', PRACTICE_SENTENCES[1], 'どちらの語が聞こえましたか。', 'Which word did you hear?', 'enryo', '遠慮', 'enryo', 'genryou', '原料', 'genryou', 'mora-boundary'),
                question('reference', PRACTICE_SENTENCES[2], 'どちらの語が聞こえましたか。', 'Which word did you hear?', 'sankou', '参考', 'sankou', 'sanpo', '散歩', 'sanpo', 'medial-consonant'),
                question('content', PRACTICE_SENTENCES[3], 'どちらの語が聞こえましたか。', 'Which word did you hear?', 'naiyou', '内容', 'naiyou', 'taiyou', '太陽', 'taiyou', 'opening-n-t'),
            ],
            production: {
                prompt: { ja: '迷った音の手がかりを一つメモしてください。', en: 'Note one sound cue that made you hesitate.' },
                guidance: { ja: 'この気づきメモは自動採点されません。', en: 'This noticing note is retained but not automatically scored.' },
                fieldLabel: { ja: '未採点の気づきメモ', en: 'Ungraded noticing note' },
                authorship: 'learner-authored-ungraded' as const,
            },
            passScore: 1 as const,
            feedback: {
                pass: { explanation: { ja: '音の境界と文脈を順番に使って、四つの近似音を聞き分けました。', en: 'You used sound boundaries and context in sequence to distinguish all four near-sound targets.' } },
                lapse: {
                    explanation: { ja: '聞き違えた文だけ、スクリプトで語頭と語中の子音を確認しましょう。', en: 'Use the revealed transcript to check the opening and medial consonants only in the missed lines.' },
                    repairPrompt: { ja: '正解語を一拍ずつ区切ってから、もう一度合成音声を聞いてください。', en: 'Segment the target into morae, then replay the synthesized line.' },
                    nearbyExample: { ja: '費・用: 最初の「ひ」を取ってから「よう」を確認します。', en: 'For hiyou, catch hi first and then confirm you.' },
                },
            },
            reviewTargets: [
                review('hiyou', 'listening:n1-near-sound-boundaries', '費用', ['cost; expense'], PRACTICE_SENTENCES[0], ['opening-h-b']),
                review('enryo', 'listening:n1-mora-and-consonant-cues', '遠慮', ['restraint; reserve'], PRACTICE_SENTENCES[1], ['mora-boundary']),
                review('sankou', 'listening:n1-mora-and-consonant-cues', '参考', ['reference; consultation'], PRACTICE_SENTENCES[2], ['medial-consonant']),
                review('naiyou', 'listening:n1-contextual-lexical-selection', '内容', ['content; substance'], PRACTICE_SENTENCES[3], ['opening-n-t']),
            ],
        },
    });
    return Object.freeze({ id: N1_SOUND_DISCRIMINATION_PACKAGE_ID, band: 'N1' as const, prerequisites: PREREQUISITES, activity, readerSrs: readerSrsProjection() });
}

function prerequisite(conceptId: string, ja: string, en: string): N1SoundDiscriminationPrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}
function teaching(ja: string, en: string, cue: string, explanationJa: string, explanationEn: string) {
    return Object.freeze({ title: Object.freeze({ ja, en }), cue, explanation: Object.freeze({ ja: explanationJa, en: explanationEn }) });
}
function soundPair(id: string, left: string, right: string, ja: string, en: string) {
    return Object.freeze({ id, left, right, focus: Object.freeze({ ja, en }) });
}
function question(id: string, playbackText: string, ja: string, en: string, correctId: string, correctJa: string, correctEn: string, distractorId: string, distractorJa: string, distractorEn: string, errorTag: string) {
    return Object.freeze({
        id,
        prompt: Object.freeze({ ja, en }),
        playbackText,
        options: Object.freeze([
            Object.freeze({ id: correctId, label: Object.freeze({ ja: correctJa, en: correctEn }) }),
            Object.freeze({ id: distractorId, label: Object.freeze({ ja: distractorJa, en: distractorEn }) }),
        ]),
        correctOptionId: correctId,
        errorTag,
    });
}
function review(suffix: string, conceptId: string, expression: string, meanings: readonly string[], sentence: string, repairFor: readonly string[]) {
    return Object.freeze({ id: `review:${N1_SOUND_DISCRIMINATION_PACKAGE_ID}:${suffix}`, conceptId, expression, meanings: Object.freeze([...meanings]), sentence, repairFor: Object.freeze([...repairFor]) });
}
function readerSrsProjection(): N1SoundDiscriminationReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze(PRACTICE_SENTENCES.map((_, index) => `reader:${N1_SOUND_DISCRIMINATION_PACKAGE_ID}:transcript:${index + 1}`)),
        miningRequests: Object.freeze(miningRequests()),
    });
}
function miningRequests(): MiningRequest[] {
    return [
        { expression: '費用', sentence: PRACTICE_SENTENCES[0], sourceTitle: 'Yomu original N1 listening practice: sound boundaries', conceptIds: ['listening:n1-near-sound-boundaries', 'listening:n1-contextual-lexical-selection'] },
        { expression: '遠慮なく', sentence: PRACTICE_SENTENCES[1], sourceTitle: 'Yomu original N1 listening practice: sound boundaries', conceptIds: ['listening:n1-mora-and-consonant-cues', 'production:n1-phonetic-noticing'] },
    ];
}
