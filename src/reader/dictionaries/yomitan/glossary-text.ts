import { isRecord } from '../../core/object-utils';
interface GlossaryTextOptions {
    includeDirectDataAttributes: boolean;
    fallbackTextKeys: Set<string>;
}

const GLOSSARY_DISPLAY_TEXT_KEYS = new Set(['text', 'content', 'description', 'alt', 'title']);
const GLOSSARY_SEARCH_FALLBACK_TEXT_KEYS = new Set(['description', 'alt', 'title']);

export function glossaryValueToText(value: unknown): string {
    return glossaryValueToProfileText(value, {
        includeDirectDataAttributes: true,
        fallbackTextKeys: GLOSSARY_DISPLAY_TEXT_KEYS,
    });
}

export function glossaryValueToSearchText(value: unknown): string {
    return glossaryValueToProfileText(value, {
        includeDirectDataAttributes: false,
        fallbackTextKeys: GLOSSARY_SEARCH_FALLBACK_TEXT_KEYS,
    });
}

export function normalizeGlossarySearchText(value: string): string {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function glossaryValueToProfileText(value: unknown, options: GlossaryTextOptions): string {
    const primitiveText = primitiveGlossaryText(value);
    if (primitiveText !== undefined) return primitiveText;
    if (Array.isArray(value)) {
        return value
            .map(child => glossaryValueToProfileText(child, options))
            .filter(Boolean)
            .join(' ');
    }
    return isRecord(value) ? glossaryRecordToText(value, options) : '';
}

function primitiveGlossaryText(value: unknown): string | undefined {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
}

function glossaryRecordToText(record: Record<string, unknown>, options: GlossaryTextOptions): string {
    if (typeof record.text === 'string') return record.text;
    if ('content' in record) return glossaryValueToProfileText(record.content, options);
    const values = glossaryRecordTextValues(record, options);
    if (values.length) return values.join(' ');
    if ('path' in record) return glossaryPathRecordText(record);
    return '';
}

function glossaryPathRecordText(record: Record<string, unknown>): string {
    return String(record.description || record.alt || '');
}

function glossaryRecordTextValues(record: Record<string, unknown>, options: GlossaryTextOptions): string[] {
    const values: string[] = [];
    for (const [key, childValue] of Object.entries(record)) {
        if (!shouldReadRecordTextKey(key, options)) continue;
        const childText = glossaryValueToProfileText(childValue, options);
        if (childText) values.push(childText);
    }
    return values;
}

function shouldReadRecordTextKey(key: string, options: GlossaryTextOptions): boolean {
    return options.fallbackTextKeys.has(key)
        || (options.includeDirectDataAttributes && key.startsWith('data-'));
}

