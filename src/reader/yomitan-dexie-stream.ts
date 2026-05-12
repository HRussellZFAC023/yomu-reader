type DexieRowHandler = (row: unknown) => Promise<void>;
type DexieStreamMode = 'seek-table' | 'seek-rows' | 'rows';

interface DexieStreamState {
    buffer: string;
    mode: DexieStreamMode;
    tableName: string;
    rowStart: number;
    depth: number;
    inString: boolean;
    escaped: boolean;
}

export async function readDexieTableRowCounts(file: File): Promise<Partial<Record<string, number>>> {
    const head = await readBlobText(file.slice(0, Math.min(file.size, 1024 * 1024)));
    const tablesIndex = head.indexOf('"tables"');
    if (tablesIndex < 0) return {};
    const arrayStart = head.indexOf('[', tablesIndex);
    if (arrayStart < 0) return {};
    const arrayEnd = findJsonArrayEnd(head, arrayStart);
    if (arrayEnd < 0) return {};

    const tables = JSON.parse(head.slice(arrayStart, arrayEnd + 1)) as unknown[];
    const counts: Partial<Record<string, number>> = {};
    for (const table of tables) {
        if (!table || typeof table !== 'object') continue;
        const record = table as Record<string, unknown>;
        if (typeof record.name === 'string' && typeof record.rowCount === 'number') counts[record.name] = record.rowCount;
    }
    return counts;
}

export async function streamDexieTables(
    file: File,
    handlers: Partial<Record<string, DexieRowHandler>>,
    onTable?: (table: string) => void,
): Promise<void> {
    if (typeof file.stream !== 'function' || typeof TextDecoderStream === 'undefined') {
        await streamDexieTablesFromText(await readBlobText(file), handlers, onTable);
        return;
    }

    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    const state: DexieStreamState = {
        buffer: '',
        mode: 'seek-table',
        tableName: '',
        rowStart: -1,
        depth: 0,
        inString: false,
        escaped: false,
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        state.buffer += value;
        await processDexieStreamBuffer(state, handlers, onTable);
    }
}

export function readBlobText(blob: Blob): Promise<string> {
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsText(blob);
    });
}

async function processDexieStreamBuffer(
    state: DexieStreamState,
    handlers: Partial<Record<string, DexieRowHandler>>,
    onTable?: (table: string) => void,
): Promise<void> {
    let progress = true;
    while (progress) {
        progress = false;
        if (state.mode === 'seek-table') progress = seekDexieTable(state);
        if (state.mode === 'seek-rows') progress = seekDexieRows(state, onTable) || progress;
        if (state.mode === 'rows') progress = await readDexieRows(state, handlers) || progress;
    }
}

function seekDexieTable(state: DexieStreamState): boolean {
    const tableIndex = state.buffer.indexOf('"tableName"');
    if (tableIndex < 0) {
        state.buffer = state.buffer.slice(-32);
        return false;
    }
    const colon = state.buffer.indexOf(':', tableIndex);
    const quote = colon >= 0 ? state.buffer.indexOf('"', colon) : -1;
    const end = quote >= 0 ? findJsonStringEnd(state.buffer, quote) : -1;
    if (end < 0) return false;
    state.tableName = JSON.parse(state.buffer.slice(quote, end + 1)) as string;
    state.buffer = state.buffer.slice(end + 1);
    state.mode = 'seek-rows';
    return true;
}

function seekDexieRows(state: DexieStreamState, onTable?: (table: string) => void): boolean {
    const rowsIndex = state.buffer.indexOf('"rows"');
    if (rowsIndex < 0) {
        state.buffer = state.buffer.slice(-32);
        return false;
    }
    const arrayIndex = state.buffer.indexOf('[', rowsIndex);
    if (arrayIndex < 0) return false;
    state.buffer = state.buffer.slice(arrayIndex + 1);
    state.mode = 'rows';
    resetDexieRowState(state);
    onTable?.(state.tableName);
    return true;
}

function resetDexieRowState(state: DexieStreamState): void {
    state.rowStart = -1;
    state.depth = 0;
    state.inString = false;
    state.escaped = false;
}

