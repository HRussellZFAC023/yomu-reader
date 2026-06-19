import { stablePositiveHashId } from '../core/stable-hash';
import type { JPDBCard, JPDBToken } from '../app/types';
import type { NestedParsePlan } from './nested-text-parse';

const SETTINGS_FALLBACK_READINGS = [
    ['日本語', 'にほんご'],
    ['読み取り', 'よみとり'],
    ['読み上げ', 'よみあげ'],
    ['忘れない', 'わすれない'],
    ['変更', 'へんこう'],
    ['検索', 'けんさく'],
    ['設定', 'せってい'],
    ['外観', 'がいかん'],
    ['音声', 'おんせい'],
    ['表示', 'ひょうじ'],
    ['再生', 'さいせい'],
    ['翻訳', 'ほんやく'],
    ['画像', 'がぞう'],
    ['例文', 'れいぶん'],
    ['単語', 'たんご'],
    ['漢字', 'かんじ'],
    ['採掘', 'さいくつ'],
    ['学習', 'がくしゅう'],
    ['復習', 'ふくしゅう'],
    ['評価', 'ひょうか'],
    ['辞書', 'じしょ'],
    ['拡張', 'かくちょう'],
    ['選択', 'せんたく'],
    ['保存', 'ほぞん'],
    ['有効', 'ゆうこう'],
    ['追加', 'ついか'],
    ['新規', 'しんき'],
    ['既知', 'きち'],
    ['失敗', 'しっぱい'],
    ['下線', 'かせん'],
    ['字幕', 'じまく'],
    ['語句', 'ごく'],
    ['動画', 'どうが'],
    ['自動', 'じどう'],
    ['文脈', 'ぶんみゃく'],
    ['作成', 'さくせい'],
    ['表面', 'おもてめん'],
    ['裏面', 'うらめん'],
    ['意味', 'いみ'],
    ['前', 'まえ'],
    ['次', 'つぎ'],
    ['診断', 'しんだん'],
    ['便利', 'べんり'],
    ['寄付', 'きふ'],
    ['言葉', 'ことば'],
    ['毎日', 'まいにち'],
    ['勉強', 'べんきょう'],
    ['上手', 'じょうず'],
    ['新しい', 'あたらしい'],
    ['読む', 'よむ'],
    ['選ぶ', 'えらぶ'],
    ['開く', 'ひらく'],
    ['色', 'いろ'],
] as const;

const SORTED_SETTINGS_FALLBACK_READINGS = [...SETTINGS_FALLBACK_READINGS]
    .sort((left, right) => right[0].length - left[0].length || left[0].localeCompare(right[0]));

export function supplementSettingsFallbackTokens(
    targets: NestedParsePlan['targets'],
    parsed: JPDBToken[][],
): JPDBToken[][] {
    return targets.map((target, index) => supplementSettingsTargetTokens(target.text, parsed[index] ?? []));
}

export function parsedSettingsTargetsForCurrentPlan(
    previousPlan: NestedParsePlan,
    previousParsed: JPDBToken[][],
    currentPlan: NestedParsePlan,
): JPDBToken[][] {
    const parsedByText = new Map<string, JPDBToken[][]>();
    previousPlan.targets.forEach((target, index) => {
        const queue = parsedByText.get(target.text) ?? [];
        queue.push(previousParsed[index] ?? []);
        parsedByText.set(target.text, queue);
    });
    return currentPlan.targets.map(target => parsedByText.get(target.text)?.shift() ?? []);
}

function supplementSettingsTargetTokens(text: string, tokens: JPDBToken[]): JPDBToken[] {
    const protectedRanges = tokens.filter(isHydratedSettingsToken).map(tokenRange);
    const generated: JPDBToken[] = [];
    const occupied = [...protectedRanges];
    for (const [surface, reading] of SORTED_SETTINGS_FALLBACK_READINGS) {
        let start = text.indexOf(surface);
        while (start >= 0) {
            const end = start + surface.length;
            const range = { start, end };
            if (!rangesOverlapAny(range, occupied)) {
                generated.push(settingsFallbackToken(surface, reading, start, text));
                occupied.push(range);
            }
            start = text.indexOf(surface, start + surface.length);
        }
    }
    if (!generated.length) return tokens;
    const kept = tokens.filter(token => isHydratedSettingsToken(token) || !rangesOverlapAny(tokenRange(token), generated.map(tokenRange)));
    return [...kept, ...generated].sort((left, right) => left.start - right.start || right.length - left.length);
}

function isHydratedSettingsToken(token: JPDBToken): boolean {
    return Boolean(token.rubies.length || (token.card.reading && token.card.reading !== token.card.spelling) || token.pitchClass);
}

function settingsFallbackToken(surface: string, reading: string, start: number, sentence: string): JPDBToken {
    const card = settingsFallbackCard(surface, reading);
    const end = start + surface.length;
    return {
        card,
        start,
        end,
        length: surface.length,
        rubies: reading !== surface ? [{ text: reading, start, end, length: surface.length }] : [],
        pitchClass: 'heiban',
        sentence,
    };
}

function settingsFallbackCard(surface: string, reading: string): JPDBCard {
    const id = -stablePositiveHashId(`settings-fallback\n${surface}\n${reading}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling: surface,
        reading,
        frequencyRank: null,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
        fallbackLookupTerms: [surface],
    };
}

function tokenRange(token: Pick<JPDBToken, 'start' | 'end'>): { start: number; end: number } {
    return { start: token.start, end: token.end };
}

function rangesOverlapAny(range: { start: number; end: number }, ranges: readonly { start: number; end: number }[]): boolean {
    return ranges.some(candidate => range.start < candidate.end && candidate.start < range.end);
}
