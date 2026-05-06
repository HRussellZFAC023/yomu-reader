import type {
    CardState,
    JPDBCard,
    JPDBGrade,
    JPDBParseResult,
    JPDBRawToken,
    JPDBRawVocabulary,
    JPDBRuby,
    JPDBToken,
} from './types';

const API_BASE = 'https://jpdb.io/api/v1';
const TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana'];
const VOCABULARY_FIELDS = [
    'vid',
    'sid',
    'rid',
    'spelling',
    'reading',
    'frequency_rank',
    'part_of_speech',
    'meanings_chunks',
    'meanings_part_of_speech',
    'card_state',
    'pitch_accent',
];

const SMALL_KANA = new Set('ゃゅょァィゥェォッャュョ');

class LruCache<K, V> {
    private map = new Map<K, V>();

    constructor(private maxSize: number) {}

    get(key: K): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            this.map.delete(key);
            this.map.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) this.map.delete(oldest);
        }
    }

    clear(): void {
        this.map.clear();
    }
}

export class JpdbClient {
    private cardCache = new Map<string, JPDBCard>();
    private parseCache = new LruCache<string, JPDBToken[][]>(250);
    private retryAfter = 0;

    constructor(private getApiKey: () => string) {}

    async parse(paragraphs: string[]): Promise<JPDBToken[][]> {
        const text = paragraphs.map(p => p.trim()).filter(Boolean);
        if (!text.length) return [];

        const cacheKey = text.join('\n');
        const cached = this.parseCache.get(cacheKey);
        if (cached) return cached;

        const raw = await this.request<JPDBParseResult>('parse', {
            text,
            position_length_encoding: 'utf16',
            token_fields: TOKEN_FIELDS,
            vocabulary_fields: VOCABULARY_FIELDS,
        });
        const cards = this.vocabToCards(raw.vocabulary);
        const tokens = this.parseTokens(raw.tokens, cards);
        this.addSentenceInfo(text, tokens);

        for (const card of cards) {
            this.cardCache.set(this.cardKey(card.vid, card.sid), card);
        }

        this.parseCache.set(cacheKey, tokens);
        return tokens;
    }

    async reviewCard(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        await this.request<void>('review', { vid: card.vid, sid: card.sid, grade });
        await this.refreshCard(card);
    }

    async addToDeck(deckId: string, card: JPDBCard, sentence?: string): Promise<void> {
        if (deckId === 'forq') {
            await this.requestByUrl('https://jpdb.io/prioritize', {
                v: card.vid,
                s: card.sid,
                origin: '/',
            });
        } else {
            await this.request<void>('deck/add-vocabulary', {
                id: deckId,
                vocabulary: [[card.vid, card.sid]],
            });
        }

        if (sentence) {
            await this.request<void>('set-card-sentence', {
                vid: card.vid,
                sid: card.sid,
                sentence,
            }).catch(() => undefined);
        }

        await this.refreshCard(card);
    }

    async removeFromDeck(deckId: string, card: JPDBCard): Promise<void> {
        await this.request<void>('deck/remove-vocabulary', {
            id: deckId,
            vocabulary: [[card.vid, card.sid]],
        });
        await this.refreshCard(card);
    }

    getCard(vid: number, sid: number): JPDBCard | undefined {
        return this.cardCache.get(this.cardKey(vid, sid));
    }

    clear(): void {
        this.cardCache.clear();
        this.parseCache.clear();
    }

    private async refreshCard(card: JPDBCard): Promise<void> {
        const parsed = await this.parse([card.spelling]);
        const fresh = parsed.flat().find(token => token.card.vid === card.vid && token.card.sid === card.sid)?.card;
        if (!fresh) return;

        this.cardCache.set(this.cardKey(card.vid, card.sid), fresh);
        card.cardState = fresh.cardState;
    }

