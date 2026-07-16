export const LESSON_ZERO_KANA_SEQUENCE = Object.freeze([
    { id: 'hira-a', kana: 'あ', romaji: 'a', strokeCount: 3 },
    { id: 'hira-i', kana: 'い', romaji: 'i', strokeCount: 2 },
    { id: 'hira-u', kana: 'う', romaji: 'u', strokeCount: 2 },
    { id: 'hira-e', kana: 'え', romaji: 'e', strokeCount: 2 },
    { id: 'hira-o', kana: 'お', romaji: 'o', strokeCount: 3 },
] as const);

export const LESSON_ZERO_SOURCE_MEDIA = Object.freeze({
    writingSystem: '/academy/content/lessons/lesson-zero/moodle-japanese-writing-system-page-1.png',
    hiraganaARow: '/academy/content/lessons/lesson-zero/moodle-hiragana-a-row-page-1.png',
    genkiGreetings: '/academy/content/lessons/lesson-zero/genki-greetings-page.png',
    genkiGreetingsAudio: '/academy/content/lessons/lesson-zero/genki-k00-g.mp3',
    classroomPhrases: [
        '/academy/content/lessons/lesson-zero/moodle-classroom-phrases-1.png',
        '/academy/content/lessons/lesson-zero/moodle-classroom-phrases-2.png',
    ],
    provenance: '/academy/content/lessons/lesson-zero/provenance.v1.json',
});

export const LESSON_ZERO_SOURCE_PROVENANCE = Object.freeze({
    writingSystemSha256: '0625a8f5d1c0107a8f6706cf76e5c2decd585bd7610793796b9b587025cfa09b',
    hiraganaARowSha256: 'fe962ee2dc21478ffe53a24ba77ef0abb5a7685ab7a6eda8f79ac63817ad7dd6',
    genkiTextbookSha256: '846cc2c9fc4d5310c8e6b3ee711817186239c3810e4433ec350015f32a4004b5',
    genkiAudioSha256: '0d5b8a3e2484aa3d091e7bdf71e84fa731984e3a7a36571bb07abf69715486c0',
    classroomPhrasesSha256: '1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba',
});

export const LESSON_ZERO_CLASSROOM_SOURCE_IDS = Object.freeze(
    Array.from({ length: 14 }, (_, index) => `source-question:classroom-phrase-${String(index + 1).padStart(2, '0')}`),
);
