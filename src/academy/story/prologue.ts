/**
 * Yomu Academy — prologue scene.
 *
 * The first evening: arriving at the class. Establishes Rie, asks why the
 * learner is here (the choice echoes later), and hands off to the kana
 * on-ramp. Copy is short and human; the "doors" moment is one plate
 * crossfade into warm light, not an effect stack.
 */

import type { SceneScript } from '../engine/script';

export const PROLOGUE_SCENE: SceneScript = {
    id: 'prologue-first-evening',
    band: 'n5',
    nodes: [
        { kind: 'stage', plate: 'bloomsbury-street__blue-hour-rain', ambience: 'rain' },
        { kind: 'line', en: 'Tuesday, just past six. The rain has been going all day.' },
        { kind: 'line', en: 'Room B03. You found the building on the second try.' },
        { kind: 'stage', plate: 'classroom__evening-lamplit', ambience: 'classroom', sprites: [{ character: 'rie', expression: 'happy', side: 'center' }] },
        { kind: 'line', speaker: 'rie', expression: 'happy', ja: 'こんばんは！', en: 'Good evening!' },
        { kind: 'line', speaker: 'rie', expression: 'speaking', ja: 'どうぞ、どうぞ。', en: 'Come in, come in.', note: 'どうぞ — go ahead / please. You\'ll hear this one constantly.' },
        { kind: 'line', speaker: 'rie', expression: 'neutral', en: 'You made it. That\'s the hard part, honestly.' },
        {
            kind: 'choice',
            prompt: { kind: 'line', speaker: 'rie', expression: 'thinking', en: 'So — what brings you to Japanese?' },
            options: [
                { id: 'stories', en: 'I want to read and watch things as they are.', set: { motivation: 'stories' } },
                { id: 'travel', en: 'I\'m going to Japan. Maybe for good.', set: { motivation: 'travel' } },
                { id: 'people', en: 'Someone I care about speaks it.', set: { motivation: 'people' } },
                { id: 'challenge', en: 'I wanted something hard. This qualifies.', set: { motivation: 'challenge' } },
            ],
        },
        { kind: 'line', speaker: 'rie', expression: 'happy', en: 'Good. Hold on to that — Tuesdays in February get long.' },
        { kind: 'line', speaker: 'rie', expression: 'determined', ja: 'じゃあ、はじめましょう。', en: 'Right then — let\'s begin.' },
        { kind: 'line', en: 'She turns to the whiteboard and writes five characters, slowly: あ、い、う、え、お.' },
        { kind: 'end', result: { 'story:prologue-complete': true, 'bond:rie': 5 } },
    ],
};
