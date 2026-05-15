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
    const tables = readDexieTablesArray(head);
    return tables ? dexieTableRowCounts(tables) : {};
}

function readDexieTablesArray(head: string): unknown[] | null {
    const tablesIndex = head.indexOf('"tables"');
    if (tablesIndex < 0) return null;
    const arrayStart = head.indexOf('[', tablesIndex);
    if (arrayStart < 0) return null;
    const arrayEnd = findJsonArrayEnd(head, arrayStart);
    if (arrayEnd < 0) return null;
    return JSON.parse(head.slice(arrayStart, arrayEnd + 1)) as unknown[];
}

function dexieTableRowCounts(tables: unknown[]): Partial<Record<string, number>> {
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
    let progress = false;
    for (let index = 0; index < state.buffer.length; index++) {
        const action = readDexieRowCharacter(state, index);
        if (action === 'continue') continue;
        const result = await applyDexieRowReadAction(state, handlers, action, index, progress);
        if (result.done) return true;
        progress = result.progress;
        if (result.restart) index = -1;
    }
    if (!progress) compactDexieRowBuffer(state);
    return progress;
}

async function applyDexieRowReadAction(
    state: DexieStreamState,
    handlers: Partial<Record<string, DexieRowHandler>>,
    action: DexieRowReadAction,
    index: number,
    progress: boolean,
): Promise<{ done: boolean; progress: boolean; restart: boolean }> {
    if (action === 'close-array') return { done: true, progress, restart: false };
    if (action !== 'finish-row') return { done: false, progress, restart: false };
    const nextProgress = await finishDexieRow(state, handlers, index) || progress;
    return { done: false, progress: nextProgress, restart: nextProgress && state.rowStart === -1 };
}

type DexieRowReadAction = 'continue' | 'finish-row' | 'close-array' | 'scan';

function readDexieRowCharacter(state: DexieStreamState, index: number): DexieRowReadAction {
    const char = state.buffer[index];
    if (advanceStringState(state, char)) return 'continue';
    if (openDexieRowObject(state, index, char)) return 'continue';
    if (char === '}') return 'finish-row';
    return closeDexieRowsArray(state, index, char) ? 'close-array' : 'scan';
}

function openDexieRowObject(state: DexieStreamState, index: number, char: string): boolean {
    if (char !== '{') return false;
    if (state.depth === 0) state.rowStart = index;
    state.depth++;
    return true;
}

function closeDexieRowsArray(state: DexieStreamState, index: number, char: string): boolean {
    if (state.depth !== 0 || char !== ']') return false;
    state.buffer = state.buffer.slice(index + 1);
    state.mode = 'seek-table';
    state.tableName = '';
    return true;
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
    const state = createJsonArrayScanState();
    for (let index = start; index < text.length; index++) {
        if (scanJsonArrayCharacter(state, text[index])) return index;
    }
    return -1;
}

interface JsonArrayScanState {
    depth: number;
    inString: boolean;
    escaped: boolean;
}

function createJsonArrayScanState(): JsonArrayScanState {
    return { depth: 0, inString: false, escaped: false };
}

function scanJsonArrayCharacter(state: JsonArrayScanState, char: string): boolean {
    if (state.inString) {
        scanJsonArrayStringCharacter(state, char);
        return false;
    }
    if (char === '"') {
        state.inString = true;
        return false;
    }
    if (char === '[') state.depth += 1;
    if (char !== ']') return false;
    state.depth -= 1;
    return state.depth === 0;
}

function scanJsonArrayStringCharacter(state: JsonArrayScanState, char: string): void {
    if (state.escaped) {
        state.escaped = false;
        return;
    }
    if (char === '\\') state.escaped = true;
    if (char === '"') state.inString = false;
}

async function streamDexieTablesFromText(
    text: string,
    handlers: Partial<Record<string, DexieRowHandler>>,
    onTable?: (table: string) => void,
): Promise<void> {
    let offset = 0;
    while (true) {
        const table = nextDexieTableScan(text, offset);
        if (!table) return;
        onTable?.(table.tableName);
        offset = await streamDexieRowsFromText(text, table.arrayStart, table.tableName, handlers);
    }
}

async function streamDexieRowsFromText(text: string, arrayStart: number, tableName: string, handlers: Partial<Record<string, DexieRowHandler>>): Promise<number> {
    const handler = handlers[tableName];
    const state: DexieRowStreamState = { depth: 0, rowStart: -1, inString: false, escaped: false };
    for (let index = arrayStart + 1; index < text.length; index++) {
        const endOffset = await scanDexieRowCharacter(text, state, index, handler);
        if (endOffset !== null) return endOffset;
    }
    return text.length;
}

interface DexieTableScan {
    tableName: string;
    arrayStart: number;
}

function nextDexieTableScan(text: string, offset: number): DexieTableScan | null {
    const tableIndex = text.indexOf('"tableName"', offset);
    if (tableIndex < 0) return null;
    const quote = dexieTableNameQuoteIndex(text, tableIndex);
    if (quote < 0) return null;
    const end = findJsonStringEnd(text, quote);
    if (end < 0) return null;
    const arrayStart = dexieRowsArrayStart(text, end);
    if (arrayStart < 0) return null;
    return { tableName: JSON.parse(text.slice(quote, end + 1)) as string, arrayStart };
}

function dexieTableNameQuoteIndex(text: string, tableIndex: number): number {
    const colon = text.indexOf(':', tableIndex);
    return colon >= 0 ? text.indexOf('"', colon) : -1;
}

function dexieRowsArrayStart(text: string, offset: number): number {
    const rowsIndex = text.indexOf('"rows"', offset);
    return rowsIndex >= 0 ? text.indexOf('[', rowsIndex) : -1;
}

async function scanDexieRowCharacter(
    text: string,
    state: DexieRowStreamState,
    index: number,
    handler: DexieRowHandler | undefined,
): Promise<number | null> {
    const char = text[index];
    if (consumeDexieStringCharacter(state, char)) return null;
    if (openDexieString(state, char)) return null;
    if (char === '{') beginDexieRow(state, index);
    if (char === '}') await finishDexieArrayRow(text, state, index, handler);
    return dexieArrayEndOffset(state, char, index);
}

function dexieArrayEndOffset(state: DexieRowStreamState, char: string, index: number): number | null {
    return state.depth === 0 && char === ']' ? index + 1 : null;
}

interface DexieRowStreamState {
    depth: number;
    rowStart: number;
    inString: boolean;
    escaped: boolean;
}

function consumeDexieStringCharacter(state: DexieRowStreamState, char: string): boolean {
    if (!state.inString) return false;
    if (state.escaped) state.escaped = false;
    else if (char === '\\') state.escaped = true;
    else if (char === '"') state.inString = false;
    return true;
}

function openDexieString(state: DexieRowStreamState, char: string): boolean {
    if (char !== '"') return false;
    state.inString = true;
    return true;
}

function beginDexieRow(state: DexieRowStreamState, index: number): void {
    if (state.depth === 0) state.rowStart = index;
    state.depth++;
}

async function finishDexieArrayRow(text: string, state: DexieRowStreamState, index: number, handler: DexieRowHandler | undefined): Promise<void> {
    state.depth--;
    if (state.depth === 0 && state.rowStart >= 0 && handler) await handler(JSON.parse(text.slice(state.rowStart, index + 1)));
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
