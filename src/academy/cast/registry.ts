/**
 * Yomu Academy — character registry.
 *
 * One lookup surface over the real-class cast (cast.ts) plus the extended
 * textbook-guest roster. Textbook guests are characters from Genki and
 * Minna no Nihongo who appear in-world (exchange visits, pen-pal letters,
 * graded readers), so imported textbook dialogues keep their canonical
 * speakers. First names only; no invented sensitive facts.
 */

import { ACADEMY_CAST, castMemberById } from '../cast';

export interface TextbookGuest {
    id: string;
    name: string;
    kana: string;
    source: 'genki' | 'minna';
    role: string;
}

/**
 * Guests beyond the two cameos already in cast.ts (miller, tawapon).
 * Roster follows the canonical textbook casts; verify against the actual
 * course sources before authoring dialogue for any of them.
 */
export const TEXTBOOK_GUESTS: readonly TextbookGuest[] = [
    { id: 'mary', name: 'Mary', kana: 'メアリー', source: 'genki', role: 'Exchange student, effortlessly social' },
    { id: 'takeshi', name: 'Takeshi', kana: 'たけし', source: 'genki', role: 'Mary\'s friend, tries very hard' },
    { id: 'sora', name: 'Sora', kana: 'ソラ', source: 'genki', role: 'Sharp, quietly competitive student' },
    { id: 'robert-genki', name: 'Robert (Genki)', kana: 'ロバート', source: 'genki', role: 'Student with legendary bad luck' },
    { id: 'ken', name: 'Ken', kana: 'けん', source: 'genki', role: 'Easy-going student athlete' },
    { id: 'yamashita', name: 'Yamashita-sensei', kana: '山下先生', source: 'genki', role: 'Visiting teacher, Rie\'s old colleague' },
    { id: 'santos', name: 'Santos', kana: 'サントス', source: 'minna', role: 'Works in Tokyo, loves a bargain' },
    { id: 'maria', name: 'Maria', kana: 'マリア', source: 'minna', role: 'Santos\'s wife, endlessly patient' },
    { id: 'karina', name: 'Karina', kana: 'カリナ', source: 'minna', role: 'Art student with strong opinions' },
    { id: 'wang', name: 'Wang', kana: 'ワン', source: 'minna', role: 'Doctor, precise about everything' },
    { id: 'yamada', name: 'Yamada', kana: '山田', source: 'minna', role: 'IMC colleague, long-suffering' },
    { id: 'sato', name: 'Sato', kana: '佐藤', source: 'minna', role: 'IMC colleague, social organiser' },
];

const guestById = new Map(TEXTBOOK_GUESTS.map(guest => [guest.id, guest]));

/** Display name for any speaker id; falls back to the id so a missing
 * registry entry is visible in review rather than crashing a scene. */
export function characterName(id: string): string {
    const member = castMemberById(id);
    if (member) return member.name;
    const guest = guestById.get(id);
    if (guest) return guest.name;
    return id;
}

export function isKnownCharacter(id: string): boolean {
    return Boolean(castMemberById(id) ?? guestById.get(id));
}

export function allCharacterIds(): string[] {
    return [...ACADEMY_CAST.map(member => member.id), ...TEXTBOOK_GUESTS.map(guest => guest.id)];
}
