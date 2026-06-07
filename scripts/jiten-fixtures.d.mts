export interface JitenStudyBatchCardFixture {
    cardId: number;
    wordId: number;
    readingIndex: number;
    state: number;
    isNewCard: boolean;
    wordText: string;
    wordTextPlain: string;
    readings: Array<{ text: string; rubyText: string; readingIndex: number; formType: number }>;
    definitions: Array<{ index: number; meanings: string[]; partsOfSpeech: string[] }>;
    partsOfSpeech: string[];
    pitchAccents: number[];
    frequencyRank: number;
    exampleSentence: { text: string };
    [key: string]: unknown;
}

export function createJitenStudyBatchCard(overrides?: Partial<JitenStudyBatchCardFixture>): JitenStudyBatchCardFixture;
