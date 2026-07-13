import type { AcademyCastMemberId } from '../domain/cast-registry';

export interface AcademyClassEvent {
    readonly id: string;
    readonly season: 'foundation' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1' | 'alumni';
    readonly title: { readonly en: string; readonly ja: string };
    readonly castIds: readonly AcademyCastMemberId[];
    readonly status: 'planned' | 'playable';
}

/** Finite story milestones shown under Class; status is explicit until each scene ships. */
export const ACADEMY_CLASS_EVENTS: readonly AcademyClassEvent[] = [
    { id: 'event:open-doors', season: 'foundation', title: { en: 'The open doors', ja: 'ひらいた扉' }, castIds: ['rie'], status: 'playable' },
    { id: 'event:first-page', season: 'foundation', title: { en: 'The handwritten page', ja: '手書きのページ' }, castIds: ['rie', 'sophie', 'ruparna'], status: 'planned' },
    { id: 'event:after-class', season: 'n5', title: { en: 'After class', ja: '授業のあと' }, castIds: ['aakash', 'sam', 'robert'], status: 'planned' },
    { id: 'event:plans-promises', season: 'n4', title: { en: 'Plans and promises', ja: '予定と約束' }, castIds: ['alex', 'tom', 'shin'], status: 'planned' },
    { id: 'event:different-speeds', season: 'n3', title: { en: 'Different speeds', ja: 'それぞれの速さ' }, castIds: ['jenny', 'sophie', 'peter'], status: 'planned' },
    { id: 'event:public-evening', season: 'n2', title: { en: 'The public Japanese evening', ja: '日本語の夕べ' }, castIds: ['angel', 'francis', 'xingyu'], status: 'planned' },
    { id: 'event:journey', season: 'n1', title: { en: 'The journey', ja: '旅' }, castIds: ['rie', 'rose', 'jodi'], status: 'planned' },
    { id: 'event:graduation', season: 'alumni', title: { en: 'Graduation and the next page', ja: '卒業と次のページ' }, castIds: ['rie', 'henry', 'aakash', 'tom'], status: 'planned' },
];
