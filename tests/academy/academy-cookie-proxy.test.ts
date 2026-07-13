import { academyCookieForRemote, academySetCookieForLocal } from '../../config/vite/academy-cookie-proxy';

describe('Academy local media proxy cookies', () => {
    it('keeps the production cookie HttpOnly while making only its local transport usable', () => {
        expect(academySetCookieForLocal(
            '__Host-academy_session=token; Path=/; HttpOnly; Secure; SameSite=Lax',
        )).toBe('academy_dev_session=token; Path=/; HttpOnly; SameSite=Lax');
        expect(academySetCookieForLocal(
            '__Host-academy_claim=proof; Path=/; HttpOnly; Secure; SameSite=Lax',
        )).toBe('academy_dev_claim=proof; Path=/; HttpOnly; SameSite=Lax');
    });

    it('restores Academy cookie names upstream without touching unrelated cookies', () => {
        expect(academyCookieForRemote('theme=paper; academy_dev_session=token; other=value'))
            .toBe('theme=paper; __Host-academy_session=token; other=value');
        expect(academySetCookieForLocal('unrelated=value; Path=/; Secure'))
            .toBe('unrelated=value; Path=/; Secure');
    });
});
