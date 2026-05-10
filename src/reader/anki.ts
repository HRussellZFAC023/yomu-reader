import { escapeHtml } from './dom';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import type { CardState, DictionaryPreference, JPDBCard, JPDBGrade, ReaderSettings } from './types';
import {
    glossaryToHtml,
    glossaryToText,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const ANKI_VERSION = 6;
export const YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

interface AnkiResponse<T> {
    result: T;
    error: string | null;
}

interface AnkiNote {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
    options?: {
        allowDuplicate?: boolean;
        duplicateScope?: string;
    };
    picture?: Array<{
        filename: string;
        data: string;
        fields: string[];
    }>;
}

type AnkiPicture = NonNullable<AnkiNote['picture']>[number];

interface AnkiNoteInfo {
    noteId: number;
    modelName: string;
    tags: string[];
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
    deckName: string;
    queue: number;
    type: number;
    due?: number;
    reps?: number;
    lapses?: number;
    interval?: number;
    note?: number;
}

export interface AnkiExistingNote {
    noteId: number;
    modelName: string;
    deckNames: string[];
    cardIds: number[];
    primaryCardId: number | null;
    state: CardState;
    fields: Record<string, string>;
    tags: string[];
    reps: number;
    lapses: number;
}

export interface AnkiLookupResult {
    state: CardState;
    notes: AnkiExistingNote[];
    primary: AnkiExistingNote | null;
}

export interface AnkiCardContext {
    imageDataUrl?: string;
    localEntries?: YomitanTermEntry[];
    kanjiEntries?: YomitanKanjiEntry[];
    metaEntries?: YomitanMetaEntry[];
    dictionaryPreferences?: DictionaryPreference[];
    sourceUrl?: string;
    sourceTitle?: string;
}

export class AnkiConnectClient {
    private lookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private unavailableUntil = 0;

    constructor(private getSettings: () => ReaderSettings) {}

    async isConnected(): Promise<boolean> {
        try {
            await this.invoke<number>('version');
            return true;
        } catch {
            return false;
        }
    }

    async deckNames(): Promise<string[]> {
        return this.invoke<string[]>('deckNames');
    }

    async modelNames(): Promise<string[]> {
        return this.invoke<string[]>('modelNames');
    }

    async findExistingCards(card: JPDBCard): Promise<AnkiLookupResult> {
        const empty: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        if (Date.now() < this.unavailableUntil) return empty;

        const cacheKey = `${card.spelling}|${card.reading}`;
        const cached = this.lookupCache.get(cacheKey);
        if (cached && Date.now() - cached.at < 45000) return cached.result;

        try {
            const queryTerms = unique([card.spelling, card.reading].filter(Boolean));
            const noteIds = new Set<number>();
            for (const term of queryTerms) {
                const ids = await this.invoke<number[]>('findNotes', { query: quoteAnkiSearch(term) }).catch((): number[] => []);
                ids.forEach(id => noteIds.add(id));
            }
            if (!noteIds.size) {
                this.lookupCache.set(cacheKey, { at: Date.now(), result: empty });
                return empty;
            }

            const notes = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [...noteIds] });
            const matchingNotes = notes.filter(note => noteLooksLikeCard(note, card));
            if (!matchingNotes.length) {
                this.lookupCache.set(cacheKey, { at: Date.now(), result: empty });
                return empty;
            }

            const cardIds = unique(matchingNotes.flatMap(note => note.cards ?? []));
            const cards = cardIds.length
                ? await this.invoke<AnkiCardInfo[]>('cardsInfo', { cards: cardIds }).catch((): AnkiCardInfo[] => [])
                : [];
            const cardsByNote = new Map<number, AnkiCardInfo[]>();
            for (const cardInfo of cards) {
                const noteId = Number(cardInfo.note);
                if (!Number.isFinite(noteId)) continue;
                const list = cardsByNote.get(noteId) ?? [];
                list.push(cardInfo);
                cardsByNote.set(noteId, list);
            }

            const existing = matchingNotes.map(note => {
                const noteCards = cardsByNote.get(note.noteId) ?? [];
                const fields = flattenNoteFields(note.fields);
                const state = stateFromAnkiCards(noteCards);
                return {
                    noteId: note.noteId,
                    modelName: note.modelName,
                    deckNames: unique(noteCards.map(item => item.deckName).filter(Boolean)),
                    cardIds: note.cards ?? [],
                    primaryCardId: pickPrimaryCard(noteCards)?.cardId ?? note.cards?.[0] ?? null,
                    state,
                    fields,
                    tags: note.tags ?? [],
                    reps: noteCards.reduce((sum, item) => sum + Number(item.reps || 0), 0),
                    lapses: noteCards.reduce((sum, item) => sum + Number(item.lapses || 0), 0),
                } satisfies AnkiExistingNote;
            });
            const result: AnkiLookupResult = {
                state: stateFromExistingNotes(existing),
                notes: existing,
                primary: pickPrimaryExistingNote(existing),
            };
            this.lookupCache.set(cacheKey, { at: Date.now(), result });
            return result;
        } catch {
            this.unavailableUntil = Date.now() + 30000;
            return empty;
        }
    }

    async answerCard(cardId: number, grade: JPDBGrade): Promise<void> {
        const ease = ankiEaseFromGrade(grade);
        await this.invoke<null>('answerCards', { answers: [{ cardId, ease }] });
    }

    async browseNote(noteId: number): Promise<void> {
        await this.invoke<unknown>('guiBrowse', { query: `nid:${noteId}` });
    }

    async addCard(card: JPDBCard, sentence = '', options: AnkiCardContext = {}): Promise<number | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) return null;
        await this.ensureDeckAndModel();

        const note: AnkiNote = {
            deckName: settings.ankiDeck || 'よむ',
            modelName: settings.ankiModel || 'よむ Japanese',
            fields: buildYomuAnkiFields(card, sentence, {
                ...options,
                sourceUrl: options.sourceUrl ?? safeLocationHref(),
                sourceTitle: options.sourceTitle ?? safeDocumentTitle(),
                dictionaryPreferences: options.dictionaryPreferences ?? settings.dictionaryPreferences,
            }),
            tags: tagsFromString(settings.ankiTags),
            options: {
                allowDuplicate: false,
                duplicateScope: 'collection',
            },
        };

        const image = options.imageDataUrl ? imageFromDataUrl(options.imageDataUrl, card) : null;
        if (image) note.picture = [image];

        return this.invoke<number | null>('addNote', { note });
    }

    async ensureDeckAndModel(): Promise<void> {
        const settings = this.getSettings();
        const deckName = settings.ankiDeck || 'よむ';
        const modelName = settings.ankiModel || 'よむ Japanese';
        await this.invoke<null>('createDeck', { deck: deckName }).catch(() => null);
        const modelNames = await this.modelNames().catch((): string[] => []);
        if (modelNames.includes(modelName)) {
            await this.ensureModelFields(modelName);
            await this.invoke<null>('updateModelTemplates', { model: { name: modelName, templates: yomuCardTemplates() } });
            await this.invoke<null>('updateModelStyling', { model: { name: modelName, css: yomuCardCss() } });
            return;
        }
        await this.invoke<unknown>('createModel', {
            modelName,
            inOrderFields: YOMU_MODEL_FIELDS,
            css: yomuCardCss(),
            cardTemplates: Object.entries(yomuCardTemplates()).map(([Name, template]) => ({ Name, ...template })),
        });
    }

    private async ensureModelFields(modelName: string): Promise<void> {
        const fieldNames = await this.invoke<string[]>('modelFieldNames', { modelName }).catch((): string[] => []);
        const existing = new Set(fieldNames);
        for (const fieldName of YOMU_MODEL_FIELDS) {
            if (!existing.has(fieldName)) await this.invoke<null>('modelFieldAdd', { modelName, fieldName });
        }
    }

    private async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
        const settings = this.getSettings();
        const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
        const body = JSON.stringify({ action, version: ANKI_VERSION, params });
        const response = await postJson<AnkiResponse<T>>(url, body);
        if (response.error) throw new Error(response.error);
        return response.result;
    }
}

