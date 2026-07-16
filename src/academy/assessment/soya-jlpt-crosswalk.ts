import type { JlptBand } from '../domain/learner-record';
import type { PlacementItem, ReceptivePlacementSkill } from '../placement/orientation';

export interface SoyaJlptSourceRecord {
    readonly id: string;
    readonly snapshotRoot: 'references/soya-research/extracted-src-all';
    readonly relativePath: string;
    readonly sha256: string;
    readonly band: JlptBand;
    readonly itemReferenceIds: readonly string[];
}

export interface SoyaJlptPackagedAudioRecord {
    readonly itemReferenceId: string;
    readonly locator: string;
    readonly sha256: string;
}

export interface SoyaJlptAudioQuarantineRecord {
    readonly itemReferenceId: string;
    readonly band: JlptBand;
    readonly reason: 'source-recording-not-packaged';
    readonly permittedRuntimeFallback: 'exact-transcript-browser-speech';
}

export interface JapaneseLibraryJlptQuarantineRecord {
    readonly id: string;
    readonly band: 'n3' | 'n2' | 'n1';
    readonly sourceScope: 'japanese-library';
    readonly kind: 'listening-family';
    readonly state: 'quarantined';
    readonly gaps: readonly [
        'rights-review-required',
        'item-region-unverified',
        'transcript-audio-pairing-unverified',
    ];
}

export const SOYA_JLPT_ASSESSMENT_SOURCE_POLICY = Object.freeze({
    sourceScope: 'soya-research' as const,
    corpusRole: 'enrichment' as const,
    answerGate: 'after-attempt' as const,
    sequenceAuthority: null,
    mayAdvanceMoodleChronology: false,
});

