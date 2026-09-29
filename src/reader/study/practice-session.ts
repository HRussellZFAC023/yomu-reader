import { createStorageCoordinationId } from '../app/gm-storage-lease';
import { PracticeSessionConflict, PracticeSessionStore } from './practice-session-store';
import { buildNewTabRecallCloze, evaluateNewTabRecallAnswer, type NewTabRecallOutcome } from '../newtab/recall-practice';

export type PracticePurpose = 'recognition' | 'cloze' | 'writing' | 'listening' | 'speaking';

export interface PracticeMaterial {
    readonly id: string;
    readonly language: string;
    readonly spelling: string;
    readonly reading: string;
    readonly meaning: string;
    readonly meaningLanguage?: string;
    readonly sentence?: string;
    readonly audio?: Blob;
}

interface PreparedPracticeItem extends PracticeMaterial {
    readonly prompt: string;
    readonly promptLanguage: string;
}

export interface PracticeResponse {
    readonly draft: string;
    readonly revealed: boolean;
    readonly attempts: number;
    readonly first?: { readonly text: string; readonly outcome: NewTabRecallOutcome; readonly assisted: boolean };
    readonly latest?: NewTabRecallOutcome;
    readonly selfCheck?: 'recalled' | 'again';
    readonly skipped?: boolean;
}

export interface PracticeSessionRecord {
    readonly version: 1;
    readonly id: string;
    readonly revision: number;
    readonly turn: string;
    readonly purpose: PracticePurpose;
    readonly title: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly material: readonly PracticeMaterial[];
    readonly items: readonly PreparedPracticeItem[];
    readonly ineligible: readonly string[];
    readonly responses: Readonly<Record<string, PracticeResponse>>;
    readonly position: number;
    readonly paused: boolean;
}

export interface PracticeSessionView {
    readonly id: string;
    readonly turn: string;
    readonly purpose: PracticePurpose;
    readonly title: string;
    readonly status: 'ready' | 'saving' | 'paused' | 'complete' | 'conflict' | 'save-failed';
    readonly phase: 'active' | 'paused' | 'complete';
    readonly transitionPending: boolean;
    readonly position: number;
    readonly total: number;
    readonly sourceTotal: number;
    readonly ineligible: number;
    readonly current: {
        readonly id: string;
        readonly prompt: string;
        readonly language: string;
        readonly audio?: Blob;
        readonly response: PracticeResponse;
        readonly answer?: { readonly spelling: string; readonly reading: string; readonly meaning: string; readonly sentence?: string };
    } | null;
}

export type PracticeAction =
    | { readonly kind: 'draft'; readonly text: string }
    | { readonly kind: 'answer'; readonly text: string }
    | { readonly kind: 'reveal' }
    | { readonly kind: 'self-check'; readonly outcome: 'recalled' | 'again' }
    | { readonly kind: 'next' | 'skip' | 'pause' | 'continue' }
;

export type PracticeCommand = { readonly turn: string } & PracticeAction;

export type PracticeCommandResult =
    | { readonly kind: 'applied'; readonly view: PracticeSessionView }
    | { readonly kind: 'rejected'; readonly reason: 'stale' | 'invalid' | 'closed' | 'storage' | 'conflict'; readonly view: PracticeSessionView };

export type PracticeStart = { readonly purpose: PracticePurpose } & (
    | { readonly material: readonly PracticeMaterial[]; readonly title: string; readonly fromSession?: never }
    | { readonly fromSession: string; readonly material?: never; readonly title?: never }
);

const PURPOSES: readonly PracticePurpose[] = ['recognition', 'cloze', 'writing', 'listening', 'speaking'];
const EMPTY_RESPONSE: PracticeResponse = { draft: '', revealed: false, attempts: 0 };

export class PracticeSessions {
    private readonly store: PracticeSessionStore;
    constructor(factory: IDBFactory = indexedDB) { this.store = new PracticeSessionStore(factory); }

