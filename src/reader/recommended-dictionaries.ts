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
        id: 'jmdict',
        category: 'terms',
        name: 'JMdict',
        description: 'Starter Japanese-English dictionary maintained by EDRDG and packaged for Yomitan. よむ downloads this automatically when dictionary words are needed and no local dictionary is installed.',
        homepage: 'https://github.com/yomidevs/jmdict-yomitan#jmdict-for-yomitan',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    },
];

export const STARTER_DICTIONARY_IDS = ['jmdict'];

export function findRecommendedDictionary(id: string): RecommendedDictionary | undefined {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find(dictionary => dictionary.id === id);
}
