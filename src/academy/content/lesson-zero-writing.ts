/** A bounded check of the taught frames, not a general Japanese grammar grader. */
export function lessonZeroNameCard(value: string, chosenNames: readonly string[] = []): boolean {
    const name = compact(value).match(/^(.+?)です[。.!！]?$/u)?.[1];
    if (name && chosenNames.some(chosen => compact(chosen) === name)) return true;
    return Boolean(name && /^[\p{L}\p{M}・ー'’\-]+$/u.test(name)
        && !/です|はじめまして|よろしく|お願いします|おねがいします/u.test(name));
}

export function lessonZeroIntroduction(value: string, names: readonly string[]): boolean {
    let text = compact(value);
    const greeting = /^はじめまして[。.!！]?/u;
    const closing = /よろしく(?:お願いします|おねがいします)[。.!！]?$/u;
    if (!greeting.test(text) && !closing.test(text)) return false;
    text = text.replace(greeting, '').replace(closing, '');
    text = text.replace(/^(?:わたし|私)は/u, '');
    return names.some(name => text.replace(/[。.!！]$/u, '') === `${compact(name)}です`);
}

export function lessonZeroClassNote(value: string): boolean {
    const text = compact(value).replace(/[。.!！]$/u, '');
    // These are the two frames shown in the library task, with the vocabulary
    // used there. Unrecognised writing gets a repair prompt, never a false pass.
    const person = '(?:わたし|私|ソフィー|Sophie|ルパルナ|Ruparna)';
    return new RegExp(`^(?:これは)?${person}の(?:名札|なふだ|ノート|本|ほん)です$`, 'u').test(text)
        || new RegExp(`^${person}も(?:学生|がくせい)です$`, 'u').test(text)
        || new RegExp(`^${person}も(?:日本語|にほんご)を(?:勉強|べんきょう)しています$`, 'u').test(text);
}

function compact(value: string): string {
    return value.normalize('NFKC').replace(/\s+/gu, '');
}
