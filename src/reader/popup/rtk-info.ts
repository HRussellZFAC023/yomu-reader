import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { RtkInfo } from '../kanji/rtk';
import { rtkElementFallbackGlyph, rtkElementKey, splitRtkElements, type RtkElementGlyph } from '../kanji/rtk-elements';
import type { InterfaceLanguage } from '../app/types';
import type { YomitanKanjiEntry } from '../dictionaries/yomitan';
import type { KanjiSourceInfo } from '../kanji/origin';
import { isKanjiCharacter } from './pitch';
import { renderKanjiKeywordChips } from './kanji-keyword-line';
import { sourceStateAttribute } from './source-state';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

export interface RtkComponentSummary {
    kanji: string;
    keyword: string;
    meaning: string;
}

export function buildRtkComponentSummaries(rtkInfo: RtkInfo | null, jpdbInfo: JpdbKanjiInfo | null, entries: YomitanKanjiEntry[]): RtkComponentSummary[] {
    const elementKeywords = splitRtkElements(rtkInfo?.elements ?? '')
        .filter(keyword => rtkElementKey(keyword) !== rtkElementKey(rtkInfo?.keyword ?? ''));
    const jpdbByKanji = new Map((jpdbInfo?.components ?? []).map(component => [component.kanji, component.keyword]));
    const localByKanji = new Map(entries.map(entry => [entry.character, entry.meanings.slice(0, 3).join(', ')]));
    const summaries = [...new Set([...(rtkInfo?.componentKanji ?? []), ...(jpdbInfo?.components.map(component => component.kanji) ?? [])])]
        .filter(isKanjiCharacter)
        .map((kanji, index) => ({
            kanji,
            keyword: jpdbByKanji.get(kanji) || elementKeywords[index] || '',
            meaning: localByKanji.get(kanji) || '',
        }));
    return summaries;
}

export function renderKanjiKeywordLine(
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
    language: InterfaceLanguage = 'en',
    sourceInfo: KanjiSourceInfo | null = null,
): string {
    return renderKanjiKeywordChips([
        { text: jpdbInfo?.keyword, label: 'JPDB', canonical: true },
        { text: rtkInfo?.keyword, label: 'RTK' },
        { text: sourceInfo?.kanjiAliveKeyword, label: 'Kanji Alive' },
        ...entries.flatMap(entry => entry.meanings).filter(Boolean).slice(0, 3).map(meaning => ({ text: meaning, label: uiText(language, 'dict') })),
    ], language);
}

interface RtkElementChip {
    keyword: string;
    glyph: string;
    kanji: string;
}

function parseRtkElementChip(value: string): RtkElementChip {
    const match = value.match(/^([^\sA-Za-z0-9])\s*(.+)$/u);
    if (!match) return { keyword: value, glyph: '', kanji: '' };
    const glyph = match[1] ?? '';
    return { glyph, kanji: isKanjiCharacter(glyph) ? glyph : '', keyword: match[2]?.trim() ?? '' };
}

function buildRtkElementChips(info: RtkInfo, components: RtkComponentSummary[]): RtkElementChip[] {
    const componentKanji = new Set(components.map(component => component.kanji).filter(Boolean));
    const componentByKeyword = new Map<string, RtkElementGlyph>();
    components.forEach(component => {
        if (component.keyword) componentByKeyword.set(rtkElementKey(component.keyword), { glyph: component.kanji, kanji: component.kanji });
    });

    const chips = splitRtkElements(info.elements)
        .map(parseRtkElementChip)
        .filter(chip => chip.keyword && rtkElementKey(chip.keyword) !== rtkElementKey(info.keyword))
        .map(chip => rtkElementChipWithGlyph(chip, info, componentKanji, componentByKeyword));

    const anchoredKanji = new Set(chips.map(chip => chip.kanji).filter(Boolean));
    const allKnownComponentsAnchored = componentKanji.size > 0 && [...componentKanji].every(kanji => anchoredKanji.has(kanji));

    return chips.map((chip, index) => fillRtkChipGlyph(chip, index, chips, allKnownComponentsAnchored));
}

function rtkElementChipWithGlyph(
    chip: RtkElementChip,
    info: RtkInfo,
    componentKanji: Set<string>,
    componentByKeyword: Map<string, RtkElementGlyph>,
): RtkElementChip {
    const inferred = rtkElementInferredGlyph(chip, info, componentKanji, componentByKeyword);
    return {
        keyword: chip.keyword,
        glyph: inferred?.glyph ?? '',
        kanji: inferred?.kanji ?? '',
    };
}

