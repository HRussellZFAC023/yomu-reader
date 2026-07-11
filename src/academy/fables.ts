/**
 * Yomu Academy — folktale reading data.
 *
 * Original, graded simple-Japanese retellings of public-domain Japanese
 * folktales, authored in public/academy/content/fables.json and bundled here.
 * Each sentence is tokenised so the eye-icon reveal can show furigana and an
 * English gloss on demand — immersion reading at the learner's own support level.
 */

import data from '../../public/academy/content/fables.json';
import type { RevealToken } from './learn';

export interface FableSentence {
    readonly tokens: readonly RevealToken[];
    readonly en: string;
}

export interface FableVocab {
    readonly word: string;
    readonly reading: string;
    readonly gloss: string;
}

export interface FableComprehension {
    readonly q: { readonly en: string };
    readonly choices: readonly string[];
    readonly answer: number;
}

export interface Fable {
    readonly id: string;
    readonly title: { readonly ja: string; readonly en: string };
    readonly level: string;
    readonly summary: { readonly en: string };
    readonly sentences: readonly FableSentence[];
    readonly vocab: readonly FableVocab[];
    readonly comprehension: readonly FableComprehension[];
}

const FABLES = (data as { fables: Fable[] }).fables;

export function allFables(): readonly Fable[] {
    return FABLES;
}

/** A level-appropriate folktale for a lesson route (N5 tales early, N4 later). */
export function fableForRoute(routeNumber: number): Fable {
    const byId = (id: string) => FABLES.find(fable => fable.id === id);
    if (routeNumber >= 7) return byId('kaguya-hime') ?? FABLES[0];
    if (routeNumber >= 4) return byId('tsuru-no-ongaeshi') ?? FABLES[0];
    return byId('momotaro') ?? FABLES[0];
}