    async start(request: PracticeStart): Promise<PracticeSession> {
        const { purpose } = request;
        if (!PURPOSES.includes(purpose)) throw new TypeError('Unsupported practice purpose.');
        const source = request.fromSession ? await this.read(request.fromSession) : null;
        const selection = source?.material ?? request.material;
        const title = source?.title ?? request.title;
        if (!Array.isArray(selection) || !selection.every(validMaterial) || typeof title !== 'string') throw new TypeError('Invalid practice selection.');
        const material = selection.map(copyMaterial);
        const items: PreparedPracticeItem[] = [];
        const ineligible: string[] = [];
        const ids = new Set<string>();
        for (const candidate of material) {
            if (!candidate.id || ids.has(candidate.id)) throw new TypeError('Practice material must have unique identities.');
            ids.add(candidate.id);
            const item = prepareItem(purpose, candidate);
            if (item) items.push(item);
            else ineligible.push(candidate.id);
        }
        if (!items.length) throw Object.assign(new Error('No selected material is ready for this practice.'), { code: 'PRACTICE_NO_MATERIAL' });
        const now = Date.now();
        const record: PracticeSessionRecord = {
            version: 1, id: createStorageCoordinationId(), turn: createStorageCoordinationId(), revision: 0,
            purpose, title, createdAt: now, updatedAt: now, material, items, ineligible, responses: {}, position: 0, paused: false,
        };
        await this.store.write(record, null);
        return new PracticeSession(record, this.store);
    }

    async resume(id: string): Promise<PracticeSession> {
        return new PracticeSession(await this.read(id), this.store);
    }

    private async read(id: string): Promise<PracticeSessionRecord> {
        const value = await this.store.read(id);
        if (!validRecord(value) || value.id !== id) throw new Error('This practice session could not be restored.');
        return value;
    }

    async list(): Promise<ReadonlyArray<{ id: string; title: string; purpose: PracticePurpose; position: number; total: number; sourceTotal: number; updatedAt: number }>> {
        const records = await this.store.list();
        if (!records.every(validSummary)) throw new Error('A saved practice session could not be read.');
        return records.map(record => ({
            id: record.id, title: record.title, purpose: record.purpose, position: record.position,
            total: record.itemCount, sourceTotal: record.materialCount, updatedAt: record.updatedAt,
        })).sort((a, b) => b.updatedAt - a.updatedAt);
    }
}

export class PracticeSession {
    private serial: Promise<unknown> = Promise.resolve();
    private readonly listeners = new Set<(view: PracticeSessionView) => void>();
    private state: 'idle' | 'saving' | 'save-failed' | 'conflict' = 'idle';
    private closed = false;
    private pendingDraft?: { item: string; text: string };
    private pendingTransitions = 0;

    constructor(private record: PracticeSessionRecord, private readonly store: PracticeSessionStore) {}

    view(): PracticeSessionView {
        const record = this.record;
        const item = record.items[record.position];
        const saved = responseFor(record, item?.id ?? '');
        const response = this.pendingDraft && this.pendingDraft.item === item?.id ? { ...saved, draft: this.pendingDraft.text } : saved;
        const phase = record.position >= record.items.length ? 'complete' : record.paused ? 'paused' : 'active';
        const status = this.state !== 'idle' ? this.state
            : this.pendingDraft || this.pendingTransitions ? 'saving'
            : phase === 'active' ? 'ready' : phase;
        return {
            id: record.id, turn: record.turn, purpose: record.purpose, title: record.title, status, phase,
            transitionPending: this.pendingTransitions > 0,
            position: record.position, total: record.items.length, sourceTotal: record.material.length, ineligible: record.ineligible.length,
            current: item ? {
                id: item.id, prompt: item.prompt, language: item.promptLanguage, audio: item.audio,
                response: { ...response, ...(response.first ? { first: { ...response.first } } : {}) },
                ...(response.revealed ? { answer: {
                    spelling: item.spelling, reading: item.reading, meaning: item.meaning, sentence: item.sentence,
                } } : {}),
            } : null,
        };
    }

