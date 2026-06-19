import type { UiCopyKey } from '../app/i18n';

export type RecommendedDictionaryCategory = 'terms' | 'kanji' | 'frequency';

export interface RecommendedDictionary {
    id: string;
    category: RecommendedDictionaryCategory;
    name: string;
    descriptionKey: UiCopyKey;
    downloadUrl?: string;
}

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = [
    {
        id: 'jitendex',
        category: 'terms',
        name: 'Jitendex',
        descriptionKey: 'recommendedJitendex',
        downloadUrl: 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip',
    },
    {
        id: 'jmdict',
        category: 'terms',
        name: 'JMdict',
        descriptionKey: 'recommendedJmdict',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    },
    {
        id: 'jmnedict',
        category: 'terms',
        name: 'JMnedict',
        descriptionKey: 'recommendedJmnedict',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip',
    },
    {
        id: 'wty-ja-ja',
        category: 'terms',
        name: 'WTY JA-JA',
        descriptionKey: 'recommendedWtyJapaneseJapanese',
        downloadUrl: 'https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ja/ja/wty-ja-ja.zip',
    },
    {
        id: 'pixiv-light',
        category: 'terms',
        name: 'Pixiv Light',
        descriptionKey: 'recommendedPixivLight',
        downloadUrl: 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip',
    },
    {
        id: 'kanjidic',
        category: 'kanji',
        name: 'KANJIDIC',
        descriptionKey: 'recommendedKanjidic',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip',
    },
    {
        id: 'jpdb-kanji',
        category: 'kanji',
        name: 'JPDB Kanji',
        descriptionKey: 'recommendedJpdbKanji',
        downloadUrl: 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BKanji%5D%20JPDB%20Kanji.zip',
    },
    {
        id: 'jiten',
        category: 'frequency',
        name: 'Jiten',
        descriptionKey: 'recommendedJiten',
        downloadUrl: 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan',
    },
    {
        id: 'jpdbv2-kana',
        category: 'frequency',
        name: 'JPDBv2㋕',
        descriptionKey: 'recommendedJpdbv2Kana',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip',
    },
    {
        id: 'bccwj',
        category: 'frequency',
        name: 'BCCWJ',
        descriptionKey: 'recommendedBccwj',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip',
    },
];

export function findRecommendedDictionary(id: string): RecommendedDictionary | undefined {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find(dictionary => dictionary.id === id);
}
