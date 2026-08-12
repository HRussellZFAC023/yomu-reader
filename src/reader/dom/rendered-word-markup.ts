import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { cardDeckMembership } from '../cards/deck-membership';
import { primaryCardState } from '../cards/state';
import { pitchComponentUnderlineGradient } from '../lookup/pitch-components';
import { escapeHtml } from './html';
import {
    registerRenderedWordPrivateState,
    renderedWordPrivateAttributes,
    renderedWordPrivateStateForCard,
} from './rendered-word-private-state';
import {
    isParticleCard,
    miningInsightTokenKey,
    readerWordClassName,
    renderRuby,
    shouldRenderRuby,
    tokenPitchClass,
    type TokenRenderOptions,
} from './token-text-rendering';

/** Creates the canonical live-DOM word shell and binds its opaque identity. */
export function createRenderedWordSpan(token: JPDBToken, options: TokenRenderOptions): HTMLElement {
    const span = document.createElement('span');
    const state = primaryCardState(token.card.cardState);
    const showPitchAccent = options.showPitchAccent !== false;
    span.className = readerWordClassName(state, token, { showPitchAccent });
    registerRenderedWordPrivateState(span, renderedWordPrivateStateForCard(token.card, state));
    span.dataset.tokenStart = String(token.start);
    span.dataset.tokenEnd = String(token.end);
    span.dataset.sentence = token.sentence ?? '';
    applyRenderedWordLookupDataset(span, token);
    applyRenderedWordPitchDataset(span, token, showPitchAccent);
    applyRenderedWordDeckDataset(span, token.card);
    applyRenderedWordOptions(span, token, options);
    return span;
}

/** Serializes a cached word with a one-use opaque private-state token. */
export function renderRenderedWordHtml(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    miningInsightKeys: ReadonlySet<string>,
): string {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
    const pitchClass = settings.showPitchAccent ? tokenPitchClass(token) : '';
    const classes = renderedWordClassNames(state, token, settings, hasRuby, hasMiningInsight);
    const privateAttributes = renderedWordPrivateAttributes(token.card, state);
    const attributes = renderedWordAttributes(surface, token, settings, pitchClass, hasMiningInsight);
    return `<span class="${classes}"${privateAttributes}${attributes} tabindex="-1">${content}</span>`;
}

function applyRenderedWordLookupDataset(span: HTMLElement, token: JPDBToken): void {
    if (token.card.spelling) span.dataset.expression = token.card.spelling;
    if (token.card.reading) span.dataset.reading = token.card.reading;
}

function applyRenderedWordPitchDataset(span: HTMLElement, token: JPDBToken, showPitchAccent: boolean): void {
    if (!showPitchAccent) return;
    span.dataset.pitchClass = tokenPitchClass(token);
    const pitchAccent = token.card.pitchAccent.join('|');
    if ([Boolean(pitchAccent), !isParticleCard(token.card)].every(Boolean)) span.dataset.pitchAccent = pitchAccent;
    applyPitchComponentGradient(span, token.card);
}

function applyRenderedWordDeckDataset(span: HTMLElement, card: JPDBCard): void {
    const membership = cardDeckMembership(card);
    if (!membership.member) return;
    if (!currentAccountDataSurfaceIsTrusted()) return;
    span.dataset.deckMember = 'true';
    span.dataset.deckSource = membership.source;
    if (membership.names.length) span.dataset.deckNames = membership.names.join(', ');
}

function applyRenderedWordOptions(span: HTMLElement, token: JPDBToken, options: TokenRenderOptions): void {
    applyRenderedWordScanOption(span, options);
    applyRenderedWordProseOption(span, options);
    applyRenderedWordMiningOption(span, token, options);
    applyRenderedWordPassiveOption(span, options);
}

