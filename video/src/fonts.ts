import { continueRender, delayRender, staticFile } from 'remotion';

// Remotion renders each frame in a page that may not have painted the font yet,
// so a font that is merely "requested" can miss the opening frames and ship a
// clip whose first shot is tofu. Block the render until the face is loaded.
//
// One variable face covers 400-900; scripts/fetch-fonts.mjs writes it and
// prints the filename it expects to see here.

const VARIABLE_FACE = 'fonts/noto-sans-jp-variable-subset.woff2';
const WEIGHT_RANGE = '400 900';

export const JP_FAMILY = 'Yomu Video JP';

let loading: Promise<void> | null = null;

export function loadVideoFonts(): Promise<void> {
    if (loading) return loading;
    loading = (async () => {
        const handle = delayRender('Loading the vendored Noto Sans JP subset');
        try {
            const fontFace = new FontFace(
                JP_FAMILY,
                `url(${staticFile(VARIABLE_FACE)}) format('woff2')`,
                { weight: WEIGHT_RANGE, display: 'block' },
            );
            await fontFace.load();
            document.fonts.add(fontFace);
            await document.fonts.ready;
        } finally {
            continueRender(handle);
        }
    })();
    return loading;
}