async function readDexieRows(
    state: DexieStreamState,
    handlers: Partial<Record<string, DexieRowHandler>>,
): Promise<boolean> {
    const handler = handlers[state.tableName];
    let progress = false;
    for (let index = 0; index < state.buffer.length; index++) {
        const char = state.buffer[index];
        if (advanceStringState(state, char)) continue;
        if (char === '{') {
            if (state.depth === 0) state.rowStart = index;
            state.depth++;
            continue;
        }
        if (char === '}') {
            progress = await finishDexieRow(state, handlers, index) || progress;
            if (progress && state.rowStart === -1) index = -1;
            continue;
        }
        if (state.depth === 0 && char === ']') {
            state.buffer = state.buffer.slice(index + 1);
            state.mode = 'seek-table';
            state.tableName = '';
            return true;
        }
    }
    if (!progress) compactDexieRowBuffer(state);
    return progress;
}

async function finishDexieRow(state: DexieStreamState, handlers: Partial<Record<string, DexieRowHandler>>, index: number): Promise<boolean> {
    state.depth--;
    if (state.depth !== 0 || state.rowStart < 0) return false;
    const handler = handlers[state.tableName];
    if (handler) await handler(JSON.parse(state.buffer.slice(state.rowStart, index + 1)));
    state.buffer = state.buffer.slice(index + 1);
    state.rowStart = -1;
    return true;
}

function advanceStringState(state: DexieStreamState, char: string): boolean {
    if (state.inString) {
        if (state.escaped) state.escaped = false;
        else if (char === '\\') state.escaped = true;
        else if (char === '"') state.inString = false;
        return true;
    }
    if (char !== '"') return false;
    state.inString = true;
    return true;
}

function compactDexieRowBuffer(state: DexieStreamState): void {
    if (state.rowStart > 0) {
        state.buffer = state.buffer.slice(state.rowStart);
        state.rowStart = 0;
    } else if (state.depth === 0 && state.buffer.length > 4096) {
        state.buffer = state.buffer.slice(-4096);
    }
}

function findJsonArrayEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '[') depth++;
        if (char === ']') {
            depth--;
            if (depth === 0) return index;
        }
    }
    return -1;
}

async function streamDexieTablesFromText(
    text: string,
    handlers: Partial<Record<string, DexieRowHandler>>,
    onTable?: (table: string) => void,
): Promise<void> {
    let offset = 0;
    while (true) {
        const tableIndex = text.indexOf('"tableName"', offset);
        if (tableIndex < 0) return;
        const colon = text.indexOf(':', tableIndex);
        const quote = colon >= 0 ? text.indexOf('"', colon) : -1;
        const end = quote >= 0 ? findJsonStringEnd(text, quote) : -1;
        if (end < 0) return;

        const tableName = JSON.parse(text.slice(quote, end + 1)) as string;
        const rowsIndex = text.indexOf('"rows"', end);
        const arrayStart = rowsIndex >= 0 ? text.indexOf('[', rowsIndex) : -1;
        if (arrayStart < 0) return;
        onTable?.(tableName);
        offset = await streamDexieRowsFromText(text, arrayStart, tableName, handlers);
    }
}

async function streamDexieRowsFromText(text: string, arrayStart: number, tableName: string, handlers: Partial<Record<string, DexieRowHandler>>): Promise<number> {
    const handler = handlers[tableName];
    let depth = 0;
    let rowStart = -1;
    let inString = false;
    let escaped = false;
    for (let index = arrayStart + 1; index < text.length; index++) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') {
            if (depth === 0) rowStart = index;
            depth++;
            continue;
        }
        if (char === '}') {
            depth--;
            if (depth === 0 && rowStart >= 0 && handler) await handler(JSON.parse(text.slice(rowStart, index + 1)));
            continue;
        }
        if (depth === 0 && char === ']') return index + 1;
    }
    return text.length;
}

function findJsonStringEnd(value: string, quoteIndex: number): number {
    let escaped = false;
    for (let index = quoteIndex + 1; index < value.length; index++) {
        const char = value[index];
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') return index;
    }
    return -1;
}
