const POS_LABELS: Record<string, string> = {
    adj: 'adjective',
    adv: 'adverb',
    aux: 'auxiliary',
    "aux-v": 'auxiliary verb',
    conj: 'conjunction',
    cop: 'copula',
    ctr: 'counter',
    exp: 'expression',
    int: 'interjection',
    n: 'noun',
    num: 'number',
    pn: 'pronoun',
    pref: 'prefix',
    prt: 'particle',
    suf: 'suffix',
    unc: 'unclassified',
    vi: 'intransitive verb',
    vt: 'transitive verb',
    v1: 'ichidan verb',
    v5: 'godan verb',
    v5aru: 'aru ending',
    v5b: 'bu ending',
    v5g: 'gu ending',
    v5k: 'ku ending',
    v5m: 'mu ending',
    v5n: 'nu ending',
    v5r: 'ru ending',
    v5s: 'su ending',
    v5t: 'tsu ending',
    v5u: 'u ending',
    vk: 'kuru verb',
    vs: 'suru verb',
    vz: 'zuru verb',
};

export function formatPartOfSpeech(tags: string[] = []): string {
    const labels = tags.map(tag => POS_LABELS[tag.toLowerCase()] ?? tag).filter(Boolean);
    return [...new Set(labels)].join(', ');
}

export function formatPartOfSpeechDetails(tags: string[] = []): string {
    return tags.length ? tags.join(', ').toUpperCase() : '';
}
