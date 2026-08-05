import { CORE_COLOR_TOKENS } from '../theme/color-tokens';
import { blendRgba, contrastRatio, cssColorToHex, cssColorToRgba, rgbaToHex, type RgbaColor } from '../theme/color-utils';

const TRANSPARENT_DARK_PAGE_FALLBACK = '#181b20';
// Nothing under the word paints a colour we can read, so the only signal left
// is the text: light text means something dark must be behind it. That text has
// to be DECISIVELY light — light enough to be unusable ON white (#ffffff is
// 1.0, #cccccc 1.6, #b3b3b3 2.0; AA body text on white needs 4.5). The old
// test, "closer to white than to black", accepted every grey LIGHTER than about
// #767676 — ordinary muted secondary copy on plainly white pages — which is why
// a minimally styled light page rendered every highlight as a dark block.
const LIGHT_TEXT_MAX_CONTRAST_ON_WHITE = 2;
const OPAQUE_WHITE: RgbaColor = { red: 255, green: 255, blue: 255, alpha: 1 };

export interface PageBackground {
    css: string;
    hex: string;
    rgba: RgbaColor;
}

export interface ProbedPageBackground {
    background: PageBackground;
    // An ancestor paints an image, so colours derived from `background` would
    // be guesses and callers switch to the shadow treatment instead. The
    // background is still resolved: the status wash mixes against it, and
    // leaving that to the stylesheet default means the OS colour scheme -- not
    // the page -- decides how dark every highlight lands.
    imageBackdrop: boolean;
}

// Resolves the EFFECTIVE background behind an element: walk up to the painted
// ancestors, blend them, and when nothing between the element and the document
// root paints a colour, fall back to what the user agent actually paints there
// (white, unless the page opts into a dark canvas). Never returns null — every
// caller needs a colour to mix against.
export function probePageBackground(element: HTMLElement): ProbedPageBackground {
    const ancestors: Element[] = [];
    for (let node = element.parentElement; node; node = node.parentElement) ancestors.push(node);

    let painted = false;
    let imageBackdrop = false;
    let unknownBase = false;
    let rgba: RgbaColor = OPAQUE_WHITE;
    for (const ancestor of ancestors.reverse()) {
        const style = getComputedStyle(ancestor);
        imageBackdrop ||= Boolean(style.backgroundImage && style.backgroundImage !== 'none');
        const color = cssColorToRgba(style.backgroundColor);
        if (!color) {
            // A painted layer we cannot parse: everything blended so far may
            // sit on a surface of unknown darkness. Never let the white seed
            // stand in for it — that painted dark-on-dark "redaction bars" on
            // Discord dark themes whose colors used unhandled formats.
            unknownBase = true;
            continue;
        }
        if (color.alpha <= 0) continue;
        if (color.alpha >= 1) unknownBase = false;
        rgba = blendRgba(color, rgba);
        painted = true;
    }
    if (painted && !unknownBase) return { background: pageBackgroundFromRgba(rgba), imageBackdrop: false };
    return { background: unpaintedBackground(element.parentElement ?? element), imageBackdrop };
}

// Resolves whether the PAGE (not the OS) paints dark: blends the root/body
// backgrounds and falls back to the same canvas resolution transparent word
// backdrops use. Lets theme:'auto' agree with the page's real paint on hosts
// without a theme bridge, where a desktop shell can report
// prefers-color-scheme:light while painting a dark page.
export function documentBackgroundLooksDark(): boolean {
    if (typeof document === 'undefined' || !document.body) return false;
    let rgba: RgbaColor = OPAQUE_WHITE;
    let found = false;
    for (const element of [document.documentElement, document.body]) {
        const color = cssColorToRgba(getComputedStyle(element).backgroundColor);
        if (!color || color.alpha <= 0) continue;
        rgba = blendRgba(color, rgba);
        found = true;
    }
    const background = found ? pageBackgroundFromRgba(rgba) : unpaintedBackground(document.body);
    return contrastRatio(CORE_COLOR_TOKENS.white, background.hex) > contrastRatio(CORE_COLOR_TOKENS.black, background.hex);
}

// Nothing readable is painted beneath the element. Either the chain is genuinely
// transparent — so what the user sees is the user agent's canvas, WHITE unless
// the page opts into a dark one — or something is painted in a format nothing
// could parse (Discord dark themes shipped oklab(), then other spaces, before
// the parsers knew them) or lives outside the walk (a word inside a shadow root
// cannot see the host page's paint). Declared color-scheme decides first, then
// decisively light text; white is the default in every remaining case.
function unpaintedBackground(context: HTMLElement): PageBackground {
    if (darkColorSchemeCanvas(context)) return pageBackgroundFromCss(TRANSPARENT_DARK_PAGE_FALLBACK);
    // The element's own context colour first: a dark embedded shell on a light
    // page has light LOCAL text while body/root still read as a light theme.
    // Nearest-wins, not "any of parent/body/root is light" — that let a light
    // colour declared page-wide overrule the word's own line.
    const text = nearestParsedTextColor(context);
    return text && contrastRatio(text, CORE_COLOR_TOKENS.white) < LIGHT_TEXT_MAX_CONTRAST_ON_WHITE
        ? pageBackgroundFromCss(TRANSPARENT_DARK_PAGE_FALLBACK)
        : pageBackgroundFromCss(CORE_COLOR_TOKENS.white);
}

function nearestParsedTextColor(context: HTMLElement): string | null {
    for (const scope of [context, document.body, document.documentElement]) {
        if (!scope) continue;
        const hex = cssColorToHex(getComputedStyle(scope).color);
        if (hex) return hex;
    }
    return null;
}

// `color-scheme` inherits, so the nearest scope that declares one already
// carries the page's choice; keep walking outward past `normal`/unset.
function darkColorSchemeCanvas(context: HTMLElement): boolean {
    for (const scope of [context, document.body, document.documentElement]) {
        if (!scope) continue;
        const tokens = new Set(getComputedStyle(scope).colorScheme.toLowerCase().split(/\s+/).filter(Boolean));
        if (!tokens.has('dark')) {
            if (tokens.has('light')) return false;
            continue;
        }
        // `color-scheme: light dark` is the recommended opt-in and means
        // "either canvas is fine, the UA decides" — the overwhelmingly common
        // declaration on modern sites. Reading the bare presence of the `dark`
        // token as a dark canvas painted every one of those pages' highlights
        // dark for readers whose device was in light mode, and vice versa.
        if (tokens.has('light')) return prefersDarkColorScheme();
        return true;
    }
    return false;
}

function prefersDarkColorScheme(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

function pageBackgroundFromCss(color: string): PageBackground {
    return pageBackgroundFromRgba(cssColorToRgba(color) ?? OPAQUE_WHITE);
}

function pageBackgroundFromRgba(rgba: RgbaColor): PageBackground {
    const hex = rgbaToHex(rgba);
    return { css: `rgb(${rgba.red}, ${rgba.green}, ${rgba.blue})`, hex, rgba };
}
