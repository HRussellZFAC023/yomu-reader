/** Only Yomu-created inline shells: never the host label, ruby, or readings. */
export const ANNOTATION_BOX_SELECTOR = '.jpdb-reader-word,.jpdb-reader-ruby-base,.jpdb-reader-run';

// These nodes never receive runtime box styles. Chrome, mirrors, projected
// readings and OCR frames do, so these properties cannot be armoured globally.
export const ANNOTATION_BOX_RESETS: Readonly<Record<string, string>> = {
    padding: '0',
    margin: '0',
    border: '0',
    float: 'none',
    width: 'auto',
    height: 'auto',
    // A run replaces an anonymous flex/grid item, whose automatic minimum
    // keeps its text from shrinking into the following item.
    'min-width': 'auto',
    'min-height': 'auto',
    'max-width': 'none',
    'max-height': 'none',
    'background-image': 'none',
    'box-shadow': 'none',
    'text-indent': '0',
};

/** Shorthand resets also cover their longhands, including logical edges. */
export function isAnnotationBoxProperty(property: string): boolean {
    return property in ANNOTATION_BOX_RESETS || /^(?:padding|margin|border)-/u.test(property);
}

// Runs inherit the host's first-line indent; only words/bases reset it.
export const ANNOTATION_BOX_ARMOUR = `${ANNOTATION_BOX_SELECTOR}{${Object.entries(ANNOTATION_BOX_RESETS)
    .map(([property, value]) => `${property}:${value}!important`).join(';')}}
.jpdb-reader-run{display:inline!important;text-indent:inherit!important}`;
