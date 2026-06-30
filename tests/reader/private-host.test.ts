import { describe, expect, it } from 'vitest';
import { isPrivateOrLocalHostname } from '../../src/reader/network/private-host';

describe('isPrivateOrLocalHostname', () => {
    it('treats public hosts and public IPs as non-private', () => {
        for (const host of ['jpdb.io', 'api.jiten.moe', 'github.com', '8.8.8.8', '1.1.1.1']) {
            expect(isPrivateOrLocalHostname(host), host).toBe(false);
        }
    });

    it('blocks loopback, localhost, private, CGNAT, and link-local hosts', () => {
        for (const host of ['localhost', 'foo.localhost', '127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.0.1', '100.64.0.1', '169.254.169.254', '0.0.0.0']) {
            expect(isPrivateOrLocalHostname(host), host).toBe(true);
        }
    });

    it('does not over-block public hosts adjacent to private ranges', () => {
        for (const host of ['172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '11.0.0.1']) {
            expect(isPrivateOrLocalHostname(host), host).toBe(false);
        }
    });

    it('decodes obfuscated IPv4 literals', () => {
        expect(isPrivateOrLocalHostname('2130706433')).toBe(true);
        expect(isPrivateOrLocalHostname('0x7f000001')).toBe(true);
        expect(isPrivateOrLocalHostname('127.1')).toBe(true);
        expect(isPrivateOrLocalHostname('0177.0.0.1')).toBe(true);
        expect(isPrivateOrLocalHostname('2852039166')).toBe(true);
        expect(isPrivateOrLocalHostname('134744072')).toBe(false);
    });

    it('blocks ULA, link-local, unspecified IPv6, and IPv4-mapped private IPv6', () => {
        for (const host of ['fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1', '::']) {
            expect(isPrivateOrLocalHostname(host), host).toBe(true);
        }
        expect(isPrivateOrLocalHostname('2606:4700:4700::1111')).toBe(false);
    });
});
