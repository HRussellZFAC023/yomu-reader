import { NEW_TAB_PAGE_URL } from './constants';
import { escapeHtml } from './dom';
import { Logger } from './logger';
import { sanitizeAccentColor } from './settings';
import type { JPDBCard } from './types';

const log = Logger.scope('NewTab');

export interface NewTabPalette {
    background: string;
    backgroundText: string;
    surface: string;
    surfaceText: string;
    accentText: string;
    border: string;
    shadow: string;
}

export function isYomuNewTabUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.searchParams.has('yomu-newtab')) return true;
        const path = url.pathname.replace(/\/index\.html$/, '/');
        if (url.hostname === 'hrussellzfac023.github.io') return path === '/kotoba-reader/newtab/';
        if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname)) return path.endsWith('/newtab/');
        return path.endsWith('/kotoba-reader/newtab/') || path.endsWith('/newtab/');
    } catch {
        return false;
    }
}

export function buildNewTabPalette(accentColor: string): NewTabPalette {
    const background = sanitizeAccentColor(accentColor);
    const backgroundText = contrastRatio(background, '#ffffff') >= contrastRatio(background, '#111111') ? '#ffffff' : '#111111';
    const surface = '#ffffff';
    const surfaceText = '#15171c';
    const accentText = readableOn(background, surface, 4.5);
    const border = contrastRatio(background, '#ffffff') >= 3 ? '#ffffff' : readableOn(background, background, 3);
    const shadow = contrastRatio(background, '#111111') > 4 ? 'rgba(0,0,0,.24)' : 'rgba(20,24,30,.16)';
    const palette = { background, backgroundText, surface, surfaceText, accentText, border, shadow };
    log.debug('Built new tab palette', { accentColor: background, backgroundText, accentText });
    return palette;
}

export function shuffleCards(cards: JPDBCard[]): JPDBCard[] {
    const shuffled = [...cards];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    log.debug('Shuffled new tab cards', { count: cards.length });
    return shuffled;
}

export function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    return values
        .map(value => value.trim())
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

export function firstCardMeaning(card: JPDBCard): string {
    const meanings = card.meanings ?? [];
    const first = meanings.find(meaning => meaning.glosses.some(gloss => gloss.trim()));
    return first?.glosses.filter(Boolean).join('; ') ?? '';
}

export function renderDisabledNewTabMarkup(): string {
    log.debug('Rendering disabled new tab markup');
    return `
        <div class="jpdb-reader-newtab-shell">
            <div class="jpdb-reader-newtab-topbar">
                <div class="jpdb-reader-newtab-brand">よむ</div>
                <div class="jpdb-reader-newtab-status">${escapeHtml(NEW_TAB_PAGE_URL)}</div>
            </div>
            <section class="jpdb-reader-newtab-stage">
                <div class="jpdb-reader-newtab-empty">
                    <div class="jpdb-reader-newtab-empty-title">New tab is off</div>
                    <p>Enable the Yomu new tab page in settings, then use this address on desktop or iPad.</p>
                    <button class="jpdb-reader-newtab-button primary" type="button" data-newtab-action="settings">Settings</button>
                </div>
            </section>
        </div>
    `;
}

function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, '#000000') > contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string): number {
    const [red, green, blue] = hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHex(from: string, to: string, amount: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(color: string): [number, number, number] {
    const safe = sanitizeAccentColor(color);
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}