function applyRenderedWordScanOption(span: HTMLElement, options: TokenRenderOptions): void {
    if (!options.scanWord) return;
    span.classList.add('jpdb-reader-scan-word');
    if (!options.proseWrap) span.style.setProperty('display', 'inline', 'important');
}

function applyRenderedWordProseOption(span: HTMLElement, options: TokenRenderOptions): void {
    if (![options.proseWrap, !options.passiveInteraction].every(Boolean)) return;
    span.classList.add('jpdb-reader-prose-word');
    span.dataset.jpdbReaderProse = 'true';
}

function applyRenderedWordMiningOption(span: HTMLElement, token: JPDBToken, options: TokenRenderOptions): void {
    if (!options.miningInsightKeys?.has(miningInsightTokenKey(token))) return;
    span.classList.add('jpdb-reader-i-plus-one');
    span.dataset.miningInsight = 'i-plus-one';
}

function applyRenderedWordPassiveOption(span: HTMLElement, options: TokenRenderOptions): void {
    if (!options.passiveInteraction) return;
    span.classList.add('jpdb-reader-passive-word');
    span.dataset.jpdbReaderPassive = 'true';
}

function renderedWordClassNames(
    state: string,
    token: JPDBToken,
    settings: ReaderSettings,
    hasRuby: boolean,
    hasMiningInsight: boolean,
): string {
    return [
        readerWordClassName(state, token, settings),
        hasRuby ? 'jpdb-reader-has-furi' : '',
        hasMiningInsight ? 'jpdb-reader-i-plus-one' : '',
    ].filter(Boolean).join(' ');
}

function renderedWordAttributes(
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    pitchClass: string,
    hasMiningInsight: boolean,
): string {
    return [
        ` data-token-start="${token.start}" data-token-end="${token.end}"`,
        ` data-surface="${escapeHtml(surface)}"`,
        optionalDataAttribute('pitch-class', pitchClass),
        renderedWordPitchComponentAttributes(token.card, settings.showPitchAccent),
        ` data-sentence="${escapeHtml(token.sentence ?? '')}"`,
        conditionalDataAttribute('mining-insight', hasMiningInsight, 'i-plus-one'),
        optionalDataAttribute('expression', token.card.spelling),
        optionalDataAttribute('reading', token.card.reading),
        renderedWordPitchAccentAttribute(token, settings.showPitchAccent, pitchClass),
        renderDeckMembershipAttributes(token.card),
    ].join('');
}

function renderedWordPitchAccentAttribute(token: JPDBToken, showPitchAccent: boolean, pitchClass: string): string {
    const pitchAccent = token.card.pitchAccent.join('|');
    const visiblePitchAccent = [showPitchAccent, Boolean(pitchAccent), pitchClass !== 'particle'].every(Boolean)
        ? pitchAccent
        : '';
    return optionalDataAttribute('pitch-accent', visiblePitchAccent);
}

function renderedWordPitchComponentAttributes(card: JPDBCard, showPitchAccent: boolean): string {
    const gradient = showPitchAccent ? pitchComponentUnderlineGradient(card) : '';
    if (!gradient) return '';
    return ` data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${escapeHtml(gradient)}"`;
}

function optionalDataAttribute(name: string, value: string): string {
    return value ? ` data-${name}="${escapeHtml(value)}"` : '';
}

function conditionalDataAttribute(name: string, enabled: boolean, value: string): string {
    return enabled ? optionalDataAttribute(name, value) : '';
}

function applyPitchComponentGradient(word: HTMLElement, card: JPDBCard): void {
    const gradient = pitchComponentUnderlineGradient(card);
    if (!gradient) return;
    word.dataset.pitchComponents = 'true';
    word.style.setProperty('--jpdb-reader-inline-pitch-gradient', gradient);
}

function renderDeckMembershipAttributes(card: JPDBCard): string {
    const membership = cardDeckMembership(card);
    if (!membership.member || !currentAccountDataSurfaceIsTrusted()) return '';
    const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(', '))}"` : '';
    return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
}
