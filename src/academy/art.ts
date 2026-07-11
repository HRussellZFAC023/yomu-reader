/**
 * Yomu Academy — cozy-pixel SVG art system.
 *
 * Every classmate, item, stamp and coin in the Academy is drawn here as a
 * parametric SVG string. One shared visual language (soft blue-hour palette,
 * chunky rounded forms, flat fills, a warm Ghibli-ish hand) lets ~15 hobby
 * driven students read as individuals while looking like one game — and it
 * scales to "hundreds of assets" without a single raster file. Generated
 * anime key-art (public/academy/art/*.webp + the ChatGPT pipeline) layers on
 * top of this baseline; these SVGs are the always-available fallback.
 *
 * Nothing here touches the DOM. Functions return SVG markup strings that the
 * app injects. Colours come from a fixed palette so light/dark themes and the
 * CSS design tokens stay in agreement.
 */

/* ------------------------------------------------------------------ palette */

export const ACADEMY_ART_PALETTE = {
    // Skin tones — a warm, inclusive spread for an international class.
    skin: {
        porcelain: '#f7d9c4',
        light: '#f0c9a8',
        warm: '#e6b892',
        tan: '#cf9e73',
        olive: '#c69267',
        brown: '#a9754e',
        deep: '#8a5a38',
        rich: '#6f4529',
    },
    hair: {
        black: '#241f26',
        softBlack: '#33303a',
        brown: '#5a3a28',
        chestnut: '#6f4227',
        auburn: '#8a3b28',
        blonde: '#c9974d',
        sand: '#b98d5a',
        ash: '#8a8f96',
        silver: '#b9bcc2',
        teal: '#2f6f6a',
        pink: '#d98aa6',
        miku: '#4fb6c0',
    },
    outfit: {
        indigo: '#3a4a72',
        navy: '#2c3550',
        teal: '#2f7168',
        forest: '#3a6b4a',
        rust: '#a2543a',
        plum: '#6d4568',
        mustard: '#b78a37',
        rose: '#a45266',
        slate: '#4c5a63',
        cream: '#d9cdb4',
        sky: '#4f7fa6',
        charcoal: '#33363d',
    },
    accent: {
        dawn: '#f3d9b8',
        peach: '#f4c9b0',
        mint: '#c8e6d3',
        sky: '#cfe1ef',
        lilac: '#dcd0ec',
        rose: '#f0cdd6',
        sand: '#ece0c6',
        sage: '#d3e2cd',
    },
    ink: '#2a2431',
    blush: '#e79aa0',
    white: '#fbf7f2',
} as const;

export type SkinTone = keyof typeof ACADEMY_ART_PALETTE.skin;
export type HairColor = keyof typeof ACADEMY_ART_PALETTE.hair;
export type OutfitColor = keyof typeof ACADEMY_ART_PALETTE.outfit;
export type AccentColor = keyof typeof ACADEMY_ART_PALETTE.accent;

export type HairStyle =
    | 'buzz' | 'short' | 'sidepart' | 'messy' | 'curly' | 'bob'
    | 'long' | 'ponytail' | 'bun' | 'wavy' | 'topknot' | 'undercut' | 'bald';
export type Expression = 'neutral' | 'happy' | 'thinking' | 'surprised' | 'warm' | 'sleepy';
export type FacialHair = 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee';
export type Glasses = 'none' | 'round' | 'square' | 'thin';

/** A hobby emblem pinned to the corner of a portrait — the charm hook. */
export type PropId =
    | 'car' | 'cat' | 'pokeball' | 'teacup' | 'ramen' | 'tennis' | 'laptop'
    | 'music' | 'dumbbell' | 'knitting' | 'dining' | 'globe' | 'book'
    | 'fuji' | 'fan' | 'okonomiyaki' | 'hellokitty' | 'star' | 'natto' | 'sparkle';

export interface AvatarSpec {
    skin: SkinTone;
    hair: HairStyle;
    hairColor: HairColor;
    outfit: OutfitColor;
    accent: AccentColor;
    expression?: Expression;
    glasses?: Glasses;
    facialHair?: FacialHair;
    prop?: PropId;
    /** Freckles / blush accent. */
    blush?: boolean;
    /** Optional headwear tint (beanie, headband). */
    headband?: string;
    /** Earrings dot colour. */
    earrings?: string;
}

/* -------------------------------------------------------------- primitives */

const P = ACADEMY_ART_PALETTE;

function skinHex(spec: AvatarSpec): string { return P.skin[spec.skin]; }
function hairHex(spec: AvatarSpec): string { return P.hair[spec.hairColor]; }

