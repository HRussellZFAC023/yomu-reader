import { ACADEMY_CLASS_EVENTS } from '../../src/academy/content/class-event-catalog';

describe('Class event catalog', () => {
    it('keeps the planned class photograph without exposing the retired first-term title', () => {
        const photograph = ACADEMY_CLASS_EVENTS.find(event => event.id === 'event:first-term-photo');

        expect(photograph).toMatchObject({
            title: { en: 'The class photograph', ja: 'クラス写真' },
            castIds: ['peter', 'shaun'],
            status: 'planned',
        });
        expect(ACADEMY_CLASS_EVENTS.flatMap(event => [event.title.en, event.title.ja])).not.toEqual(
            expect.arrayContaining(['First term', '最初の学期']),
        );
    });
});
