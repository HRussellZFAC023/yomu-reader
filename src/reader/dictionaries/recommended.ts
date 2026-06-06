import type { UiCopyKey } from '../i18n';

export type RecommendedDictionaryCategory = 'terms' | 'kanji' | 'frequency';

export interface RecommendedDictionary {
    id: string;
    category: RecommendedDictionaryCategory;
    name: string;
    descriptionKey: UiCopyKey;
    homepage: string;
    downloadUrl: string;
}

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = [
    {
        id: 'jitendex',
        category: 'terms',
        name: 'Jitendex',
        descriptionKey: 'recommendedJitendex',
        homepage: 'https://jitendex.org',
        downloadUrl: 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip',
    },
    {
        id: 'jmdict',
        category: 'terms',
        name: 'JMdict',
        descriptionKey: 'recommendedJmdict',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan#jmdict-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    },
    {
        id: 'jmnedict',
        category: 'terms',
        name: 'JMnedict',
        descriptionKey: 'recommendedJmnedict',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#jmnedict-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip',
    },
    {
        id: 'kanjidic',
        category: 'kanji',
        name: 'KANJIDIC',
        descriptionKey: 'recommendedKanjidic',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#kanjidic-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip',
    },
    {
        id: 'jpdbv2-kana',
        category: 'frequency',
        name: 'JPDBv2㋕',
        descriptionKey: 'recommendedJpdbv2Kana',
        homepage: 'https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#jpdb-v22-frequency',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip',
    },
    {
        id: 'bccwj',
        category: 'frequency',
        name: 'BCCWJ',
        descriptionKey: 'recommendedBccwj',
        homepage: 'https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#bccwj-suw-luw-combined',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip',
    },
    {
        id: 'jiten',
        category: 'frequency',
        name: 'Jiten',
        descriptionKey: 'recommendedJiten',
        homepage: 'https://jiten.moe/other',
        downloadUrl: 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan',
    },
];

export function findRecommendedDictionary(id: string): RecommendedDictionary | undefined {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find(dictionary => dictionary.id === id);
}
