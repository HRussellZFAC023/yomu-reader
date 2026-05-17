export interface RtkElementGlyph {
    glyph: string;
    kanji?: string;
}

export function splitRtkElements(value: string): string[] {
    const seen = new Set<string>();
    const elements: string[] = [];
    value
        .split(/[、,;＋+]/)
        .map(cleanRtkElementKeyword)
        .filter(Boolean)
        .forEach(keyword => {
            const key = rtkElementKey(keyword);
            if (seen.has(key)) return;
            seen.add(key);
            elements.push(keyword);
        });
    return elements.slice(0, 16);
}

export function cleanRtkElementKeyword(value: string): string {
    return value.replace(/\s+/g, ' ').trim().replace(/\d+$/u, '').trim();
}

export function rtkElementKey(value: string): string {
    return cleanRtkElementKeyword(value)
        .toLowerCase()
        .replace(/[’']/g, '');
}

const RTK_ELEMENT_GLYPH_FALLBACKS = new Map<string, RtkElementGlyph>(
    'heart=心=心|fishhook=乙=乙|fishguts=乙=乙|fish guts=乙=乙|stick=丨|walking stick=丨|drop=丶|drops=丶|a drop of=丶|hook right=⺃|hook (right)=⺃|state of mind=⺖|valentine=⺗|animal legs=ハ|human legs=儿|wind=几|bound up=勹|bound up small=⺈|bound up (small)=⺈|horns=丷|saber=⺉|little=⺌|cliff=厂|water=⺡|fire=⺣|hood=冂|house=宀|flower=艹|pack of wild dogs=⺨|cow left=牜|cow top=⺧|umbrella=𠆢|road=⻌|walking legs=夂|crown=冖|top hat=亠|taskmaster=攵|fiesta=戈|stretch=廴|zoo=疋|zoo left=⺪|cloak=⻂|ice left=冫|ice bottom=⺀|reclining=𠂉|wings=羽=羽|feathers=羽=羽|person=⺅|finger=扌|two hands bottom=廾|elbow=厶|going=彳|altar=⺭|broom=彐|broom old=⺔|rake=⺺|shovel=凵|old man=耂|cocoon=幺|stamp=卩|chop seal=ㄗ|chop seal small=マ|silver=艮|sheaf=㐅|cornucopia=丩|key=ユ|sickness=疒|box=匚|shape=彡|row=业|city walls right=⻏'
        .split('|')
        .map(value => {
            const [key, glyph, kanji] = value.split('=');
            return [key, kanji ? { glyph, kanji } : { glyph }] as [string, RtkElementGlyph];
        }),
);

export function rtkElementFallbackGlyph(keyword: string): RtkElementGlyph | undefined {
    return RTK_ELEMENT_GLYPH_FALLBACKS.get(rtkElementKey(keyword));
}