    subscribe(listener: (view: PracticeSessionView) => void): () => void {
        this.listeners.add(listener);
        try { listener(this.view()); }
        catch (error) { this.listeners.delete(listener); throw error; }
        return () => this.listeners.delete(listener);
    }

    dispatch(command: PracticeCommand): Promise<PracticeCommandResult> {
        if (this.closed) return Promise.resolve(this.rejected('closed'));
        if (this.state === 'conflict') return Promise.resolve(this.rejected('conflict'));
        if (this.pendingTransitions || command.turn !== this.record.turn) return Promise.resolve(this.rejected('stale'));
        const item = this.record.items[this.record.position];
        let publish = false;
        if (!this.record.paused && item
            && (this.record.purpose === 'cloze' || this.record.purpose === 'writing')
            && (command.kind === 'draft' || command.kind === 'answer') && typeof command.text === 'string'
            && (command.kind === 'draft' || command.text.trim())) {
            this.pendingDraft = { item: item.id, text: command.text };
            this.state = 'saving';
            publish = true;
        }
        const result = this.enqueue(() => this.apply(command), command.kind !== 'draft');
        if (publish) this.emit();
        return result;
    }

    /** Lifecycle pause follows queued work; UI controls still carry a turn ticket. */
    pause(): Promise<PracticeCommandResult> {
        return this.enqueue(() => {
            if (this.closed) return Promise.resolve(this.rejected('closed'));
            if (this.state === 'conflict') return Promise.resolve(this.rejected('conflict'));
            if (this.record.paused || this.record.position === this.record.items.length) {
                return Promise.resolve({ kind: 'applied', view: this.view() });
            }
            return this.apply({ kind: 'pause', turn: this.record.turn });
        }, true);
    }

    private enqueue(runOperation: () => Promise<PracticeCommandResult>, transition = false): Promise<PracticeCommandResult> {
        if (transition) this.pendingTransitions += 1;
        const run = this.serial.then(runOperation).then(result => {
            if (transition) this.pendingTransitions -= 1;
            const settled = { ...result, view: this.view() };
            this.emit();
            return settled;
        }, error => {
            if (transition) this.pendingTransitions -= 1;
            this.emit();
            throw error;
        });
        this.serial = run.catch(() => undefined);
        if (transition) this.emit();
        return run;
    }

    close(): void { this.closed = true; this.listeners.clear(); }

    private async apply(command: PracticeCommand): Promise<PracticeCommandResult> {
        if (this.closed) return this.rejected('closed');
        if (this.state === 'conflict') return this.rejected('conflict');
        if (command.turn !== this.record.turn) return this.rejected('stale');
        if (command.kind === 'draft' && this.pendingDraft && command.text !== this.pendingDraft.text) return this.rejected('stale');
        const base = this.pendingDraft ? {
            ...this.record, responses: { ...this.record.responses, [this.pendingDraft.item]: {
                ...responseFor(this.record, this.pendingDraft.item), draft: this.pendingDraft.text,
            } },
        } : this.record;
        const next = transition(base, command);
        if (!next) {
            if (command.kind === 'answer' && this.pendingDraft?.text === command.text) this.pendingDraft = undefined;
            if (!this.pendingDraft && this.state === 'saving') this.state = 'idle';
            return this.rejected('invalid');
        }
        this.state = 'saving';
        this.emit();
        try {
            await this.store.write(next, this.record.revision);
            this.record = next;
            if (this.pendingDraft && responseFor(next, this.pendingDraft.item).draft === this.pendingDraft.text) this.pendingDraft = undefined;
            this.state = 'idle';
            return { kind: 'applied', view: this.view() };
        } catch (error) {
            this.state = error instanceof PracticeSessionConflict ? 'conflict' : 'save-failed';
            return this.rejected(this.state === 'conflict' ? 'conflict' : 'storage');
        }
    }

