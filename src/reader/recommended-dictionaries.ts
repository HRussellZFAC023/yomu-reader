export type RecommendedDictionaryCategory = 'terms' | 'kanji' | 'frequency';

export interface RecommendedDictionary {
    id: string;
    category: RecommendedDictionaryCategory;
    name: string;
    description: string;
    homepage: string;
    downloadUrl: string;
}

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = [
    {
        id: 'jitendex',
        category: 'terms',
        name: 'Jitendex',
        description: 'Japanese to English dictionary with examples, usage notes, etymology, cross references, and definition notes.',
        homepage: 'https://jitendex.org',
        downloadUrl: 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip',
    },
    {
        id: 'jmdict',
        category: 'terms',
        name: 'JMdict',
        description: 'Starter Japanese-English dictionary maintained by EDRDG and packaged for Yomitan. Add this when you want local dictionary-backed study words.',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan#jmdict-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    },
    {
        id: 'jmnedict',
        category: 'terms',
        name: 'JMnedict',
        description: 'Japanese proper names maintained by the Electronic Dictionary Research and Development Group.',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#jmnedict-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip',
    },
    {
        id: 'kanjidic',
        category: 'kanji',
        name: 'KANJIDIC',
        description: 'Kanji readings, meanings, stroke data, grade level, JLPT level, and frequency.',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#kanjidic-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip',
    },
    {
        id: 'jpdbv2-kana',
        category: 'frequency',
        name: 'JPDBv2㋕',
        description: 'Frequency data based on the JPDB corpus. よむ shows this first when sorting local frequency chips.',
        homepage: 'https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#jpdb-v22-frequency',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip',
    },
    {
        id: 'bccwj',
        category: 'frequency',
        name: 'BCCWJ',
        description: 'Frequency data from the Balanced Corpus of Contemporary Written Japanese.',
        homepage: 'https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#bccwj-suw-luw-combined',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip',
    },
    {
        id: 'jiten',
        category: 'frequency',
        name: 'Jiten',
        description: 'Frequency data from the media stats database at jiten.moe.',
        homepage: 'https://jiten.moe/other',
        downloadUrl: 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan',
    },
];

export const STARTER_DICTIONARY_IDS = ['jmdict'];

export function findRecommendedDictionary(id: string): RecommendedDictionary | undefined {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find(dictionary => dictionary.id === id);
}