export const SOYA_JLPT_SOURCE_CROSSWALK: readonly SoyaJlptSourceRecord[] = [
    source('n5-vocabulary', 'n5', 'data/courses/jlpt_n5/mock1_vocab.js', '2ce50c3d647c3f2922d0664e3c52cf764ce56aa4fca2b685b0fa6089af08fee8', ['n5_mock1_v_01']),
    source('n5-grammar-reading', 'n5', 'data/courses/jlpt_n5/mock1_grammar_reading.js', '6a09b05f90b6894f2f1383f2a135a8cf9f6f0c50c9346811e532601c0f239723', ['n5_mock1_gr_01', 'n5_mock1_gr_27', 'n5_mock1_gr_28']),
    source('n5-listening', 'n5', 'data/courses/jlpt_n5/mock1_listening.js', 'cb767000df4ba433346cb1d9310d1efaa542e908bc256d84d902ca649dbd2412', ['n5_mock1_l_04', 'n5_mock1_l_11']),
    source('n4-vocabulary', 'n4', 'data/courses/jlpt_n4/mock1_vocab.js', '8a9032265632957d63ffebc3ff4b112dc8053ea0e2b2fb3ea089d941ea728433', ['n4_mock1_v_01']),
    source('n4-grammar-reading', 'n4', 'data/courses/jlpt_n4/mock1_grammar_reading.js', 'f297d12c00c502f3de3c313b6ae80a54caa875f5d34d2ea583ef44a01fc4fcc8', ['n4_mock1_gr_01', 'n4_mock1_gr_26', 'n4_mock1_gr_27']),
    source('n4-listening', 'n4', 'data/courses/jlpt_n4/mock1_listening.js', '28e86cd5bc7f2914f88fe85dedee6039cc01ab159f85bb8f1339500e029a8753', ['n4_mock1_l_07', 'n4_mock1_l_10']),
    source('n3-vocabulary', 'n3', 'data/courses/jlpt_n3/mock1_vocab.js', 'd63e939f1c8c6e71834ab37d16e66c437a551dbf6812fa6122407daefda127cd', ['mock1_v_01']),
    source('n3-grammar', 'n3', 'data/courses/jlpt_n3/mock1_grammar.js', 'f70938aba899028c5712a2f05fcac54bca4bec5353c5e13bf0f04cb4fb655281', ['mock1_g_01']),
    source('n3-reading', 'n3', 'data/courses/jlpt_n3/mock1_reading.js', 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35', ['mock1_r_02', 'mock1_r_03']),
    source('n3-listening', 'n3', 'data/courses/jlpt_n3/mock1_listening.js', '2c37b6f24b68c60f1abb234157e3428bad5da7690a3d51b11ee2c0b5cb8a6e71', ['mock1_l_05', 'mock1_l_10']),
    source('n2-mock-one', 'n2', 'data/courses/jlpt_n2/mock_test_no1.js', '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5', ['n2_m1_kanji_reading_0_1', 'n2_m1_grammar_form_0_1', 'n2_m1_reading_short_2_1', 'n2_m1_reading_short_2_2', 'n2_m1_listening_point_3_1', 'n2_m1_listening_summary_3_1']),
    source('n1-question-bank', 'n1', 'data/questions_jlpt_n1.js', '323ae01802c200a8353d088f02ca9054c42748b580b585c9cc740cbae2c13dd5', ['n1_p_1', 'n1_k_1', 'n1_r_1', 'n1_r_2', 'n1_l_1', 'n1_l_2']),
];

export const SOYA_JLPT_PACKAGED_AUDIO: readonly SoyaJlptPackagedAudioRecord[] = [
    {
        itemReferenceId: 'n5_mock1_l_04',
        locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_04.mp3',
        sha256: 'da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664',
    },
    {
        itemReferenceId: 'n5_mock1_l_11',
        locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3',
        sha256: '32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8',
    },
];

export const SOYA_JLPT_AUDIO_QUARANTINE: readonly SoyaJlptAudioQuarantineRecord[] = [
    audioQuarantine('n4_mock1_l_07', 'n4'),
    audioQuarantine('n4_mock1_l_10', 'n4'),
    audioQuarantine('mock1_l_05', 'n3'),
    audioQuarantine('mock1_l_10', 'n3'),
    audioQuarantine('n2_m1_listening_point_3_1', 'n2'),
    audioQuarantine('n2_m1_listening_summary_3_1', 'n2'),
];

export const JAPANESE_LIBRARY_JLPT_QUARANTINE: readonly JapaneseLibraryJlptQuarantineRecord[] = [
    japaneseLibraryQuarantine('japanese-library-jlpt-n3-listening-family', 'n3'),
    japaneseLibraryQuarantine('japanese-library-jlpt-n2-listening-family', 'n2'),
    japaneseLibraryQuarantine('japanese-library-jlpt-n1-listening-family', 'n1'),
];

export function sourceRecordForSoyaJlptItem(referenceId: string): SoyaJlptSourceRecord | undefined {
    return SOYA_JLPT_SOURCE_CROSSWALK.find(record => record.itemReferenceIds.includes(referenceId));
}

export function resolveJapaneseLibraryJlptCandidate(
    id: string,
): Readonly<{ status: 'quarantined'; record: JapaneseLibraryJlptQuarantineRecord }> | undefined {
    const record = JAPANESE_LIBRARY_JLPT_QUARANTINE.find(candidate => candidate.id === id);
    return record ? { status: 'quarantined', record } : undefined;
}

export function validateSoyaJlptAssessmentCrosswalk(items: readonly PlacementItem[]): void {
    if (items.length !== 30) throw new TypeError(`Soya JLPT assessment needs 30 items; found ${items.length}.`);
    unique(SOYA_JLPT_SOURCE_CROSSWALK.map(record => record.id), 'source record id');
    unique(SOYA_JLPT_SOURCE_CROSSWALK.map(record => record.relativePath), 'source path');
    unique(SOYA_JLPT_SOURCE_CROSSWALK.flatMap(record => record.itemReferenceIds), 'source item reference');
    unique(SOYA_JLPT_PACKAGED_AUDIO.map(record => record.itemReferenceId), 'packaged audio item');
    unique(SOYA_JLPT_AUDIO_QUARANTINE.map(record => record.itemReferenceId), 'audio quarantine item');
    unique(JAPANESE_LIBRARY_JLPT_QUARANTINE.map(record => record.id), 'Japanese-library quarantine id');

    for (const record of SOYA_JLPT_SOURCE_CROSSWALK) {
        if (!/^[a-f0-9]{64}$/u.test(record.sha256)) throw new TypeError(`Invalid source SHA-256: ${record.id}`);
        if (record.relativePath.startsWith('/') || record.relativePath.split('/').includes('..')) {
            throw new TypeError(`Unsafe Soya source path: ${record.id}`);
        }
    }

    for (const item of items) {
        const record = sourceRecordForSoyaJlptItem(item.referenceId);
        if (!record) throw new TypeError(`Placement item is missing from the Soya crosswalk: ${item.referenceId}`);
        if (record.band !== item.band || record.relativePath !== item.provenance.sourceFile
            || record.sha256 !== item.provenance.sourceFileSha256) {
            throw new TypeError(`Placement provenance does not match the Soya crosswalk: ${item.referenceId}`);
        }
        if (item.provenance.sourceScope !== SOYA_JLPT_ASSESSMENT_SOURCE_POLICY.sourceScope
            || item.provenance.answerGate !== SOYA_JLPT_ASSESSMENT_SOURCE_POLICY.answerGate) {
            throw new TypeError(`Placement source policy mismatch: ${item.referenceId}`);
        }
    }

    const skills: readonly ReceptivePlacementSkill[] = ['language-knowledge', 'reading', 'listening'];
    for (const band of ['n5', 'n4', 'n3', 'n2', 'n1'] as const) {
        const bandItems = items.filter(item => item.band === band);
        if (bandItems.length !== 6) throw new TypeError(`Soya JLPT assessment needs six ${band} items.`);
        for (const skill of skills) {
            if (bandItems.filter(item => item.skill === skill).length !== 2) {
                throw new TypeError(`Soya JLPT assessment needs two ${band} ${skill} items.`);
            }
        }
    }

    for (const audio of SOYA_JLPT_PACKAGED_AUDIO) {
        if (!/^[a-f0-9]{64}$/u.test(audio.sha256)) throw new TypeError(`Invalid audio SHA-256: ${audio.itemReferenceId}`);
        const item = items.find(candidate => candidate.referenceId === audio.itemReferenceId);
        if (!item || item.audio?.runtimeDelivery !== 'packaged-source-recording'
            || item.audio.deliveryLocator !== audio.locator || item.audio.sha256 !== audio.sha256) {
            throw new TypeError(`Packaged audio does not match its placement item: ${audio.itemReferenceId}`);
        }
    }

    const authoredPackagedAudio = items
        .filter(item => item.audio?.runtimeDelivery === 'packaged-source-recording')
        .map(item => item.referenceId)
        .sort();
    if (authoredPackagedAudio.join('\n') !== SOYA_JLPT_PACKAGED_AUDIO.map(record => record.itemReferenceId).sort().join('\n')) {
        throw new TypeError('Packaged placement audio and the Soya JLPT crosswalk have drifted.');
    }

    for (const quarantined of SOYA_JLPT_AUDIO_QUARANTINE) {
        const item = items.find(candidate => candidate.referenceId === quarantined.itemReferenceId);
        if (!item || item.band !== quarantined.band || item.audio?.sourceAvailability !== 'recorded-source'
            || item.audio.runtimeDelivery !== 'browser-speech-synthesis' || item.audio.deliveryLocator) {
            throw new TypeError(`Soya audio quarantine mismatch: ${quarantined.itemReferenceId}`);
        }
    }

    const authoredQuarantinedAudio = items
        .filter(item => item.audio?.sourceAvailability === 'recorded-source'
            && item.audio.runtimeDelivery === 'browser-speech-synthesis')
        .map(item => item.referenceId)
        .sort();
    if (authoredQuarantinedAudio.join('\n') !== SOYA_JLPT_AUDIO_QUARANTINE.map(record => record.itemReferenceId).sort().join('\n')) {
        throw new TypeError('Unpackaged placement audio and the Soya JLPT quarantine have drifted.');
    }
}

function source(
    id: string,
    band: JlptBand,
    relativePath: string,
    sha256: string,
    itemReferenceIds: readonly string[],
): SoyaJlptSourceRecord {
    return {
        id,
        snapshotRoot: 'references/soya-research/extracted-src-all',
        relativePath,
        sha256,
        band,
        itemReferenceIds,
    };
}

function audioQuarantine(itemReferenceId: string, band: JlptBand): SoyaJlptAudioQuarantineRecord {
    return {
        itemReferenceId,
        band,
        reason: 'source-recording-not-packaged',
        permittedRuntimeFallback: 'exact-transcript-browser-speech',
    };
}

function japaneseLibraryQuarantine(
    id: string,
    band: JapaneseLibraryJlptQuarantineRecord['band'],
): JapaneseLibraryJlptQuarantineRecord {
    return {
        id,
        band,
        sourceScope: 'japanese-library',
        kind: 'listening-family',
        state: 'quarantined',
        gaps: ['rights-review-required', 'item-region-unverified', 'transcript-audio-pairing-unverified'],
    };
}

function unique(values: readonly string[], label: string): void {
    if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} in Soya JLPT crosswalk.`);
}
