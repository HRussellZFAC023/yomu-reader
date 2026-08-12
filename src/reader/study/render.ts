// ADR-0003 core import-severing: the study-tool result rendering ships in the
// Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { GrammarHint } from './tools';
import type { InterfaceLanguage } from '../app/types';
import type { CardCommandCapability } from '../dom/private-command-capabilities';

export async function renderStudyToolResult(button: HTMLButtonElement, action: string, sentence?: string, grammarHints?: GrammarHint[], language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean; outputLanguage?: string } = {}): Promise<void> {
    await yomuKanjiStudyCompanion()?.renderStudyToolResult?.(button, action, sentence, grammarHints, language, options);
}

export function handleStudyGrammarAction(button: HTMLButtonElement, sentence?: string, language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean; command?: CardCommandCapability } = {}): boolean {
    return yomuKanjiStudyCompanion()?.handleStudyGrammarAction?.(button, sentence, language, options) ?? false;
}
