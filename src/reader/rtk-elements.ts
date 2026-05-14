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

const RTK_ELEMENT_GLYPH_FALLBACKS = new Map<string, RtkElementGlyph>([
    ['heart', { glyph: '心', kanji: '心' }],
    ['fishhook', { glyph: '乙', kanji: '乙' }],
    ['fishguts', { glyph: '乙', kanji: '乙' }],
    ['fish guts', { glyph: '乙', kanji: '乙' }],
    ['stick', { glyph: '丨' }],
    ['walking stick', { glyph: '丨' }],
    ['drop', { glyph: '丶' }],
    ['drops', { glyph: '丶' }],
    ['a drop of', { glyph: '丶' }],
    ['hook right', { glyph: '⺃' }],
    ['hook (right)', { glyph: '⺃' }],
    ['state of mind', { glyph: '⺖' }],
    ['valentine', { glyph: '⺗' }],
    ['animal legs', { glyph: 'ハ' }],
    ['human legs', { glyph: '儿' }],
    ['wind', { glyph: '几' }],
    ['bound up', { glyph: '勹' }],
    ['bound up small', { glyph: '⺈' }],
    ['bound up (small)', { glyph: '⺈' }],
    ['horns', { glyph: '丷' }],
    ['saber', { glyph: '⺉' }],
    ['little', { glyph: '⺌' }],
    ['cliff', { glyph: '厂' }],
    ['water', { glyph: '⺡' }],
    ['fire', { glyph: '⺣' }],
    ['hood', { glyph: '冂' }],
    ['house', { glyph: '宀' }],
    ['flower', { glyph: '艹' }],
    ['pack of wild dogs', { glyph: '⺨' }],
    ['cow left', { glyph: '牜' }],
    ['cow top', { glyph: '⺧' }],
    ['umbrella', { glyph: '𠆢' }],
    ['road', { glyph: '⻌' }],
    ['walking legs', { glyph: '夂' }],
    ['crown', { glyph: '冖' }],
    ['top hat', { glyph: '亠' }],
    ['taskmaster', { glyph: '攵' }],
    ['fiesta', { glyph: '戈' }],
    ['stretch', { glyph: '廴' }],
    ['zoo', { glyph: '疋' }],
    ['zoo left', { glyph: '⺪' }],
    ['cloak', { glyph: '⻂' }],
    ['ice left', { glyph: '冫' }],
    ['ice bottom', { glyph: '⺀' }],
    ['reclining', { glyph: '𠂉' }],
    ['wings', { glyph: '羽', kanji: '羽' }],
    ['feathers', { glyph: '羽', kanji: '羽' }],
    ['person', { glyph: '⺅' }],
    ['finger', { glyph: '扌' }],
    ['two hands bottom', { glyph: '廾' }],
    ['elbow', { glyph: '厶' }],
    ['going', { glyph: '彳' }],
    ['altar', { glyph: '⺭' }],
    ['broom', { glyph: '彐' }],
    ['broom old', { glyph: '⺔' }],
    ['rake', { glyph: '⺺' }],
    ['shovel', { glyph: '凵' }],
    ['old man', { glyph: '耂' }],
    ['cocoon', { glyph: '幺' }],
    ['stamp', { glyph: '卩' }],
    ['chop seal', { glyph: 'ㄗ' }],
    ['chop seal small', { glyph: 'マ' }],
    ['silver', { glyph: '艮' }],
    ['sheaf', { glyph: '㐅' }],
    ['cornucopia', { glyph: '丩' }],
    ['key', { glyph: 'ユ' }],
    ['sickness', { glyph: '疒' }],
    ['box', { glyph: '匚' }],
    ['shape', { glyph: '彡' }],
    ['row', { glyph: '业' }],
    ['city walls right', { glyph: '⻏' }],
]);

export function rtkElementFallbackGlyph(keyword: string): RtkElementGlyph | undefined {
    return RTK_ELEMENT_GLYPH_FALLBACKS.get(rtkElementKey(keyword));
}