/** Slightly darker shade of a hex colour for cheap cel-shading. */
function shade(hex: string, amount = 0.16): string {
    const n = hex.replace('#', '');
    const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * (1 - amount)));
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function backHair(style: HairStyle, hair: string, dark: string): string {
    switch (style) {
        case 'long':
            return `<path d="M28 44 Q26 92 40 104 L80 104 Q94 92 92 44 Q92 30 60 28 Q28 30 28 44Z" fill="${dark}"/>`;
        case 'wavy':
            return `<path d="M30 46 Q24 84 38 96 Q34 78 40 70 Q34 92 46 98 L74 98 Q86 92 80 70 Q86 84 82 96 Q96 84 90 46 Z" fill="${dark}"/>`;
        case 'ponytail':
            return `<path d="M80 40 Q104 52 96 84 Q92 96 84 92 Q92 74 82 58Z" fill="${dark}"/><circle cx="82" cy="44" r="7" fill="${hair}"/>`;
        case 'bob':
            return `<path d="M30 46 Q28 82 40 90 L80 90 Q92 82 90 46 Q90 32 60 30 Q30 32 30 46Z" fill="${dark}"/>`;
        case 'bun':
        case 'topknot':
            return `<circle cx="60" cy="24" r="11" fill="${hair}"/><circle cx="60" cy="24" r="11" fill="none" stroke="${dark}" stroke-width="1.5"/>`;
        default:
            return '';
    }
}

function frontHair(style: HairStyle, hair: string, light: string): string {
    const hi = light;
    switch (style) {
        case 'bald':
            return '';
        case 'buzz':
            return `<path d="M36 46 Q38 26 60 25 Q82 26 84 46 Q84 40 60 38 Q36 40 36 46Z" fill="${hair}" opacity="0.92"/>`;
        case 'undercut':
            return `<path d="M38 44 Q40 24 62 24 Q86 24 84 46 Q80 34 60 33 L44 40 Q40 42 38 44Z" fill="${hair}"/><path d="M62 25 Q84 26 84 46 L78 44 Q80 30 62 29Z" fill="${hi}" opacity="0.5"/>`;
        case 'short':
            return `<path d="M34 47 Q34 24 60 23 Q86 24 86 47 Q86 38 74 35 Q80 42 76 46 Q70 34 60 34 Q50 34 44 46 Q40 40 46 35 Q34 38 34 47Z" fill="${hair}"/><path d="M52 26 Q60 24 68 26 L64 34 Q60 32 56 34Z" fill="${hi}" opacity="0.45"/>`;
        case 'sidepart':
            return `<path d="M34 48 Q34 24 60 23 Q86 24 86 48 Q84 36 66 33 Q60 40 50 42 Q40 42 40 47 Q36 42 34 48Z" fill="${hair}"/><path d="M60 24 Q78 26 84 44 Q78 34 62 33Z" fill="${hi}" opacity="0.4"/>`;
        case 'messy':
            return `<path d="M34 48 Q32 22 48 24 Q52 18 60 22 Q70 18 74 26 Q88 24 86 48 Q82 38 74 40 Q78 32 70 32 Q72 26 62 30 Q60 24 54 30 Q48 26 48 34 Q40 34 40 44 Q36 42 34 48Z" fill="${hair}"/>`;
        case 'curly':
            return `<g fill="${hair}"><circle cx="42" cy="34" r="9"/><circle cx="54" cy="28" r="10"/><circle cx="68" cy="28" r="10"/><circle cx="80" cy="36" r="9"/><circle cx="38" cy="44" r="7"/><circle cx="84" cy="44" r="7"/></g>`;
        case 'bob':
            return `<path d="M32 50 Q32 24 60 23 Q88 24 88 50 Q86 40 72 36 Q64 44 56 44 Q48 44 44 37 Q34 40 32 50Z" fill="${hair}"/>`;
        case 'long':
            return `<path d="M30 52 Q30 24 60 22 Q90 24 90 52 Q88 40 72 36 Q64 46 54 44 Q46 42 44 36 Q32 40 30 52Z" fill="${hair}"/><path d="M60 23 Q80 25 86 46 Q80 34 64 33Z" fill="${light}" opacity="0.4"/>`;
        case 'wavy':
            return `<path d="M32 50 Q30 24 60 22 Q90 24 88 50 Q84 38 74 38 Q78 30 68 30 Q70 24 60 28 Q50 24 52 32 Q42 30 46 40 Q36 40 32 50Z" fill="${hair}"/>`;
        case 'ponytail':
            return `<path d="M36 46 Q36 24 60 23 Q84 24 84 46 Q82 36 68 34 Q60 42 52 42 Q44 42 42 36 Q38 40 36 46Z" fill="${hair}"/>`;
        case 'bun':
        case 'topknot':
            return `<path d="M36 46 Q36 25 60 24 Q84 25 84 46 Q82 37 60 36 Q38 37 36 46Z" fill="${hair}"/>`;
        default:
            return `<path d="M34 47 Q34 24 60 23 Q86 24 86 47 Q84 38 60 36 Q36 38 34 47Z" fill="${hair}"/>`;
    }
}