    private rejected(reason: Extract<PracticeCommandResult, { kind: 'rejected' }>['reason']): PracticeCommandResult {
        return { kind: 'rejected', reason, view: this.view() };
    }

    private emit(): void {
        for (const listener of this.listeners) {
            try { listener(this.view()); } catch { /* Rendering cannot undo a committed response. */ }
        }
    }
}

function prepareItem(purpose: PracticePurpose, material: PracticeMaterial): PreparedPracticeItem | null {
    const spelling = material.spelling.trim();
    const meaning = material.meaning.trim();
    if (!spelling || !meaning || !material.language) return null;
    if ((purpose === 'listening' || purpose === 'speaking') && !validAudio(material.audio)) return null;
    const cloze = purpose === 'cloze' ? buildNewTabRecallCloze(material, material.sentence ?? '') : null;
    if (cloze && !cloze.hasCloze) return null;
    const prompt = cloze ? `${cloze.before}＿＿${cloze.after}` : purpose === 'writing' ? meaning
        : purpose === 'listening' ? '' : spelling;
    return {
        id: material.id, language: material.language, spelling, reading: material.reading.trim(), meaning,
        ...(material.meaningLanguage ? { meaningLanguage: material.meaningLanguage } : {}),
        ...(material.sentence ? { sentence: material.sentence } : {}),
        ...(material.audio && (purpose === 'listening' || purpose === 'speaking') ? { audio: material.audio } : {}),
        prompt, promptLanguage: purpose === 'writing' ? material.meaningLanguage ?? 'und' : material.language,
    };
}

function transition(record: PracticeSessionRecord, command: PracticeCommand): PracticeSessionRecord | null {
    const item = record.items[record.position];
    if (!item || record.paused && command.kind !== 'continue') return null;
    const previous = responseFor(record, item.id);
    let response = previous;
    let position = record.position;
    let paused = record.paused;
    switch (command.kind) {
        case 'draft':
            if (typeof command.text !== 'string' || (record.purpose !== 'cloze' && record.purpose !== 'writing')) return null;
            response = { ...previous, draft: command.text }; break;
        case 'answer': {
            if (typeof command.text !== 'string' || (record.purpose !== 'cloze' && record.purpose !== 'writing')) return null;
            const evaluation = evaluateNewTabRecallAnswer(item, command.text);
            if (evaluation.outcome === 'empty') return null;
            response = {
                ...previous, draft: command.text, attempts: previous.attempts + 1, latest: evaluation.outcome,
                first: previous.first ?? { text: command.text, outcome: evaluation.outcome, assisted: previous.revealed },
                revealed: previous.revealed || evaluation.outcome === 'correct' || evaluation.outcome === 'accepted',
            };
            break;
        }
        case 'reveal': response = { ...previous, revealed: true }; break;
        case 'self-check':
            if (!previous.revealed || (command.outcome !== 'recalled' && command.outcome !== 'again')) return null;
            response = { ...previous, selfCheck: command.outcome }; position += 1; break;
        case 'next':
            if (!previous.revealed || !previous.attempts) return null;
            position += 1; break;
        case 'skip': response = { ...previous, skipped: true }; position += 1; break;
        case 'pause': paused = true; break;
        case 'continue': if (!paused) return null; paused = false; break;
        default: return null;
    }
    return {
        ...record, position, paused, revision: record.revision + 1, updatedAt: Date.now(),
        turn: command.kind === 'draft' ? record.turn : createStorageCoordinationId(),
        responses: { ...record.responses, [item.id]: response },
    };
}

function responseFor(record: PracticeSessionRecord, id: string): PracticeResponse {
    return Object.hasOwn(record.responses, id) ? record.responses[id]! : EMPTY_RESPONSE;
}

function validAudio(value: unknown): value is Blob {
    return value instanceof Blob && value.size > 0 && value.type.startsWith('audio/');
}

