import { setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { capturePopoverScrollFrame, restorePopoverScrollFrameSoon } from '../popup/shell';
import { detectGrammarHints, renderGrammarHints, setGrammarRuleKnown, setKnownGrammarVisible, translateJapaneseSentence } from './tools-impl';
import type { GrammarHint } from './tools';
import { renderStudyMeaningBlock } from './section-render';
import type { InterfaceLanguage } from '../app/types';

const log = Logger.scope('StudyRender');

export async function renderStudyToolResult(button: HTMLButtonElement, action: string, sentence?: string, grammarHints?: GrammarHint[], language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean } = {}): Promise<void> {
    const panel = button.closest('.jpdb-reader-study-tools')?.querySelector<HTMLElement>('[data-study-panel]');
    if (!panel || !sentence) return;
    panel.hidden = false;
    panel.textContent = studyToolPendingText(action, language);
    const done = log.time('studyTool', { action, sentenceLength: sentence.length });
    if (action === 'study-translate') {
        try {
            const translated = await translateJapaneseSentence(sentence, language);
            if (!translated) {
                panel.hidden = true;
                panel.textContent = '';
                return;
            }
            replaceStudyPanelHtml(panel, renderStudyMeaningBlock(translated, language));
            return;
        } finally {
            done();
        }
    }
    const hints = resolvedGrammarHints(sentence, grammarHints);
    if (!hints.length) {
        panel.hidden = true;
        panel.textContent = '';
        done();
        return;
    }
    replaceStudyPanelHtml(panel, await renderGrammarHints(hints, sentence, undefined, language, { audioEnabled: options.audioEnabled }));
    done();
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
