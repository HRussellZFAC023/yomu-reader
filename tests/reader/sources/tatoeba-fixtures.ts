/**
 * Recorded `api.tatoeba.org/v1/sentences` payloads, captured live on 2026-07-29
 * and 2026-07-30 with `include=audios`. Field names, null `script`, the
 * `is_direct` flag and the audio licence strings are exactly as the API sent
 * them, so a shape change upstream shows up as a fixture mismatch rather than as
 * an empty popover.
 */

/** Spanish target, English output. One row has a CC BY-NC-ND recording. */
export const TATOEBA_SPANISH_PAYLOAD = {
    data: [
        {
            id: 13227432,
            text: '¡Agua!',
            lang: 'spa',
            script: null,
            license: 'CC BY 2.0 FR',
            owner: 'jan_Junipa',
            is_unapproved: false,
            audios: [],
            translations: [
                {
                    id: 10733816,
                    text: 'Water!',
                    lang: 'eng',
                    script: null,
                    license: 'CC BY 2.0 FR',
                    owner: 'frzzl',
                    is_unapproved: false,
                    is_direct: true,
                    audios: [],
                },
            ],
        },
        {
            id: 6711501,
            text: 'El agua se evapora.',
            lang: 'spa',
            script: null,
            license: 'CC BY 2.0 FR',
            owner: 'arh',
            is_unapproved: false,
            audios: [
                {
                    id: 430190,
                    created: '2018-03-04T06:10:17+00:00',
                    author: 'arh',
                    license: 'CC BY-NC-ND 3.0',
                    attribution_url: 'https://tatoeba.org/user/profile/arh',
                    download_url: 'https://api.tatoeba.org/v1/audio/430190/file',
                    modified: '2018-03-04T06:10:17+00:00',
                },
            ],
            translations: [
                {
                    id: 10861348,
                    text: 'Water evaporates.',
                    lang: 'eng',
                    script: null,
                    license: 'CC BY 2.0 FR',
                    owner: 'Amastan',
                    is_unapproved: false,
                    is_direct: false,
                    audios: [],
                },
            ],
        },
    ],
    paging: { total: 1617, has_next: true },
};

/** Thai target: the one sampled licence family the allowlist accepts. */
export const TATOEBA_THAI_PAYLOAD = {
    data: [
        {
            id: 7878987,
            text: 'มันคืออะไร?',
            lang: 'tha',
            script: null,
            license: 'CC BY 2.0 FR',
            owner: 'pastelite',
            is_unapproved: false,
            audios: [
                {
                    id: 987383,
                    created: '2022-01-26T07:49:24+00:00',
                    author: 'TonySpeaks',
                    license: 'CC BY 4.0',
                    attribution_url: 'https://tatoeba.org/user/profile/TonySpeaks',
                    download_url: 'https://api.tatoeba.org/v1/audio/987383/file',
                    modified: '2022-01-26T07:49:24+00:00',
                },
            ],
            translations: [
                {
                    id: 42849,
                    text: 'What is it?',
                    lang: 'eng',
                    script: null,
                    license: 'CC BY 2.0 FR',
                    owner: 'brauliobezerra',
                    is_unapproved: false,
                    is_direct: true,
                    audios: [],
                },
            ],
        },
    ],
    paging: { total: 1, has_next: false },
};

export const TATOEBA_EMPTY_PAYLOAD = { data: [], paging: { total: 0, has_next: false } };

/** Serbo-Croatian: one row per code, so provenance has to survive the merge. */
export const TATOEBA_SERBO_CROATIAN_PAYLOADS: Readonly<Record<string, unknown>> = {
    srp: {
        data: [{ id: 1, text: 'Voda je dobra.', lang: 'srp', script: null, license: 'CC BY 2.0 FR', owner: 'a', is_unapproved: false, audios: [], translations: [] }],
        paging: { total: 1, has_next: false },
    },
    hrv: {
        data: [{ id: 2, text: 'Voda je hladna.', lang: 'hrv', script: null, license: 'CC BY 2.0 FR', owner: 'b', is_unapproved: false, audios: [], translations: [] }],
        paging: { total: 1, has_next: false },
    },
    bos: {
        data: [{ id: 3, text: 'Voda je bistra.', lang: 'bos', script: null, license: 'CC BY 2.0 FR', owner: 'c', is_unapproved: false, audios: [], translations: [] }],
        paging: { total: 1, has_next: false },
    },
};
