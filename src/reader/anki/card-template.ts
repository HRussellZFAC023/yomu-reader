import { escapeHtml } from '../dom';
import { uiText } from '../app/i18n';
import { ANKI_CARD_COLOR_TOKENS } from '../theme/color-tokens';
import type { ReaderSettings } from '../app/types';

const YOMU_RECOGNITION_TEMPLATE_NAME = 'Recognition';
const YOMU_CONTEXT_TEMPLATE_NAME = 'Context';

export function yomuCardTemplates(settings: ReaderSettings): Record<string, { Front: string; Back: string }> {
    const language = settings.interfaceLanguage;
    const recognitionFront = `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    ${settings.ankiFrontReading ? '{{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}' : ''}
    ${settings.ankiFrontSentence ? '{{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}' : ''}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
</main>`;
    const contextFront = `
<main class="yomu-card yomu-front">
    {{#Sentence}}<div class="yomu-sentence yomu-sentence-front">{{Sentence}}</div>{{/Sentence}}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
    <div class="yomu-prompt">${escapeHtml(uiText(language, 'ankiPromptRecallWord'))}</div>
</main>`;
    const back = `
{{FrontSide}}
<main class="yomu-card yomu-back">
    <section class="yomu-section yomu-answer">
        <div class="yomu-expression">{{Expression}}</div>
        {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
        {{#Audio}}<div class="yomu-audio">{{Audio}}</div>{{/Audio}}
    </section>
    {{#Meaning}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'ankiMeaningHeading'))}</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'dictionaries'))}</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'kanji'))}</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>${escapeHtml(uiText(language, 'factFrequency'))}</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>${escapeHtml(uiText(language, 'ankiPitchHeading'))}</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>${escapeHtml(uiText(language, 'ankiPartOfSpeechHeading'))}</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#JPDB}}<div><strong>${escapeHtml(uiText(language, 'ankiLinksHeading'))}</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>${escapeHtml(uiText(language, 'ankiSourceHeading'))}</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`;
    const templateName = settings.ankiTemplateMode === 'context'
        ? YOMU_CONTEXT_TEMPLATE_NAME
        : YOMU_RECOGNITION_TEMPLATE_NAME;
    return {
        [templateName]: {
            Front: settings.ankiTemplateMode === 'context' ? contextFront : recognitionFront,
            Back: back,
        },
    };
}

export function yomuCardCss(): string {
    const color = ANKI_CARD_COLOR_TOKENS;
    return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: ${color.text};
    background: ${color.background};
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: ${color.muted}; font-size: 24px; }
.yomu-prompt { margin-top: 14px; color: ${color.muted}; font-size: 16px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid ${color.sentenceBorder};
    border-radius: 12px;
    background: ${color.sentenceBackground};
    color: ${color.sentenceText};
}
.yomu-highlight { color: ${color.highlight}; font-weight: 800; }
.yomu-sentence-front { font-size: 28px; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid ${color.sectionBorder};
    border-radius: 12px;
    background: ${color.sectionBackground};
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: ${color.headingText};
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: ${color.labelText};
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: ${color.expressionText}; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: ${color.readingText}; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid ${color.chipBorder};
    border-radius: 999px;
    color: ${color.chipText};
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: ${color.metaLabelText}; }
a { color: ${color.highlight}; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid ${color.tableBorder}; padding: 4px 6px; }
`;
}
