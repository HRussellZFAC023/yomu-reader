/**
 * Yomu Academy — bond scenes (social links).
 *
 * Each character has a ladder of short authored scenes keyed by bond rank.
 * A scene is 4–8 beats, gives bond points once, and always contains one
 * genuinely useful Japanese moment. Copy is human and specific; no product
 * prose, no disclaimers. Scenes never gate learning content.
 */

import type { SceneScript } from '../engine/script';

export interface BondSceneEntry {
    character: string;
    /** Minimum bond rank to see this scene (0 = first meeting). */
    rank: number;
    areaId: string;
    scene: SceneScript;
}

export const BOND_SCENES: readonly BondSceneEntry[] = [
    {
        character: 'rie',
        rank: 0,
        areaId: 'classroom',
        scene: {
            id: 'bond-rie-0-marking',
            band: 'n5',
            nodes: [
                { kind: 'stage', plate: 'classroom__evening-lamplit', sprites: [{ character: 'rie', expression: 'thinking', side: 'center' }] },
                { kind: 'line', en: 'Class ended twenty minutes ago. Rie-sensei is still at the desk, marking a stack of worksheets with a red pen.' },
                { kind: 'line', speaker: 'rie', expression: 'surprised', ja: 'あら。まだいたんですか。', en: 'Oh — you\'re still here?' },
                { kind: 'line', speaker: 'rie', expression: 'happy', ja: 'ちょうどいい。おちゃ、のみますか。', en: 'Perfect timing. Tea?', note: 'のみますか — "will you drink?" Offering something is often just the verb + ますか.' },
                { kind: 'line', en: 'She pours two cups from a thermos that has clearly seen a decade of service. On her desk: a half-eaten cup noodle, and a plant growing out of a second one.' },
                { kind: 'line', speaker: 'rie', expression: 'embarrassed', ja: 'ひみつですよ。', en: 'That\'s a secret, by the way.' },
                {
                    kind: 'choice',
                    options: [
                        { id: 'promise', ja: 'ひみつです。', en: 'Your secret is safe.', set: { 'flag:rie-noodle-secret': true } },
                        { id: 'tease', en: 'The plant one is my favourite.' },
                    ],
                },
                { kind: 'line', speaker: 'rie', expression: 'laughing', ja: 'はははは。', en: '' },
                { kind: 'line', speaker: 'rie', expression: 'neutral', en: 'She goes back to the marking. Every few papers, she draws a big red flower on one — the hanamaru. You decide you want one.' },
                { kind: 'end', result: { 'bond:rie': 8 } },
            ],
        },
    },
    {
        character: 'aakash',
        rank: 0,
        areaId: 'cafe',
        scene: {
            id: 'bond-aakash-0-citypop',
            band: 'n5',
            nodes: [
                { kind: 'stage', plate: 'cafe__day-open', sprites: [{ character: 'aakash', expression: 'listening', side: 'right' }] },
                { kind: 'line', en: 'Aakash is at the corner table, one earbud in, nodding to something. He waves you over.' },
                { kind: 'line', speaker: 'aakash', expression: 'speaking', ja: 'これ、きいて。', en: 'Listen to this.', note: 'きいて — the て-form of きく (to listen) used as a casual request.' },
                { kind: 'line', en: 'He hands you the earbud. It\'s city pop — bright horns, a bassline from 1984, a singer who sounds like summer.' },
                { kind: 'line', speaker: 'aakash', expression: 'happy', ja: 'いいでしょう？', en: 'Good, right?' },
                {
                    kind: 'choice',
                    options: [
                        { id: 'love', ja: 'いいですね！', en: 'It\'s great!', set: { 'flag:aakash-citypop': true } },
                        { id: 'honest', ja: 'まあまあです。', en: 'It\'s... okay.' },
                    ],
                },
                { kind: 'line', speaker: 'aakash', expression: 'determined', en: 'Either way, he\'s already queuing three more songs. "The lyrics are basically N5, you know. Best textbook there is."' },
                { kind: 'end', result: { 'bond:aakash': 8 } },
            ],
        },
    },
    {
        character: 'tom',
        rank: 0,
        areaId: 'campus',
        scene: {
            id: 'bond-tom-0-chestnut',
            band: 'n5',
            nodes: [
                { kind: 'stage', plate: 'campus-entrance__blue-hour-arrival', sprites: [{ character: 'tom', expression: 'happy', side: 'left' }] },
                { kind: 'line', en: 'Tom is on the quad steps, phone out, grinning at it.' },
                { kind: 'line', speaker: 'tom', expression: 'speaking', ja: 'クリの写真、見る？', en: 'Wanna see a photo of Chestnut?', note: '見る？ — plain form + rising tone is the casual "wanna...?" question.' },
                { kind: 'line', en: 'You are shown forty-one photos of a small brown dog. They are, honestly, all excellent.' },
                { kind: 'line', speaker: 'tom', expression: 'laughing', ja: 'かわいいでしょう。', en: 'Cute, right?' },
                { kind: 'line', speaker: 'tom', expression: 'thinking', en: '"I named him in Japanese first, actually. くり. Then everyone at home just... translated him."' },
                { kind: 'end', result: { 'bond:tom': 8 } },
            ],
        },
    },
];

/** Pick the best unseen scene for a character in an area at the given rank. */
export function pickBondScene(
    character: string,
    areaId: string,
    rank: number,
    seenScenes: readonly string[],
): BondSceneEntry | null {
    const candidates = BOND_SCENES.filter(
        entry => entry.character === character && entry.areaId === areaId && entry.rank <= rank && !seenScenes.includes(entry.scene.id),
    );
    candidates.sort((a, b) => b.rank - a.rank);
    return candidates[0] ?? null;
}

/** Any unseen scene available in this area for any present character. */
export function bondSceneForArea(
    areaId: string,
    present: readonly string[],
    rankOf: (character: string) => number,
    seenScenes: readonly string[],
): BondSceneEntry | null {
    for (const character of present) {
        const entry = pickBondScene(character, areaId, rankOf(character), seenScenes);
        if (entry) return entry;
    }
    return null;
}
