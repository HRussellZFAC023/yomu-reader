export function googleLensUploadCallbackLiteral(html: string, key: string): string | null {
    const marker = 'AF_initDataCallback(';
    let searchIndex = 0;
    while (searchIndex < html.length) {
        const markerIndex = html.indexOf(marker, searchIndex);
        if (markerIndex < 0) return null;
        const literalStart = markerIndex + marker.length;
        const literal = readBalancedLiteral(html, literalStart);
        if (literal && callbackLiteralHasKey(literal, key)) return literal;
        searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
}

function callbackLiteralHasKey(literal: string, key: string): boolean {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key)}['"]`).test(literal);
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBalancedLiteral(source: string, startIndex: number): string | null {
    const index = balancedLiteralStart(source, startIndex);
    if (index < 0) return null;
    const end = balancedLiteralEnd(source, index);
    return end >= 0 ? source.slice(index, end + 1) : null;
}

function balancedLiteralStart(source: string, startIndex: number): number {
    let index = startIndex;
    while (/\s/.test(source[index] ?? '')) index += 1;
    return source[index] === '{' ? index : -1;
}

function balancedLiteralEnd(source: string, startIndex: number): number {
    let depth = 0;
    for (let current = startIndex; current < source.length; current += 1) {
        const char = source[current];
        if (isQuote(char)) {
            current = quotedLiteralEnd(source, current, char);
            if (current < 0) return -1;
            continue;
        }
        depth += balancedDepthDelta(char);
        if (depth === 0) return current;
    }
    return -1;
}

function quotedLiteralEnd(source: string, startIndex: number, quote: string): number {
    for (let current = startIndex + 1; current < source.length; current += 1) {
        const char = source[current];
        if (char === '\\') {
            current += 1;
        } else if (char === quote) {
            return current;
        }
    }
    return -1;
}

function isQuote(char: string): boolean {
    return char === '"' || char === "'";
}

function balancedDepthDelta(char: string): number {
    if (char === '{' || char === '[' || char === '(') return 1;
    if (char === '}' || char === ']' || char === ')') return -1;
    return 0;
}

export function parseJsDataLiteral(source: string): unknown {
    let index = 0;
    const value = parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error('Unexpected trailing data.');
    return value;

    function parseValue(): unknown {
        skipWhitespace();
        const char = source[index];
        if (char === '{') return parseObject();
        if (char === '[') return parseArray();
        if (char === '"' || char === "'") return parseString();
        if (char === '-' || /\d/.test(char ?? '')) return parseNumber();
        return parseIdentifierValue();
    }

    function parseObject(): Record<string, unknown> {
        const record: Record<string, unknown> = {};
        index += 1;
        skipWhitespace();
        while (source[index] !== '}') {
            const key = parseObjectKey();
            skipWhitespace();
            expect(':');
            record[key] = parseValue();
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect('}');
        return record;
    }

    function parseObjectKey(): string {
        skipWhitespace();
        const char = source[index];
        if (char === '"' || char === "'") return parseString();
        return parseIdentifier();
    }

    function parseArray(): unknown[] {
        const values: unknown[] = [];
        index += 1;
        skipWhitespace();
        while (source[index] !== ']') {
            if (source[index] === ',') {
                values.push(null);
                index += 1;
                skipWhitespace();
                continue;
            }
            values.push(parseValue());
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect(']');
        return values;
    }

    function parseString(): string {
        const quote = source[index];
        let value = '';
        index += 1;
        while (index < source.length) {
            const char = source[index++];
            if (char === quote) return value;
            if (char !== '\\') {
                value += char;
                continue;
            }
            value += parseEscapeSequence();
        }
        throw new Error('Unterminated string.');
    }

    function parseEscapeSequence(): string {
        const escaped = source[index++];
        if (escaped === 'n') return '\n';
        if (escaped === 'r') return '\r';
        if (escaped === 't') return '\t';
        if (escaped === 'b') return '\b';
        if (escaped === 'f') return '\f';
        if (escaped === 'v') return '\v';
        if (escaped === '0') return '\0';
        if (escaped === '\n') return '';
        if (escaped === '\r') {
            if (source[index] === '\n') index += 1;
            return '';
        }
        if (escaped === 'x') return codePointEscape(2);
        if (escaped === 'u') return parseUnicodeEscape();
        return escaped ?? '';
    }

    function parseUnicodeEscape(): string {
        if (source[index] === '{') {
            const end = source.indexOf('}', index + 1);
            if (end < 0) throw new Error('Invalid unicode escape.');
            const value = Number.parseInt(source.slice(index + 1, end), 16);
            index = end + 1;
            return Number.isFinite(value) ? String.fromCodePoint(value) : '';
        }
        return codePointEscape(4);
    }

    function codePointEscape(length: number): string {
        const hex = source.slice(index, index + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error('Invalid character escape.');
        index += length;
        return String.fromCharCode(Number.parseInt(hex, 16));
    }

    function parseNumber(): number {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
        if (!match) throw new Error('Invalid number.');
        index += match[0].length;
        return Number(match[0]);
    }

    function parseIdentifierValue(): unknown {
        const identifier = parseIdentifier();
        if (identifier === 'null' || identifier === 'undefined' || identifier === 'NaN') return null;
        if (identifier === 'true') return true;
        if (identifier === 'false') return false;
        if (identifier === 'Infinity') return Infinity;
        return identifier;
    }

    function parseIdentifier(): string {
        const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
        if (!match) throw new Error('Expected identifier.');
        index += match[0].length;
        return match[0];
    }

    function skipWhitespace(): void {
        while (/\s/.test(source[index] ?? '')) index += 1;
    }

    function expect(char: string): void {
        if (source[index] !== char) throw new Error(`Expected ${char}.`);
        index += 1;
    }
}