function eyes(expr: Expression, ink: string): string {
    const white = P.white;
    switch (expr) {
        case 'happy':
        case 'warm':
            return `<path d="M46 60 Q51 55 56 60" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
                    <path d="M64 60 Q69 55 74 60" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
        case 'thinking':
            return `<circle cx="51" cy="61" r="4" fill="${ink}"/><circle cx="69" cy="61" r="4" fill="${ink}"/>
                    <path d="M45 53 Q51 51 57 54" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>
                    <path d="M63 54 Q69 51 75 53" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        case 'surprised':
            return `<circle cx="51" cy="60" r="5.5" fill="${white}" stroke="${ink}" stroke-width="2"/><circle cx="51" cy="60" r="2.6" fill="${ink}"/>
                    <circle cx="69" cy="60" r="5.5" fill="${white}" stroke="${ink}" stroke-width="2"/><circle cx="69" cy="60" r="2.6" fill="${ink}"/>`;
        case 'sleepy':
            return `<path d="M46 61 L56 61" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
                    <path d="M64 61 L74 61" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
        default:
            return `<ellipse cx="51" cy="61" rx="4.4" ry="5.2" fill="${ink}"/><circle cx="52.4" cy="59.4" r="1.4" fill="${white}"/>
                    <ellipse cx="69" cy="61" rx="4.4" ry="5.2" fill="${ink}"/><circle cx="70.4" cy="59.4" r="1.4" fill="${white}"/>`;
    }
}

function mouth(expr: Expression, ink: string): string {
    switch (expr) {
        case 'happy':
            return `<path d="M53 72 Q60 79 67 72" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
        case 'warm':
            return `<path d="M54 72 Q60 76 66 72" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
        case 'surprised':
            return `<ellipse cx="60" cy="73" rx="4" ry="5" fill="${ink}"/>`;
        case 'thinking':
            return `<path d="M55 73 Q60 71 65 73" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
        case 'sleepy':
            return `<path d="M56 73 L64 73" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
        default:
            return `<path d="M55 72 Q60 74.5 65 72" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
}

function glassesSvg(kind: Glasses, ink: string): string {
    if (!kind || kind === 'none') return '';
    if (kind === 'round') {
        return `<g fill="none" stroke="${ink}" stroke-width="2.2"><circle cx="51" cy="61" r="8"/><circle cx="69" cy="61" r="8"/><path d="M59 60 L61 60"/><path d="M43 59 L40 57"/><path d="M77 59 L80 57"/></g>`;
    }
    if (kind === 'square') {
        return `<g fill="none" stroke="${ink}" stroke-width="2.2"><rect x="43" y="54" width="16" height="13" rx="3"/><rect x="61" y="54" width="16" height="13" rx="3"/><path d="M59 60 L61 60"/><path d="M43 58 L40 56"/><path d="M77 58 L80 56"/></g>`;
    }
    return `<g fill="none" stroke="${ink}" stroke-width="1.6"><rect x="44" y="55" width="14" height="11" rx="5"/><rect x="62" y="55" width="14" height="11" rx="5"/><path d="M58 60 L62 60"/></g>`;
}

function facialHairSvg(kind: FacialHair, hex: string): string {
    switch (kind) {
        case 'stubble':
            return `<path d="M42 72 Q60 92 78 72 Q78 82 60 88 Q42 82 42 72Z" fill="${hex}" opacity="0.28"/>`;
        case 'beard':
            return `<path d="M40 66 Q42 94 60 96 Q78 94 80 66 Q74 82 60 84 Q46 82 40 66Z" fill="${hex}"/>`;
        case 'goatee':
            return `<path d="M53 80 Q60 92 67 80 Q64 86 60 86 Q56 86 53 80Z" fill="${hex}"/><path d="M52 74 Q60 78 68 74" stroke="${hex}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        case 'mustache':
            return `<path d="M52 71 Q60 75 68 71 Q64 68 60 70 Q56 68 52 71Z" fill="${hex}"/>`;
        default:
            return '';
    }
}

/* --------------------------------------------------------------- hobby props */

/** Small circular emblem badges. Drawn in a 0..24 space, translated by caller. */
function propGlyph(id: PropId): string {
    switch (id) {
        case 'car': return `<path d="M4 15 L6 10 Q7 8 10 8 L15 8 Q18 8 19 10 L21 15 Z" fill="#c9503f"/><rect x="3" y="14" width="18" height="4" rx="1.5" fill="#a53b2c"/><circle cx="7" cy="18" r="2.2" fill="#2a2431"/><circle cx="17" cy="18" r="2.2" fill="#2a2431"/><rect x="8" y="10" width="8" height="3.5" rx="1" fill="#d8e6f0"/>`;
        case 'cat': return `<path d="M6 8 L8 4 L10 8Z" fill="#4b4550"/><path d="M18 8 L16 4 L14 8Z" fill="#4b4550"/><circle cx="12" cy="13" r="7" fill="#5b5560"/><circle cx="9.5" cy="12" r="1.2" fill="#fbf7f2"/><circle cx="14.5" cy="12" r="1.2" fill="#fbf7f2"/><path d="M11 15 L13 15" stroke="#fbf7f2" stroke-width="1"/>`;
        case 'pokeball': return `<circle cx="12" cy="12" r="8" fill="#fbf7f2"/><path d="M4 12 A8 8 0 0 1 20 12 Z" fill="#d94f43"/><rect x="4" y="11" width="16" height="2" fill="#2a2431"/><circle cx="12" cy="12" r="2.6" fill="#fbf7f2" stroke="#2a2431" stroke-width="1.4"/>`;
        case 'teacup': return `<path d="M5 11 L19 11 L18 17 Q17 19 12 19 Q7 19 6 17 Z" fill="#e9e2d4"/><path d="M19 12 Q23 12 22 15 Q21 17 19 16" fill="none" stroke="#c7b48c" stroke-width="1.6"/><path d="M9 8 Q10 6 9 4 M13 8 Q14 6 13 4" stroke="#b9b1a4" stroke-width="1.2" fill="none" opacity="0.8"/><ellipse cx="12" cy="11" rx="7" ry="1.6" fill="#8a6f4a"/>`;
        case 'ramen': return `<path d="M4 12 L20 12 L18 18 Q17 20 12 20 Q7 20 6 18 Z" fill="#d98a4a"/><ellipse cx="12" cy="12" rx="8" ry="2.4" fill="#f0c27a"/><path d="M9 7 Q10 4 9 2 M12 7 Q13 4 12 2 M15 7 Q16 4 15 2" stroke="#cfd8dd" stroke-width="1.1" fill="none" opacity="0.85"/><circle cx="10" cy="12" r="1.4" fill="#e85d4a"/>`;
        case 'tennis': return `<circle cx="12" cy="12" r="8" fill="#b7d94a"/><path d="M6 8 Q12 12 18 8 M6 16 Q12 12 18 16" stroke="#fbf7f2" stroke-width="1.4" fill="none"/>`;
        case 'laptop': return `<rect x="4" y="6" width="16" height="10" rx="1.5" fill="#3a4a5a"/><rect x="5.5" y="7.5" width="13" height="7" rx="0.6" fill="#8fd0e6"/><path d="M3 16 L21 16 L22 19 L2 19 Z" fill="#2a3540"/>`;
        case 'music': return `<circle cx="9" cy="17" r="3" fill="#4fb6c0"/><circle cx="18" cy="15" r="3" fill="#4fb6c0"/><rect x="11" y="5" width="2" height="12" fill="#2f8a92"/><rect x="20" y="3" width="2" height="12" fill="#2f8a92"/><path d="M11 5 L22 3 L22 6 L11 8 Z" fill="#2f8a92"/>`;
        case 'dumbbell': return `<rect x="10" y="10" width="4" height="4" rx="1" fill="#556069"/><rect x="4" y="7" width="4" height="10" rx="1.5" fill="#3a444c"/><rect x="16" y="7" width="4" height="10" rx="1.5" fill="#3a444c"/><rect x="7" y="10.5" width="3" height="3" fill="#3a444c"/><rect x="14" y="10.5" width="3" height="3" fill="#3a444c"/>`;
        case 'knitting': return `<circle cx="11" cy="13" r="6.5" fill="#c46f8a"/><path d="M6 11 Q11 14 16 11 M6 15 Q11 12 16 15" stroke="#a45268" stroke-width="1.2" fill="none"/><rect x="15" y="4" width="1.6" height="12" rx="0.8" fill="#b98d5a" transform="rotate(20 16 10)"/><rect x="18" y="5" width="1.6" height="12" rx="0.8" fill="#b98d5a" transform="rotate(-14 19 11)"/>`;
        case 'dining': return `<rect x="8" y="5" width="1.8" height="14" rx="0.9" fill="#c7cdd2"/><path d="M14 5 L14 11 Q14 13 16 13 L16 19 M16 5 L16 9" stroke="#c7cdd2" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M7 5 L7 9 M10.6 5 L10.6 9" stroke="#c7cdd2" stroke-width="1" />`;
        case 'globe': return `<circle cx="12" cy="12" r="8" fill="#4f8fb0"/><path d="M4 12 L20 12 M12 4 Q6 12 12 20 Q18 12 12 4" stroke="#dceaf2" stroke-width="1.1" fill="none"/><path d="M6 8 Q12 10 18 8 M6 16 Q12 14 18 16" stroke="#dceaf2" stroke-width="1" fill="none"/>`;
        case 'book': return `<path d="M4 6 Q8 4 12 6 L12 18 Q8 16 4 18 Z" fill="#8a3b28"/><path d="M20 6 Q16 4 12 6 L12 18 Q16 16 20 18 Z" fill="#a2543a"/><path d="M12 6 L12 18" stroke="#5a2418" stroke-width="1"/>`;
        case 'fuji': return `<path d="M2 19 L9 7 Q12 3 15 7 L22 19 Z" fill="#6a7f9a"/><path d="M7 10 L9 7 Q12 3 15 7 L17 10 Q13 8 12 10 Q11 8 7 10Z" fill="#fbf7f2"/>`;
        case 'fan': return `<circle cx="12" cy="12" r="3" fill="#556069"/><g fill="#7a848c"><ellipse cx="12" cy="5" rx="2" ry="5"/><ellipse cx="12" cy="19" rx="2" ry="5"/><ellipse cx="5" cy="12" rx="5" ry="2"/><ellipse cx="19" cy="12" rx="5" ry="2"/></g><circle cx="12" cy="12" r="1.6" fill="#2a2431"/>`;
        case 'okonomiyaki': return `<circle cx="12" cy="13" r="8" fill="#b57a3a"/><path d="M6 11 Q12 9 18 11 M6 14 Q12 12 18 14" stroke="#8a4f28" stroke-width="1.2" fill="none"/><path d="M7 12 Q9 10 11 12 M13 13 Q15 11 17 13" stroke="#e0663a" stroke-width="1.4" fill="none"/><rect x="9" y="8" width="6" height="1.4" fill="#3a6b4a"/>`;
        case 'hellokitty': return `<ellipse cx="12" cy="13" rx="8" ry="7" fill="#fbf7f2"/><circle cx="9" cy="13" r="1.3" fill="#2a2431"/><circle cx="15" cy="13" r="1.3" fill="#2a2431"/><ellipse cx="12" cy="15" rx="1.3" ry="0.9" fill="#e0b04a"/><path d="M4 9 Q6 6 9 9Z" fill="#fbf7f2"/><path d="M20 9 Q18 6 15 9Z" fill="#fbf7f2"/><path d="M17 10 a2 2 0 1 1 0.1 0" fill="#d94f7a"/>`;
        case 'natto': return `<path d="M5 11 L19 11 L18 17 Q17 19 12 19 Q7 19 6 17 Z" fill="#d9cdb4"/><ellipse cx="12" cy="11" rx="7" ry="2" fill="#7a5a2a"/><path d="M8 8 Q12 12 16 8 M9 6 Q12 10 15 6" stroke="#b79a4a" stroke-width="0.8" fill="none" opacity="0.9"/>`;
        case 'star': return `<path d="M12 3 L14.5 9.5 L21 10 L16 14.5 L17.5 21 L12 17.3 L6.5 21 L8 14.5 L3 10 L9.5 9.5 Z" fill="#e6b34a"/>`;
        case 'sparkle': return `<path d="M12 3 Q13 10 20 12 Q13 14 12 21 Q11 14 4 12 Q11 10 12 3Z" fill="#f0d27a"/>`;
        default: return '';
    }
}

function propBadge(id: PropId | undefined): string {
    if (!id) return '';
    return `<g transform="translate(84 96)"><circle cx="12" cy="12" r="15" fill="${P.white}" stroke="${shade(P.white, 0.12)}" stroke-width="1.5"/><g transform="translate(0 0)">${propGlyph(id)}</g></g>`;
}

/* --------------------------------------------------------------- the avatar */

/**
 * Full bust portrait, 120x120 viewBox. Cozy, readable, theme-neutral.
 * `size` sets the rendered px dimension; omit for CSS-controlled sizing.
 */
export function avatarSvg(spec: AvatarSpec, options: { size?: number; showProp?: boolean; className?: string } = {}): string {
    const expr = spec.expression ?? 'neutral';
    const skin = skinHex(spec);
    const skinShade = shade(skin, 0.12);
    const hair = hairHex(spec);
    const hairDark = shade(hair, 0.22);
    const hairLight = shade(hair, -0.18);
    const outfit = P.outfit[spec.outfit];
    const outfitShade = shade(outfit, 0.18);
    const accent = P.accent[spec.accent];
    const ink = P.ink;
    const sizeAttr = options.size ? ` width="${options.size}" height="${options.size}"` : '';
    const cls = options.className ? ` class="${options.className}"` : '';

    return `<svg viewBox="0 0 120 120"${sizeAttr}${cls} role="img" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
        <defs><clipPath id="acc-${hashSpec(spec)}"><circle cx="60" cy="60" r="58"/></clipPath></defs>
        <g clip-path="url(#acc-${hashSpec(spec)})">
            <rect x="0" y="0" width="120" height="120" fill="${accent}"/>
            <circle cx="60" cy="128" r="60" fill="${shade(accent, 0.08)}"/>
            <!-- shoulders / outfit -->
            <path d="M18 120 Q20 92 44 84 L76 84 Q100 92 102 120 Z" fill="${outfit}"/>
            <path d="M44 84 Q60 100 76 84 L76 92 Q60 104 44 92 Z" fill="${outfitShade}"/>
            <path d="M52 84 L60 96 L68 84 Z" fill="${P.white}" opacity="0.85"/>
            <!-- neck -->
            <path d="M52 78 Q52 88 60 90 Q68 88 68 78 L68 70 L52 70 Z" fill="${skinShade}"/>
            ${backHair(spec.hair, hair, hairDark)}
            <!-- head -->
            <path d="M38 58 Q38 82 60 84 Q82 82 82 58 Q82 36 60 35 Q38 36 38 58Z" fill="${skin}"/>
            <!-- ears -->
            <circle cx="38" cy="62" r="5" fill="${skin}"/><circle cx="82" cy="62" r="5" fill="${skin}"/>
            ${spec.earrings ? `<circle cx="38" cy="67" r="1.8" fill="${spec.earrings}"/><circle cx="82" cy="67" r="1.8" fill="${spec.earrings}"/>` : ''}
            <!-- blush -->
            ${spec.blush !== false ? `<ellipse cx="45" cy="68" rx="4.5" ry="3" fill="${P.blush}" opacity="0.5"/><ellipse cx="75" cy="68" rx="4.5" ry="3" fill="${P.blush}" opacity="0.5"/>` : ''}
            ${eyes(expr, ink)}
            <path d="M58 64 Q60 67 62 64" fill="none" stroke="${skinShade}" stroke-width="1.4" stroke-linecap="round"/>
            ${mouth(expr, ink)}
            ${facialHairSvg(spec.facialHair ?? 'none', hairDark)}
            ${glassesSvg(spec.glasses ?? 'none', ink)}
            ${spec.headband ? `<path d="M36 46 Q60 36 84 46 L84 52 Q60 42 36 52Z" fill="${spec.headband}"/>` : ''}
            ${frontHair(spec.hair, hair, hairLight)}
        </g>
        <circle cx="60" cy="60" r="58" fill="none" stroke="${shade(accent, 0.22)}" stroke-width="2.5"/>
        ${options.showProp === false ? '' : propBadge(spec.prop)}
    </svg>`;
}

let specCounter = 0;
const specIds = new WeakMap<object, number>();
function hashSpec(spec: AvatarSpec): number {
    // Stable per-object id so multiple avatars on one page get unique clipPaths.
    let id = specIds.get(spec);
    if (id === undefined) { id = specCounter++; specIds.set(spec, id); }
    return id;
}

/* ---------------------------------------------------------- stamps & tokens */

/** The teacher's 花丸 (hana-maru) — the swirl-flower "great job" stamp. */
export function hanaMaruSvg(options: { size?: number; color?: string } = {}): string {
    const c = options.color ?? '#d1443f';
    const s = options.size ? ` width="${options.size}" height="${options.size}"` : '';
    return `<svg viewBox="0 0 100 100"${s} role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round">
            <path d="M50 12 Q62 14 62 26 Q74 24 78 36 Q88 42 84 54 Q90 64 82 72 Q84 84 72 86 Q66 96 54 92 Q44 98 36 90 Q24 90 22 78 Q12 72 16 60 Q8 50 16 42 Q14 30 26 28 Q30 16 42 18 Q46 10 50 12Z"/>
            <path d="M50 50 m0 -22 a22 22 0 1 0 0.1 0" transform="rotate(0 50 50)" opacity="0"/>
            <path d="M50 30 Q64 32 66 46 Q66 62 50 66 Q36 64 34 50 Q34 38 46 36 Q56 36 56 46 Q56 54 48 54 Q42 54 44 48"/>
        </g>
    </svg>`;
}

/** Campus Marks — the Academy currency coin (a stamped plum blossom). */
export function campusMarkSvg(options: { size?: number } = {}): string {
    const s = options.size ? ` width="${options.size}" height="${options.size}"` : '';
    return `<svg viewBox="0 0 48 48"${s} role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" fill="#e6b34a"/><circle cx="24" cy="24" r="22" fill="none" stroke="#c7913a" stroke-width="2"/>
        <circle cx="24" cy="24" r="16" fill="none" stroke="#c7913a" stroke-width="1.4" opacity="0.7"/>
        <g fill="#a45266">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="24" cy="13" rx="4" ry="6" transform="rotate(${a} 24 24)"/>`).join('')}</g>
        <circle cx="24" cy="24" r="3" fill="#e6b34a" stroke="#c7913a" stroke-width="1"/>
    </svg>`;
}

/* ------------------------------------------------------------------- items */

export type ItemArtId =
    | 'thermos' | 'umbrella' | 'train-card' | 'doodle-pen' | 'pocky' | 'charm'
    | 'ramen-ticket' | 'library-card' | 'headphones' | 'notebook' | 'lantern'
    | 'omamori' | 'daruma' | 'maneki' | 'route-map' | 'ticket-japan';

/** Inventory / shop item icons, 48x48. Persona-flavoured but wholly original. */
export function itemArtSvg(id: ItemArtId, options: { size?: number } = {}): string {
    const s = options.size ? ` width="${options.size}" height="${options.size}"` : '';
    const open = `<svg viewBox="0 0 48 48"${s} role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`;
    const body = (() => {
        switch (id) {
            case 'thermos': return `<rect x="17" y="8" width="14" height="32" rx="4" fill="#3a6b4a"/><rect x="17" y="8" width="14" height="7" rx="4" fill="#2c503a"/><rect x="20" y="4" width="8" height="5" rx="2" fill="#8a9a90"/><rect x="18" y="22" width="12" height="3" fill="#2c503a" opacity="0.6"/>`;
            case 'umbrella': return `<path d="M8 24 Q24 6 40 24 Z" fill="#a45266"/><path d="M8 24 Q14 20 20 24 Q26 20 32 24 Q36 20 40 24" fill="none" stroke="#fbf7f2" stroke-width="1.4"/><rect x="23" y="24" width="2" height="14" fill="#5a4a3a"/><path d="M25 38 q4 0 4 -4" fill="none" stroke="#5a4a3a" stroke-width="2"/>`;
            case 'train-card': return `<rect x="8" y="14" width="32" height="20" rx="3" fill="#4f8fb0"/><rect x="8" y="18" width="32" height="4" fill="#2f6f8a"/><circle cx="33" cy="28" r="3.5" fill="#e6b34a"/><rect x="12" y="26" width="12" height="2.5" rx="1" fill="#fbf7f2"/>`;
            case 'doodle-pen': return `<rect x="10" y="30" width="26" height="6" rx="3" fill="#a2543a" transform="rotate(-38 24 33)"/><path d="M32 12 L38 18 L34 22 L28 16 Z" fill="#e6b34a" transform="rotate(-38 33 17)"/><circle cx="14" cy="34" r="2" fill="#2a2431"/>`;
            case 'pocky': return `<rect x="14" y="10" width="8" height="30" rx="2" fill="#c94f6a"/><rect x="15" y="12" width="6" height="6" fill="#e07a94"/><g fill="#b98d5a"><rect x="24" y="8" width="2" height="22" rx="1"/><rect x="28" y="9" width="2" height="22" rx="1"/></g><rect x="23" y="8" width="8" height="6" rx="1" fill="#7a5a3a"/>`;
            case 'charm': return `<rect x="16" y="10" width="16" height="26" rx="4" fill="#a45266"/><rect x="16" y="10" width="16" height="6" rx="4" fill="#8a3f52"/><path d="M22 8 L26 8 L28 12 L20 12Z" fill="#c7913a"/><path d="M20 20 Q24 24 28 20 M24 18 L24 30" stroke="#e6b34a" stroke-width="1.4" fill="none"/>`;
            case 'ramen-ticket': return `<rect x="8" y="16" width="32" height="16" rx="2" fill="#d98a4a"/><circle cx="8" cy="24" r="3" fill="#fbf7f2"/><circle cx="40" cy="24" r="3" fill="#fbf7f2"/><ellipse cx="24" cy="24" rx="7" ry="4" fill="#f0c27a"/><path d="M24 20 q1 -3 0 -5" stroke="#fff" stroke-width="1" fill="none" opacity="0.7"/>`;
            case 'library-card': return `<rect x="9" y="12" width="30" height="24" rx="2" fill="#d9cdb4"/><rect x="9" y="12" width="30" height="6" fill="#8a3b28"/><rect x="13" y="22" width="16" height="2" fill="#5a4a3a"/><rect x="13" y="27" width="12" height="2" fill="#5a4a3a"/>`;
            case 'headphones': return `<path d="M12 26 Q12 10 24 10 Q36 10 36 26" fill="none" stroke="#33363d" stroke-width="3"/><rect x="9" y="24" width="7" height="12" rx="3" fill="#4f7fa6"/><rect x="32" y="24" width="7" height="12" rx="3" fill="#4f7fa6"/>`;
            case 'notebook': return `<rect x="12" y="8" width="24" height="32" rx="2" fill="#3a4a72"/><rect x="12" y="8" width="6" height="32" fill="#2c3550"/><rect x="21" y="16" width="12" height="2" fill="#fbf7f2" opacity="0.7"/><rect x="21" y="22" width="12" height="2" fill="#fbf7f2" opacity="0.7"/><rect x="21" y="28" width="8" height="2" fill="#fbf7f2" opacity="0.7"/>`;
            case 'lantern': return `<rect x="22" y="6" width="4" height="4" fill="#5a4a3a"/><ellipse cx="24" cy="24" rx="12" ry="15" fill="#c9503f"/><rect x="12" y="22" width="24" height="4" fill="#a53b2c"/><rect x="14" y="16" width="20" height="2" fill="#a53b2c" opacity="0.6"/><rect x="14" y="30" width="20" height="2" fill="#a53b2c" opacity="0.6"/><rect x="22" y="38" width="4" height="4" fill="#5a4a3a"/>`;
            case 'omamori': return `<rect x="15" y="9" width="18" height="28" rx="3" fill="#6d4568"/><path d="M15 15 L33 15" stroke="#e6b34a" stroke-width="1.5"/><path d="M24 6 L24 12 M20 9 L28 9" stroke="#c7913a" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="none" stroke="#e6b34a" stroke-width="1.4"/>`;
            case 'daruma': return `<path d="M14 32 Q14 12 24 12 Q34 12 34 32 Q34 40 24 40 Q14 40 14 32Z" fill="#c9503f"/><ellipse cx="24" cy="24" rx="9" ry="8" fill="#f0d9b8"/><circle cx="20" cy="23" r="2" fill="#2a2431"/><circle cx="28" cy="23" r="2" fill="#fbf7f2" stroke="#2a2431" stroke-width="1"/><path d="M20 30 Q24 32 28 30" stroke="#7a2a1a" stroke-width="1.4" fill="none"/>`;
            case 'maneki': return `<path d="M14 34 Q14 14 24 14 Q34 14 34 34 Q34 40 24 40 Q14 40 14 34Z" fill="#fbf7f2"/><path d="M16 16 L12 10 L18 14Z" fill="#fbf7f2"/><path d="M32 16 L36 10 L30 14Z" fill="#fbf7f2"/><circle cx="20" cy="26" r="1.4" fill="#2a2431"/><circle cx="28" cy="26" r="1.4" fill="#2a2431"/><path d="M34 22 q4 -2 3 4" fill="none" stroke="#fbf7f2" stroke-width="3"/><circle cx="24" cy="31" r="2.4" fill="#e6b34a"/>`;
            case 'route-map': return `<path d="M9 12 L19 15 L29 12 L39 15 L39 36 L29 33 L19 36 L9 33 Z" fill="#e3d7bd"/><path d="M19 15 L19 36 M29 12 L29 33" stroke="#b7a986" stroke-width="1"/><path d="M12 20 Q20 24 26 18 Q32 14 36 20" fill="none" stroke="#c9503f" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="36" cy="20" r="2" fill="#c9503f"/>`;
            case 'ticket-japan': return `<rect x="7" y="16" width="34" height="16" rx="2" fill="#a45266"/><circle cx="7" cy="24" r="3" fill="#fbf7f2"/><circle cx="41" cy="24" r="3" fill="#fbf7f2"/><path d="M24 20 l1.2 2.4 l2.6 0.2 l-2 1.8 l0.6 2.6 l-2.4 -1.4 l-2.4 1.4 l0.6 -2.6 l-2 -1.8 l2.6 -0.2Z" fill="#e6b34a"/>`;
            default: return '';
        }
    })();
    return `${open}${body}</svg>`;
}