function validMaterial(value: unknown): value is PracticeMaterial {
    if (!value || typeof value !== 'object') return false;
    const material = value as Partial<PracticeMaterial>;
    return typeof material.id === 'string' && !!material.id
        && typeof material.spelling === 'string' && typeof material.reading === 'string'
        && typeof material.meaning === 'string' && typeof material.language === 'string'
        && (material.meaningLanguage === undefined || typeof material.meaningLanguage === 'string')
        && (material.sentence === undefined || typeof material.sentence === 'string')
        && (material.audio === undefined || validAudio(material.audio));
}

function copyMaterial(material: PracticeMaterial): PracticeMaterial {
    return {
        id: material.id, language: material.language, spelling: material.spelling, reading: material.reading, meaning: material.meaning,
        ...(material.meaningLanguage ? { meaningLanguage: material.meaningLanguage } : {}),
        ...(material.sentence ? { sentence: material.sentence } : {}),
        ...(material.audio ? { audio: material.audio } : {}),
    };
}

function validRecord(value: unknown): value is PracticeSessionRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<PracticeSessionRecord>;
    return record.version === 1 && typeof record.id === 'string' && typeof record.turn === 'string'
        && typeof record.title === 'string' && PURPOSES.includes(record.purpose as PracticePurpose)
        && Number.isSafeInteger(record.revision) && Number(record.revision) >= 0
        && Number.isSafeInteger(record.position) && Number(record.position) >= 0
        && Array.isArray(record.material) && record.material.every(validMaterial)
        && new Set(record.material.map(item => item.id)).size === record.material.length
        && Array.isArray(record.items) && record.items.length > 0 && Number(record.position) <= record.items.length
        && new Set(record.items.map(item => item?.id)).size === record.items.length
        && record.items.every(item => item && typeof item.id === 'string' && !!item.id && typeof item.prompt === 'string' && typeof item.promptLanguage === 'string'
            && typeof item.spelling === 'string' && typeof item.reading === 'string' && typeof item.meaning === 'string' && typeof item.language === 'string')
        && (record.purpose !== 'listening' && record.purpose !== 'speaking' || record.items.every(item => validAudio(item.audio)))
        && Array.isArray(record.ineligible) && record.ineligible.every(id => typeof id === 'string')
        && !!record.responses && typeof record.responses === 'object' && !Array.isArray(record.responses)
        && Object.entries(record.responses).every(([id, response]) => record.items!.some(item => item.id === id) && validResponse(response))
        && typeof record.paused === 'boolean' && Number.isFinite(record.createdAt) && Number.isFinite(record.updatedAt);
}

function validSummary(value: unknown): value is Pick<PracticeSessionRecord, 'id' | 'title' | 'purpose' | 'position' | 'updatedAt'> & { itemCount: number; materialCount: number } {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return record.version === 1 && typeof record.id === 'string' && typeof record.title === 'string'
        && PURPOSES.includes(record.purpose as PracticePurpose) && Number.isSafeInteger(record.position)
        && Number(record.position) >= 0 && Number.isSafeInteger(record.itemCount) && Number(record.itemCount) > 0
        && Number.isSafeInteger(record.materialCount) && Number(record.materialCount) >= Number(record.itemCount)
        && Number(record.position) <= Number(record.itemCount) && Number.isFinite(record.updatedAt);
}

function validResponse(value: unknown): value is PracticeResponse {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<PracticeResponse>;
    return typeof response.draft === 'string' && typeof response.revealed === 'boolean'
        && Number.isSafeInteger(response.attempts) && Number(response.attempts) >= 0
        && (response.latest === undefined || ['correct', 'accepted', 'incorrect'].includes(response.latest))
        && (response.selfCheck === undefined || response.selfCheck === 'recalled' || response.selfCheck === 'again')
        && (response.skipped === undefined || typeof response.skipped === 'boolean')
        && (response.first === undefined || !!response.first && typeof response.first.text === 'string'
            && ['correct', 'accepted', 'incorrect'].includes(response.first.outcome) && typeof response.first.assisted === 'boolean');
}
