// The field list a Yomu-managed Anki note type carries. This is the single
// definition: the companion creates and updates note types from it, and the
// settings panel compares a live note type against it.
//
// Adding a field here leaves every note type made by an earlier release one
// field short — Yomu mines the data but Anki has nowhere to put it. That gap
// is what missingYomuModelFields reports, so the settings panel can offer to
// add the fields instead of the user finding out from a silent empty card.
export const YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
    'Audio',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

// Fields this Yomu writes that the given note type has no home for yet, in
// note-type order. Empty once the note type matches, which is what keeps the
// settings offer from reappearing after the user accepts it.
export function missingYomuModelFields(fieldNames: string[]): string[] {
    const present = new Set(fieldNames);
    return YOMU_MODEL_FIELDS.filter(fieldName => !present.has(fieldName));
}
