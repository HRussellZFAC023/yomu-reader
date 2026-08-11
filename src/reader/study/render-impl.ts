import { setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { capturePopoverScrollFrame, restorePopoverScrollFrameSoon } from '../popup/shell';
import { detectGrammarHints, renderGrammarHints, setGrammarRuleKnown, setKnownGrammarVisible, translateTargetSentence } from './tools-impl';
import type { GrammarHint } from './tools';
import { renderStudyEmpty, renderStudyMeaningBlock } from './section-render';
import type { InterfaceLanguage } from '../app/types';
import { currentGrammarAvailability, renderGrammarAvailability } from './grammar-availability';
import { localeDirection } from '../languages/locale';

const log = Logger.scope('StudyRender');

export async function renderStudyToolResult(button: HTMLButtonElement, action: string, sentence?: string, grammarHints?: GrammarHint[], language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean; outputLanguage?: string } = {}): Promise<void> {
    const panel = button.closest('.jpdb-reader-study-tools')?.querySelector<HTMLElement>('[data-study-panel]');
    if (!panel || !sentence) return;
    panel.hidden = false;
    panel.textContent = studyToolPendingText(action, language);
    const done = log.time('studyTool', { action, sentenceLength: sentence.length });
    try {
        if (action === 'study-translate') await renderTranslationResult(panel, sentence, language, options.outputLanguage);
        else await renderGrammarResult(panel, sentence, grammarHints, language, options.audioEnabled);
    } finally {
        done();
    }
}

async function renderTranslationResult(
    panel: HTMLElement,
    sentence: string,
    language: InterfaceLanguage,
    outputLanguage: string | undefined,
): Promise<void> {
    try {
        const translation = await translateTargetSentence(sentence, outputLanguage ?? 'en');
        if (!translation) {
            panel.hidden = true;
            panel.textContent = '';
            return;
        }
        replaceStudyPanelHtml(panel, renderStudyMeaningBlock(translation.text, language, {
            content: {
                lang: translation.outputLanguage,
                dir: localeDirection(translation.outputLanguage),
            },
        }));
    } catch (error) {
        log.warn('Study translation failed', { sentenceLength: sentence.length }, error);
        replaceStudyPanelHtml(panel, renderStudyEmpty(uiText(language, 'translationUnavailable')));
    }
}

async function renderGrammarResult(
    panel: HTMLElement,
    sentence: string,
    grammarHints: GrammarHint[] | undefined,
    language: InterfaceLanguage,
    audioEnabled: boolean | undefined,
): Promise<void> {
    try {
        const hints = resolvedGrammarHints(sentence, grammarHints);
        if (!hints.length) {
            const availability = currentGrammarAvailability(language);
            panel.dataset.grammarAvailability = availability.state;
            replaceStudyPanelHtml(panel, renderGrammarAvailability(availability, language));
            return;
        }
        panel.dataset.grammarAvailability = 'loaded';
        replaceStudyPanelHtml(panel, await renderGrammarHints(hints, sentence, undefined, language, { audioEnabled }));
    } catch (error) {
        log.warn('Study grammar check failed', { sentenceLength: sentence.length }, error);
        const availability = currentGrammarAvailability(language, true);
        panel.dataset.grammarAvailability = availability.state;
        replaceStudyPanelHtml(panel, renderGrammarAvailability(availability, language));
    }
}

function studyToolPendingText(action: string, language: InterfaceLanguage): string {
    return action === 'study-translate' ? uiText(language, 'translating') : uiText(language, 'findingGrammar');
}

function resolvedGrammarHints(sentence: string, grammarHints: GrammarHint[] | undefined): GrammarHint[] {
    return grammarHints ?? detectGrammarHints(sentence);
}

export function handleStudyGrammarAction(button: HTMLButtonElement, sentence?: string, language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean } = {}): boolean {
    if (!sentence) return false;
    if (button.dataset.action === 'study-grammar-toggle-known') {
        const ruleId = button.dataset.grammarRuleId;
        if (!ruleId) return false;
        setGrammarRuleKnown(ruleId, button.dataset.grammarKnown !== 'true');
        void rerenderGrammarPanel(button, sentence, language, options);
        return true;
    }
    if (button.dataset.action === 'study-grammar-toggle-known-visibility') {
        setKnownGrammarVisible(button.getAttribute('aria-pressed') !== 'true');
        void rerenderGrammarPanel(button, sentence, language, options);
        return true;
    }
    return false;
}

async function rerenderGrammarPanel(button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean }): Promise<void> {
    const panel = button.closest<HTMLElement>('.jpdb-reader-study-panel');
    if (!panel) return;
    const hints = detectGrammarHints(sentence);
    replaceStudyPanelHtml(panel, await renderGrammarHints(hints, sentence, undefined, language, { audioEnabled: options.audioEnabled }));
}

function replaceStudyPanelHtml(panel: HTMLElement, html: string): void {
    const scrollFrame = capturePopoverScrollFrame(panel);
    setInnerHtml(panel, html);
    restorePopoverScrollFrameSoon(scrollFrame);
}
