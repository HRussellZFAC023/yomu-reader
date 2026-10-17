export type CharacterClass = 'han' | 'hiragana' | 'smallHiragana' | 'katakana' | 'smallKatakana' | 'fullwidth' | 'upper' | 'lower';
export type LetterStreams = Record<CharacterClass, string>;

export const CHARACTER_CLASS_RULES: ReadonlyArray<readonly [string, CharacterClass | null]>;
export function characterClass(char: string): CharacterClass | null;
export function aozoraLetterStreams(aozoraText: string, latin?: string): LetterStreams;
export function createTextRedactor(options: { streams: LetterStreams; avoidRuns?: string[] }): (text: string) => string;
export function redactTextSlotsInPage(options: { streams: LetterStreams; rules: ReadonlyArray<readonly [string, string | null]>; avoidRuns?: string[]; maxScan?: number; retries?: number }): string[];