function rtkElementInferredGlyph(
    chip: RtkElementChip,
    info: RtkInfo,
    componentKanji: Set<string>,
    componentByKeyword: Map<string, RtkElementGlyph>,
): RtkElementGlyph | undefined {
    return inlineRtkElementGlyph(chip, componentKanji)
        ?? componentByKeyword.get(rtkElementKey(chip.keyword))
        ?? info.elementGlyphs?.[rtkElementKey(chip.keyword)]
        ?? rtkElementFallbackGlyph(chip.keyword);
}

function inlineRtkElementGlyph(chip: RtkElementChip, componentKanji: Set<string>): RtkElementGlyph | undefined {
    return chip.glyph && canUseInlineRtkGlyph(chip, componentKanji) ? { glyph: chip.glyph, kanji: chip.kanji } : undefined;
}

function canUseInlineRtkGlyph(chip: RtkElementChip, componentKanji: Set<string>): boolean {
    return !componentKanji.size || componentKanji.has(chip.kanji);
}

function fillRtkChipGlyph(
    chip: RtkElementChip,
    index: number,
    chips: RtkElementChip[],
    allKnownComponentsAnchored: boolean,
): RtkElementChip {
    if (chip.glyph) return chip;
    const previous = lastAnchoredRtkChip(chips, index);
    if (!previous || !shouldFillRtkChipFromPrevious(chips, index, allKnownComponentsAnchored)) return chip;
    return { ...chip, glyph: previous.glyph, kanji: previous.kanji };
}

function shouldFillRtkChipFromPrevious(chips: RtkElementChip[], index: number, allKnownComponentsAnchored: boolean): boolean {
    return allKnownComponentsAnchored || Boolean(nextAnchoredRtkChip(chips, index));
}

function lastAnchoredRtkChip(chips: RtkElementChip[], beforeIndex: number): RtkElementChip | null {
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
        if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
}

function nextAnchoredRtkChip(chips: RtkElementChip[], afterIndex: number): RtkElementChip | null {
    for (let index = afterIndex + 1; index < chips.length; index += 1) {
        if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
}

export function renderRtkInfo(info: RtkInfo | null, components: RtkComponentSummary[], language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    if (!info) return '';
    const elementChips = buildRtkElementChips(info, components);
    const readings = renderRtkReadings(info, language);
    const elementSection = renderRtkElementSection(elementChips, language);
    const stories = renderRtkStories(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-rtk" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">RTK</summary>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml(info.frameNumber)}</span>` : ''}
                </div>
                ${readings}
                ${elementSection}
                ${stories}
            </div>
        </details>
    `;
}

function renderRtkReadings(info: RtkInfo, language: InterfaceLanguage): string {
    if (!info.onYomi && !info.kunYomi) return '';
    return `<div class="jpdb-reader-kanji-readings">
        ${info.onYomi ? `<span>${uiText(language, 'onReading')} ${escapeHtml(info.onYomi)}</span>` : ''}
        ${info.kunYomi ? `<span>${uiText(language, 'kunReading')} ${escapeHtml(info.kunYomi)}</span>` : ''}
    </div>`;
}

function renderRtkElementSection(elementChips: ReturnType<typeof buildRtkElementChips>, language: InterfaceLanguage): string {
    return elementChips.length
        ? `<div class="jpdb-reader-rtk-elements" aria-label="${uiText(language, 'rtkComponentKeywords')}">${elementChips.map(chip => renderRtkElementChip(chip, language)).join('')}</div>`
        : '';
}

function renderRtkElementChip(chip: ReturnType<typeof buildRtkElementChips>[number], language: InterfaceLanguage): string {
    const content = `${chip.glyph ? `<strong>${escapeHtml(chip.glyph)}</strong>` : ''}<span>${escapeHtml(chip.keyword)}</span>`;
    return chip.kanji
        ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml(chip.kanji)}"${privateCommandAttributes({ kind: 'kanji-lookup', kanji: chip.kanji })} title="${escapeHtml(`${uiText(language, 'showKanji')}: ${chip.kanji}`)}">${content}</button>`
        : `<span>${content}</span>`;
}

function renderRtkStories(info: RtkInfo, language: InterfaceLanguage): string {
    return [
        info.heisigStory ? `<details><summary>${uiText(language, 'heisigStory')}</summary><p>${escapeHtml(info.heisigStory)}</p></details>` : '',
        info.heisigComment ? `<details open><summary>${uiText(language, 'heisigComment')}</summary><p>${escapeHtml(info.heisigComment)}</p></details>` : '',
        info.koohiiStories.length ? `<details><summary>${uiText(language, 'koohiiStories')}</summary>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</details>` : '',
    ].join('');
}
