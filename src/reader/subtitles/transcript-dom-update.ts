import { remintRenderedWordPrivateTokens, setInnerHtml } from '../dom/index';
import { shouldApplyParsedTranscriptHtml } from './subtitle-parse-policy';

export interface ParsedTranscriptUpdateOptions {
    provisional?: boolean;
    force?: boolean;
    refreshProvisional?: boolean;
}

export function mouseEventElement(event: MouseEvent): HTMLElement | null {
    return event.target instanceof HTMLElement ? event.target : null;
}

export function flashSubtitleCopyFeedback(target: HTMLElement): void {
    const button = target.closest<HTMLElement>('button') ?? target;
    button.classList.add('jpdb-subtitle-copy-flash');
    window.setTimeout(() => button.classList.remove('jpdb-subtitle-copy-flash'), 1200);
}

export function updateParsedTranscriptTargets(
    targets: HTMLElement[],
    key: string,
    html: string,
    hasReaderWords: boolean,
    options: ParsedTranscriptUpdateOptions,
): HTMLElement[] {
    const updatedRoots: HTMLElement[] = [];
    for (const target of targets) {
        if (!shouldUpdateParsedTranscriptTarget(target, key, options)) continue;
        if (!hasReaderWords) {
            markEmptyTranscriptParse(target, key);
            continue;
        }
        markParsedTranscriptText(target, key, html, options.provisional === true);
        updatedRoots.push(target);
    }
    return updatedRoots;
}

function shouldUpdateParsedTranscriptTarget(
    target: HTMLElement,
    key: string,
    options: ParsedTranscriptUpdateOptions,
): boolean {
    if (options.force) return true;
    return shouldApplyParsedTranscriptHtml(target, key, options.provisional === true, options.refreshProvisional === true);
}

function markParsedTranscriptText(target: HTMLElement, key: string, html: string, provisional: boolean): void {
    target.dataset.parsedKey = key;
    if (provisional) target.dataset.parsedProvisional = 'true';
    else delete target.dataset.parsedProvisional;
    delete target.dataset.parseEmptyKey;
    delete target.dataset.parseEmptyAt;
    delete target.dataset.parseFailedKey;
    delete target.dataset.parseFailedAt;
    setInnerHtml(target, remintRenderedWordPrivateTokens(html));
}

function markEmptyTranscriptParse(target: HTMLElement, key: string): void {
    target.dataset.parseEmptyKey = key;
    target.dataset.parseEmptyAt = String(Date.now());
    delete target.dataset.parsedKey;
    delete target.dataset.parsedProvisional;
    delete target.dataset.parseFailedKey;
    delete target.dataset.parseFailedAt;
}