export function captureActiveVideoFrame(): string | undefined {
    const video = Array.from(document.querySelectorAll('video'))
        .filter(item => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0)
        .sort((a, b) => visibleArea(b) - visibleArea(a))[0];
    if (!video) return undefined;
    try {
        const canvas = document.createElement('canvas');
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.84);
    } catch {
        return undefined;
    }
}

function postJson<T>(url: string, body: string): Promise<T> {
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers: { 'Content-Type': 'application/json' },
                data: body,
                responseType: 'json',
                timeout: 5000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(response.response as T);
                    else reject(new Error(`AnkiConnect request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('AnkiConnect timed out.')),
            });
        });
    }

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    }).then(async response => {
        if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
        return response.json() as Promise<T>;
    });
}

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    const dictionaryPreferences = context.dictionaryPreferences ?? [];
    const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
    const sourceUrl = context.sourceUrl ?? '';
    const sourceTitle = context.sourceTitle ?? '';
    return {
        Expression: escapeHtml(card.spelling),
        Reading: card.reading && card.reading !== card.spelling ? escapeHtml(card.reading) : '',
        Meaning: renderJpdbMeanings(card),
        Sentence: renderSentence(sentence, card.spelling),
        Url: escapeHtml(sourceUrl),
        Frequency: renderFrequency(card, context.metaEntries ?? [], dictionaryPreferences),
        PartOfSpeech: escapeHtml(formatPartOfSpeech(card.partOfSpeech) || formatPartOfSpeechDetails(card.partOfSpeech)),
        Image: '',
        JPDB: `<a href="${jpdbUrl}">Open on JPDB</a>`,
        Status: card.cardState.map(state => `<span class="yomu-chip">${escapeHtml(state)}</span>`).join(' '),
        Pitch: renderPitchField(card, context.metaEntries ?? [], dictionaryPreferences),
        DictionaryDefinitions: renderDictionaryDefinitions(context.localEntries ?? [], dictionaryPreferences),
        Kanji: renderKanjiDefinitions(context.kanjiEntries ?? [], dictionaryPreferences),
        Source: renderSource(sourceUrl, sourceTitle),
    };
}

function tagsFromString(value: string): string[] {
    return value.split(/[,\s]+/).map(tag => tag.trim()).filter(Boolean);
}

function imageFromDataUrl(dataUrl: string, card: JPDBCard): AnkiPicture | null {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const safeName = card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
    return {
        filename: `yomu_${safeName}_${Date.now()}.${extension}`,
        data: match[2],
        fields: ['Image'],
    };
}

function visibleArea(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
}

function quoteAnkiSearch(term: string): string {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function flattenNoteFields(fields: AnkiNoteInfo['fields']): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(fields ?? {}).forEach(([name, value]) => {
        out[name] = stripHtml(String(value?.value ?? ''));
    });
    return out;
}

function noteLooksLikeCard(note: AnkiNoteInfo, card: JPDBCard): boolean {
    const fields = flattenNoteFields(note.fields);
    const values = Object.values(fields).map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const exactTargets = unique([card.spelling, card.reading].filter(Boolean));
    if (exactTargets.some(target => values.some(value => value === target))) return true;
    const expression = fields.Expression || fields.Front || fields.Word || fields.Vocab || fields.Term || fields['Expression Reading'];
    if (expression && exactTargets.some(target => expression.includes(target))) return true;
    const reading = fields.Reading || fields.Kana || fields.Yomi;
    return Boolean(reading && card.reading && reading.includes(card.reading));
}

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function stateFromAnkiCards(cards: AnkiCardInfo[]): CardState {
    if (!cards.length) return 'known';
    if (cards.some(card => card.queue === -1)) return 'suspended';
    if (cards.some(card => card.type === 3 || card.queue === 3)) return 'failed';
    if (cards.some(card => card.queue === 1 || card.type === 1)) return 'learning';
    if (cards.some(card => card.queue === 0 || card.type === 0)) return 'new';
    if (cards.some(card => card.queue === 2 && Number(card.due ?? 0) <= 0)) return 'due';
    return 'known';
}

function stateFromExistingNotes(notes: AnkiExistingNote[]): CardState {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended'];
    return order.find(state => notes.some(note => note.state === state)) ?? (notes.length ? 'known' : 'not-in-deck');
}

function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
    const order = (card: AnkiCardInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (card.queue === 2 && Number(card.due ?? 0) <= 0) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function pickPrimaryExistingNote(notes: AnkiExistingNote[]): AnkiExistingNote | null {
    const order = (note: AnkiExistingNote) => {
        if (note.state === 'failed') return 0;
        if (note.state === 'due') return 1;
        if (note.state === 'learning') return 2;
        if (note.state === 'new') return 3;
        if (note.state === 'known') return 4;
        return 5;
    };
    return [...notes].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function ankiEaseFromGrade(grade: JPDBGrade): number {
    switch (grade) {
        case 'nothing':
        case 'fail':
            return 1;
        case 'something':
        case 'hard':
            return 2;
        case 'okay':
        case 'pass':
            return 3;
        case 'easy':
            return 4;
        default:
            return 3;
    }
}

function yomuCardTemplates(): Record<string, { Front: string; Back: string }> {
    return {
        Recognition: {
            Front: `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
    {{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}
    {{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}
</main>`,
            Back: `
{{FrontSide}}
<main class="yomu-card yomu-back">
    {{#Meaning}}<section class="yomu-section"><h2>JPDB</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>Dictionaries</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>Kanji</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>Frequency</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>Pitch</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>Part of speech</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#Status}}<div><strong>Status</strong><span>{{Status}}</span></div>{{/Status}}
        {{#JPDB}}<div><strong>Links</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>Source</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`,
        },
    };
}

function yomuCardCss(): string {
    return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: #f4f7fb;
    background: #15181e;
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: #bac3d0; font-size: 24px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid #323843;
    border-radius: 12px;
    background: #1e232b;
    color: #d8dee8;
}
.yomu-highlight { color: #7ad119; font-weight: 800; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid #303641;
    border-radius: 12px;
    background: #1b2028;
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: #c2cad7;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: #92a0b3;
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: #fff; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: #aab4c2; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid #4b5565;
    border-radius: 999px;
    color: #cdd5e1;
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: #8f9aaa; }
a { color: #7ad119; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #353c47; padding: 4px 6px; }
`;
}

function renderJpdbMeanings(card: JPDBCard): string {
    return card.meanings.slice(0, 8).map(meaning => {
        const pos = formatPartOfSpeech(meaning.partOfSpeech);
        return `<div class="yomu-definition">
            ${pos ? `<span class="yomu-pos">${escapeHtml(pos)}</span>` : ''}
            <div>${escapeHtml(meaning.glosses.join('; '))}</div>
        </div>`;
    }).join('');
}

function renderSentence(sentence: string, expression: string): string {
    if (!sentence) return '';
    if (!expression || !sentence.includes(expression)) return escapeHtml(sentence);
    return sentence.split(expression)
        .map(part => escapeHtml(part))
        .join(`<span class="yomu-highlight">${escapeHtml(expression)}</span>`);
}

function renderDictionaryDefinitions(entries: YomitanTermEntry[], preferences: DictionaryPreference[]): string {
    const groups = groupTermEntriesByDictionary(entries).slice(0, 6);
    return groups.map(([dictionary, items]) => `
        <div class="yomu-dict-group">
            <h3 class="yomu-dict-label">${escapeHtml(dictionaryLabel(dictionary, preferences))}</h3>
            ${items.slice(0, 6).map(entry => `
                <div class="yomu-dict-entry">
                    <div class="yomu-dict-head">
                        <span class="yomu-dict-expression">${escapeHtml(entry.expression)}</span>
                        ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml(entry.reading)}</span>` : ''}
                        ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(' · '))}</span>` : ''}
                    </div>
                    <div class="yomu-glossary">${entry.glossary.slice(0, 5).map(item => `<div>${safeGlossaryHtml(item)}</div>`).join('')}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderKanjiDefinitions(entries: YomitanKanjiEntry[], preferences: DictionaryPreference[]): string {
    const byCharacter = new Map<string, YomitanKanjiEntry[]>();
    for (const entry of entries) {
        const group = byCharacter.get(entry.character) ?? [];
        group.push(entry);
        byCharacter.set(entry.character, group);
    }
    return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
        <div class="yomu-kanji-entry">
            <div class="yomu-dict-head">
                <span class="yomu-kanji-char">${escapeHtml(character)}</span>
                <span class="yomu-dict-label">${escapeHtml(items.map(item => dictionaryLabel(item.dictionary, preferences)).filter(uniqueValue).slice(0, 3).join(' · '))}</span>
            </div>
            ${items.slice(0, 3).map(item => `
                <div>
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">On ${escapeHtml(item.onyomi.join('、'))}</span>` : ''}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> Kun ${escapeHtml(item.kunyomi.join('、'))}</span>` : ''}
                    <div>${item.meanings.slice(0, 8).map(meaning => escapeHtml(meaning)).join('; ')}</div>
                    ${item.tags.length ? `<span class="yomu-tags">${escapeHtml(item.tags.join(' · '))}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderFrequency(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips: string[] = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
        if (entry.mode !== 'freq') continue;
        const value = formatMetaFrequency(entry.data);
        if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function renderPitchField(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips = card.pitchAccent.slice(0, 4).map(pitch => `<span class="yomu-chip">JPDB ${escapeHtml(pitch)}</span>`);
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        const value = formatMetaPitch(entry.data);
        if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function renderSource(sourceUrl: string, sourceTitle: string): string {
    if (!sourceUrl && !sourceTitle) return '';
    if (!sourceUrl) return escapeHtml(sourceTitle);
    const label = sourceTitle || sourceUrl;
    return `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(label)}</a>`;
}

function groupTermEntriesByDictionary(entries: YomitanTermEntry[]): Array<[string, YomitanTermEntry[]]> {
    const grouped = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.dictionary) ?? [];
        group.push(entry);
        grouped.set(entry.dictionary, group);
    }
    return Array.from(grouped.entries());
}

function dictionaryLabel(name: string, preferences: DictionaryPreference[]): string {
    return preferences.find(item => item.name === name)?.alias || name;
}

function uniqueValue<T>(value: T, index: number, array: T[]): boolean {
    return array.indexOf(value) === index;
}

function safeGlossaryHtml(value: unknown): string {
    const html = glossaryToHtml(value);
    return html || escapeHtml(glossaryToText(value));
}

function formatMetaFrequency(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'string') return `#${value}`;
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const display = record.displayValue ?? record.frequency ?? record.value;
    return display == null ? '' : `#${String(display)}`;
}

function formatMetaPitch(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(', ');
    if (typeof record.position === 'number') return String(record.position);
    return '';
}

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}

function safeDocumentTitle(): string {
    return typeof document === 'undefined' ? '' : document.title;
}
