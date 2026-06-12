import { HAS_JAPANESE } from '../dom/index';

const LEARNER_GLOSSARY_SOURCE_RE = /\b(?:JMdict|JMDict|Tatoeba)\b.*$/i;
const LEARNER_GLOSSARY_TAG_RE = /^(?:\[[^\]]+\]\s*)?(?:(?:adj-(?:i|ix|ku|na|no|pn|t|f)|na-adj|adv(?:-to)?|aux(?:-[a-z]+)?|conj|ctr|exp|int|n(?:-[a-z]+)?|noun|pn|pref|prt|suf|suffix|vs(?:-[a-z]+)?|v[0-9a-z-]+|vi|vk|vn|vr|vs|vt|suru|transitive|intransitive|adjective|adverb|kana|usually|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare|relative)\s+)+/i;
const LEARNER_GLOSSARY_SEPARATOR_RE = /\s*(?:;|,|\/|\||\u3001|\u30fb)\s*/;

function splitLearnerGlossaryText(text: string): string[] {
    const withoutExamples = learnerGlossaryWithoutExamples(text);
    return withoutExamples
        .split(LEARNER_GLOSSARY_SEPARATOR_RE)
        .map(item => item.trim())
        .filter(Boolean);
}

export function learnerGlossaryWithoutExamples(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return cutBeforeExampleText(normalized)
        .replace(LEARNER_GLOSSARY_SOURCE_RE, '')
        .trim();
}

// Shared summarization (P3 dedup: groups-core summarizeLearnerGlossary and
// the new-tab meaning cleanup used to repeat this clean → dedupe → top-3
// pipeline independently).
export function summarizeLearnerGlossaryTexts(texts: string[], limit = 3): string {
    const cleaned = texts
        .flatMap(splitLearnerGlossaryText)
        .map(cleanLearnerGlossaryText)
        .filter(Boolean);
    return Array.from(new Set(cleaned)).slice(0, limit).join(', ');
}

function cleanLearnerGlossaryText(text: string): string {
    let clean = text
        .replace(/^\[[^\]]+\]\s*/u, '')
        .replace(LEARNER_GLOSSARY_TAG_RE, '')
        .replace(/^\((?:relative|usually|kana|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare)\)\s*/iu, '')
        .replace(/\s+/g, ' ')
        .trim();

    clean = humanizeTerseGlosses(trimLearnerMeaning(clean));
    if (!clean || HAS_JAPANESE.test(clean) || looksLikeGrammarTag(clean)) return '';
    return clean;
}

function cutBeforeExampleText(text: string): string {
    const japaneseIndex = text.search(HAS_JAPANESE);
    const sentenceIndex = text.search(/\s+[A-Z][^.;!?]*(?:[.;!?]|$)/u);
    const indexes = [japaneseIndex, sentenceIndex].filter(index => index >= 0);
    const cutoff = indexes.length ? Math.min(...indexes) : -1;
    return cutoff >= 0 ? text.slice(0, cutoff) : text;
}

function trimLearnerMeaning(text: string, maxLength = 56): string {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength).replace(/\s+\S*$/u, '').trim();
    return truncated || text.slice(0, maxLength).trim();
}

function humanizeTerseGlosses(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return text;
    if (words.some(word => /^(?:a|an|and|as|for|in|of|on|or|the|to|with)$/i.test(word))) return text;
    if (words.every(word => /^[a-z][a-z'-]*$/i.test(word))) return words.join(', ');
    return text;
}

function looksLikeGrammarTag(text: string): boolean {
    return /^(?:adj|adv|aux|conj|ctr|exp|int|n|noun|pn|pref|prt|suf|suffix|v[0-9a-z-]+|vi|vt|vs|vk|vn|vr|suru|transitive|intransitive|adjective|adverb|kana|uk)(?:\s|$)/i.test(text);
}
