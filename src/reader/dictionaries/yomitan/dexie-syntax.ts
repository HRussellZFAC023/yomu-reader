// Import safety limits, not JSON grammar limits. The downstream row reader and
// compatibility fallback still do not have an all-input bounded-memory contract.
const MAX_DEXIE_SCALAR_LENGTH = 128;
const MAX_DEXIE_NESTING = 128;
// Only string tokens shorter than this are decoded; that covers every object
// key and the `formatName` value the preflight has to recognise.
const MAX_DECODED_STRING_LENGTH = 256;
const ATOM = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;
const WHITESPACE = /[ \t\r\n]/;
const STRUCTURAL = '{}[],:"';
const CLOSABLE: ReadonlySet<FrameExpectation> = new Set(['key-or-end', 'value-or-end', 'comma-or-end']);

type FrameExpectation = 'key' | 'key-or-end' | 'colon' | 'value' | 'value-or-end' | 'comma-or-end';

interface Frame {
    readonly kind: 'object' | 'array';
    next: FrameExpectation;
}

export function failInvalidDexieJson(): never {
    throw new SyntaxError('Invalid Dexie JSON dictionary.');
}

/**
 * Streaming JSON syntax check for a Dexie export, fed in chunks. It keeps only
 * a container stack and one bounded token, so a hostile export cannot make the
 * preflight itself allocate without limit; it also records the root
 * `formatName` string so {@link finish} can require a Dexie document.
 */
export class DexieSyntaxPreflight {
    private readonly stack: Frame[] = [];
    private root: 'value' | 'done' = 'value';
    private inString = false;
    private escaped = false;
    private unicodeDigits = 0;
    private atom = '';
    private text = '';
    private rootKey = '';
    private format: string | undefined;

    feed(chunk: string): void {
        for (const char of chunk) {
            if (this.inString) this.stringChar(char);
            else this.structuralChar(char);
        }
    }

    finish(): void {
        this.finishAtom();
        if (this.inString || this.escaped || this.unicodeDigits || this.stack.length) failInvalidDexieJson();
        if (this.root !== 'done' || this.format !== 'dexie') failInvalidDexieJson();
    }

    private stringChar(char: string): void {
        if (char !== '"' || this.escaped || this.unicodeDigits) this.bufferText(char);
        if (this.unicodeDigits) this.unicodeDigit(char);
        else if (this.escaped) this.escapeChar(char);
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.closeString();
        else if (char.charCodeAt(0) < 32) failInvalidDexieJson();
    }

    private bufferText(char: string): void {
        if (this.text.length < MAX_DECODED_STRING_LENGTH) this.text += char;
    }

    private unicodeDigit(char: string): void {
        if (!/[0-9a-f]/i.test(char)) failInvalidDexieJson();
        this.unicodeDigits--;
    }

    private escapeChar(char: string): void {
        if (char === 'u') this.unicodeDigits = 4;
        else if (!'"\\/bfnrt'.includes(char)) failInvalidDexieJson();
        this.escaped = false;
    }

    private closeString(): void {
        this.inString = false;
        const frame = this.stack.at(-1);
        const decoded = this.text.length < MAX_DECODED_STRING_LENGTH ? JSON.parse(`"${this.text}"`) as string : '';
        if (frame?.kind === 'object' && (frame.next === 'key' || frame.next === 'key-or-end')) {
            frame.next = 'colon';
            if (this.stack.length === 1) this.rootKey = decoded;
            return;
        }
        this.value();
        if (this.atRootFormatName()) this.format = decoded;
    }

    private structuralChar(char: string): void {
        const whitespace = WHITESPACE.test(char);
        if (!whitespace && !STRUCTURAL.includes(char)) {
            this.atomChar(char);
            return;
        }
        this.finishAtom();
        if (whitespace) return;
        if (char === '"') this.openString();
        else if (char === '{' || char === '[') this.openContainer(char);
        else if (char === '}' || char === ']') this.closeContainer(char);
        else if (char === ':') this.colon();
        else this.comma();
    }

    private atomChar(char: string): void {
        if (this.atom.length >= MAX_DEXIE_SCALAR_LENGTH) throw new RangeError('Dexie import scalar exceeds 128 characters.');
        this.atom += char;
    }

    private finishAtom(): void {
        if (!this.atom) return;
        if (!ATOM.test(this.atom)) failInvalidDexieJson();
        this.value();
        this.atom = '';
    }

    private openString(): void {
        this.inString = true;
        this.text = '';
    }

    private openContainer(char: '{' | '['): void {
        if (this.stack.length >= MAX_DEXIE_NESTING) throw new RangeError('Dexie import nesting exceeds 128 levels.');
        this.value();
        this.stack.push(char === '{' ? { kind: 'object', next: 'key-or-end' } : { kind: 'array', next: 'value-or-end' });
    }

    private closeContainer(char: '}' | ']'): void {
        const frame = this.stack.at(-1);
        if (!frame || frame.kind !== (char === '}' ? 'object' : 'array') || !CLOSABLE.has(frame.next)) failInvalidDexieJson();
        this.stack.pop();
    }

    private colon(): void {
        const frame = this.stack.at(-1);
        if (!frame || frame.next !== 'colon') failInvalidDexieJson();
        frame.next = 'value';
    }

    private comma(): void {
        const frame = this.stack.at(-1);
        if (!frame || frame.next !== 'comma-or-end') failInvalidDexieJson();
        frame.next = frame.kind === 'object' ? 'key' : 'value';
    }

    /** Account for one complete value (scalar, string, or container opening). */
    private value(): void {
        const frame = this.stack.at(-1);
        // Any value under the root `formatName` key replaces the recorded one;
        // only a string value then sets it again (see closeString).
        if (this.atRootFormatName()) this.format = undefined;
        if (!frame) {
            if (this.root !== 'value') failInvalidDexieJson();
            this.root = 'done';
            return;
        }
        if (frame.next !== 'value' && frame.next !== 'value-or-end') failInvalidDexieJson();
        frame.next = 'comma-or-end';
    }

    private atRootFormatName(): boolean {
        return this.stack.length === 1 && this.rootKey === 'formatName';
    }
}
