import type { LearnerLanguageId } from '../../locales/types';

/**
 * The measured Tatoeba coverage matrix for the 32 configured languages.
 *
 * `sentenceAudioRows` is a live Tatoeba audio-index snapshot taken 2026-07-29.
 * It counts rows that *have* an audio recording, not rows Yomu may ship: the
 * licence is chosen per file by the contributor, and the sampled distribution
 * refuses most of them (see `licence.ts`). A zero here means no open sentence
 * audio was found for the language at all, which is a different and more
 * permanent fact than "this page happened to contain none".
 *
 * `limitedCorpus` marks a corpus where an empty result is the normal case.
 * Lao has 229 sentences in total and Khmer about 2,500; without the badge a
 * learner reads a blank panel as a broken product.
 *
 * `codes` holds Tatoeba's ISO 639-3 identifiers. Three of these are deliberate
 * decisions rather than lookups:
 *   - `zh` maps to `cmn` only. Tatoeba has no "Chinese"; claiming one would
 *     quietly serve Mandarin to a learner who chose a different variety.
 *   - `fa` maps to `pes` (Western Persian), which is the code Tatoeba uses.
 *   - `sh` fans out to `srp`, `hrv` and `bos`. The three are queried separately
 *     and each result keeps its own language tag, because collapsing them would
 *     lose the provenance the plan requires.
 */
export interface TatoebaLanguageCoverage {
    readonly codes: readonly string[];
    readonly sentenceAudioRows: number;
    readonly limitedCorpus?: true;
    /**
     * Set when the recording exists but calling it a native-speaker sample
     * would be false. Latin audio is a modern contributor reading a dead
     * language; the quality flag has to say so.
     */
    readonly audioIsReconstruction?: true;
}

export const TATOEBA_COVERAGE: Readonly<Record<LearnerLanguageId, TatoebaLanguageCoverage>> = Object.freeze({
    sq: { codes: ['sqi'], sentenceAudioRows: 0, limitedCorpus: true },
    grc: { codes: ['grc'], sentenceAudioRows: 0, limitedCorpus: true },
    ar: { codes: ['ara'], sentenceAudioRows: 483 },
    yue: { codes: ['yue'], sentenceAudioRows: 1_784 },
    zh: { codes: ['cmn'], sentenceAudioRows: 5_827 },
    da: { codes: ['dan'], sentenceAudioRows: 0 },
    nl: { codes: ['nld'], sentenceAudioRows: 9_038 },
    en: { codes: ['eng'], sentenceAudioRows: 849_774 },
    fi: { codes: ['fin'], sentenceAudioRows: 4_253 },
    fr: { codes: ['fra'], sentenceAudioRows: 9_833 },
    de: { codes: ['deu'], sentenceAudioRows: 32_938 },
    el: { codes: ['ell'], sentenceAudioRows: 0 },
    hu: { codes: ['hun'], sentenceAudioRows: 6_914 },
    id: { codes: ['ind'], sentenceAudioRows: 1_754 },
    it: { codes: ['ita'], sentenceAudioRows: 1_591 },
    km: { codes: ['khm'], sentenceAudioRows: 0, limitedCorpus: true },
    ko: { codes: ['kor'], sentenceAudioRows: 0 },
    lo: { codes: ['lao'], sentenceAudioRows: 0, limitedCorpus: true },
    la: { codes: ['lat'], sentenceAudioRows: 1_064, audioIsReconstruction: true },
    mn: { codes: ['mon'], sentenceAudioRows: 0, limitedCorpus: true },
    fa: { codes: ['pes'], sentenceAudioRows: 0 },
    pl: { codes: ['pol'], sentenceAudioRows: 5_618 },
    pt: { codes: ['por'], sentenceAudioRows: 20_957 },
    ro: { codes: ['ron'], sentenceAudioRows: 52 },
    ru: { codes: ['rus'], sentenceAudioRows: 10_652 },
    sh: { codes: ['srp', 'hrv', 'bos'], sentenceAudioRows: 0 },
    es: { codes: ['spa'], sentenceAudioRows: 119_430 },
    sv: { codes: ['swe'], sentenceAudioRows: 206 },
    tl: { codes: ['tgl'], sentenceAudioRows: 0 },
    th: { codes: ['tha'], sentenceAudioRows: 722 },
    tr: { codes: ['tur'], sentenceAudioRows: 1_141 },
    vi: { codes: ['vie'], sentenceAudioRows: 0 },
});

/**
 * Translation-only codes. Japanese is a valid OUTPUT for a learner reading
 * Spanish, so `jpn` has to be requestable even though the Japanese TARGET is
 * served by ImmersionKit and never by this adapter.
 */
const TRANSLATION_ONLY_CODES: Readonly<Record<string, string>> = Object.freeze({
    ja: 'jpn',
    he: 'heb',
    uk: 'ukr',
    cs: 'ces',
    nb: 'nob',
    no: 'nob',
    hi: 'hin',
    bn: 'ben',
    ta: 'tam',
    ur: 'urd',
});

/**
 * The twelve configured languages with no open sentence audio source. Derived
 * from the matrix rather than written twice, so a future snapshot cannot leave
 * the UI claiming audio the data no longer has.
 */
export function languagesWithoutSentenceAudio(): readonly LearnerLanguageId[] {
    return (Object.keys(TATOEBA_COVERAGE) as LearnerLanguageId[])
        .filter(id => TATOEBA_COVERAGE[id].sentenceAudioRows === 0);
}

export function limitedCorpusLanguages(): readonly LearnerLanguageId[] {
    return (Object.keys(TATOEBA_COVERAGE) as LearnerLanguageId[])
        .filter(id => TATOEBA_COVERAGE[id].limitedCorpus === true);
}

/** Tatoeba codes for an OUTPUT language, used for the translation filter. */
export function tatoebaTranslationCode(outputLanguage: string): string | null {
    const base = outputLanguage.trim().toLowerCase().split(/[-_]/u)[0] ?? '';
    if (!base) return null;
    const configured = TATOEBA_COVERAGE[base as LearnerLanguageId];
    // Serbo-Croatian has three codes and no single translation filter value, so
    // an output request pins Serbian rather than inventing an aggregate.
    if (configured) return configured.codes[0] ?? null;
    return TRANSLATION_ONLY_CODES[base] ?? null;
}
