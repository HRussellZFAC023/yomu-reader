export function createJitenStudyBatchCard(overrides = {}) {
    return {
        cardId: 9001,
        wordId: 42,
        readingIndex: 2,
        state: 2,
        isNewCard: false,
        wordText: '日本語[にほんご]',
        wordTextPlain: '日本語',
        readings: [{ text: 'にほんご', rubyText: '日本語[にほんご]', readingIndex: 2, formType: 0 }],
        definitions: [{ index: 0, meanings: ['Japanese language'], partsOfSpeech: ['n'] }],
        partsOfSpeech: ['n'],
        pitchAccents: [0],
        frequencyRank: 123,
        exampleSentence: { text: '日本語を読む。' },
        ...overrides,
    };
}