    private async request<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
        return this.requestByUrl(`${API_BASE}/${endpoint}`, body);
    }

    private async requestByUrl<T>(url: string, body?: Record<string, unknown>): Promise<T> {
        const token = this.getApiKey();
        if (!token) throw new Error('JPDB API key is not set.');
        if (Date.now() < this.retryAfter) throw new Error('JPDB is rate limited. Try again in a moment.');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (response.status === 429) {
            this.retryAfter = Date.now() + 30_000;
            throw new Error('JPDB rate limit reached.');
        }
        if (response.status === 403) throw new Error('JPDB rejected the API key.');
        if (!response.ok) throw new Error(`JPDB request failed (${response.status}).`);

        const text = await response.text();
        if (!text) return undefined as T;

        const json = JSON.parse(text) as T | { error_message?: string };
        if (json && typeof json === 'object' && 'error_message' in json && json.error_message) {
            throw new Error(json.error_message);
        }
        return json as T;
    }

    private vocabToCards(vocabulary: JPDBRawVocabulary[]): JPDBCard[] {
        return vocabulary.map(([
            vid,
            sid,
            rid,
            spelling,
            reading,
            frequencyRank,
            partOfSpeech,
            meaningsChunks,
            meaningsPartOfSpeech,
            cardState,
            pitchAccent,
        ]) => ({
            vid,
            sid,
            rid,
            spelling,
            reading,
            frequencyRank,
            partOfSpeech,
            meanings: meaningsChunks.map((glosses, index) => ({
                glosses,
                partOfSpeech: meaningsPartOfSpeech[index] ?? [],
            })),
            cardState: cardState?.length ? cardState : ['not-in-deck'],
            pitchAccent: pitchAccent ?? [],
            wordWithReading: null,
        }));
    }

    private parseTokens(rawTokens: JPDBRawToken[][], cards: JPDBCard[]): JPDBToken[][] {
        return rawTokens.map(innerTokens => {
            let lastPitchClass = '';

            return innerTokens.map(([vocabularyIndex, position, length, furigana]) => {
                const card = cards[vocabularyIndex];
                let offset = position;
                const rubies: JPDBRuby[] = furigana === null
                    ? []
                    : furigana.flatMap(part => {
                        if (typeof part === 'string') {
                            offset += part.length;
                            return [];
                        }

                        const [base, ruby] = part;
                        const start = offset;
                        const end = (offset = start + base.length);
                        return [{ text: ruby, start, end, length: base.length }];
                    });

                const isParticle = card.partOfSpeech.includes('prt');
                const pitchClass = isParticle ? '' : getPitchClass(card.pitchAccent, card.reading);
                lastPitchClass = pitchClass || lastPitchClass;

                const token: JPDBToken = {
                    card,
                    start: position,
                    end: position + length,
                    length,
                    rubies,
                    pitchClass: lastPitchClass,
                };
                assignWordWithReading(token);
                return token;
            });
        });
    }

    private addSentenceInfo(paragraphs: string[], tokens: JPDBToken[][]): void {
        paragraphs.forEach((paragraph, index) => {
            const tokenData = tokens[index] ?? [];
            const sentences = splitJapaneseSentences(paragraph);
            if (sentences.length === 1) {
                tokenData.forEach(token => { token.sentence = sentences[0]; });
                return;
            }

            let offset = 0;
            for (const sentence of sentences) {
                const compare = sentence.replace(/(^[「『])|([。！？」』]$)/g, '');
                const relativeStart = paragraph.slice(offset).indexOf(compare);
                if (relativeStart === -1) {
                    offset += sentence.length;
                    continue;
                }

                const start = offset + relativeStart;
                const end = start + sentence.length;
                for (const token of tokenData) {
                    if (token.start >= start && token.end <= end) token.sentence = sentence;
                }
                offset += sentence.length;
            }
        });
    }

    private cardKey(vid: number, sid: number): string {
        return `${vid}/${sid}`;
    }
}

export function splitJapaneseSentences(text: string): string[] {
    const sentences: string[] = [];
    let start = 0;
    let quote: '」' | '』' | null = null;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '「') quote = '」';
        if (char === '『') quote = '』';

        if (quote) {
            if (char === quote) {
                const next = text[index + 1];
                quote = null;
                if (!next || /\s/.test(next) || !/[、，]/.test(next)) {
                    sentences.push(text.slice(start, index + 1).trim());
                    start = index + 1;
                }
            }
            continue;
        }

        if ('。！？'.includes(char)) {
            const next = text[index + 1];
            const end = next === '」' || next === '』' ? index + 2 : index + 1;
            sentences.push(text.slice(start, end).trim());
            start = end;
            if (next === '」' || next === '』') index++;
        }
    }

    const tail = text.slice(start).trim();
    if (tail) sentences.push(tail);

    return sentences.filter(Boolean).length ? sentences.filter(Boolean) : [text];
}

export function getPitchClass(pitchAccent: string[], reading: string): string {
    if (!pitchAccent.length) return '';

    const [pitch] = pitchAccent;
    const parts = pitch.split('');
    const first = parts.shift();
    const last = parts.pop();
    if (!first || !last) return '';

    if (reading.length > 1 && SMALL_KANA.has(reading.charAt(1)) && first === parts[0]) {
        parts.shift();
    }

    const rises = (pitch.match(/LH/g) ?? []).length;
    const drops = (pitch.match(/HL/g) ?? []).length;
    const startsLow = first === 'L';
    const startsHigh = !startsLow;
    const endsLow = last === 'L';
    const endsHigh = !endsLow;
    const allHigh = !parts.includes('L');

    if (reading.length === 1 && pitch === 'HL') return 'odaka';
    if (startsHigh && drops === 1 && parts[0] === 'L') return 'atamadaka';
    if (startsLow && endsLow && rises === 1) return 'nakadaka';
    if (startsLow && rises === 1 && (endsLow || parts.length === 1)) return 'odaka';
    if (startsLow && allHigh && endsHigh) return 'heiban';
    if (rises > 1 || drops > 1) return 'kifuku';
    return '';
}

function assignWordWithReading(token: JPDBToken): void {
    const { card, rubies, start: offset } = token;
    if (!rubies.length) return;

    const word = Array.from(card.spelling);
    for (let i = rubies.length - 1; i >= 0; i--) {
        const { text, start, length } = rubies[i];
        word.splice(start - offset + length, 0, `[${text}]`);
    }
    card.wordWithReading = word.join('');
}
