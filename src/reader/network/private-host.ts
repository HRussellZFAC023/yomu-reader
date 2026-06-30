const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 0x00ffffff],
    [0x0a000000, 0x0affffff],
    [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff],
    [0xa9fe0000, 0xa9feffff],
    [0xac100000, 0xac1fffff],
    [0xc0a80000, 0xc0a8ffff],
];

export function isPrivateOrLocalHostname(hostname: string): boolean {
    const host = stripIpv6Brackets(hostname.trim().toLowerCase());
    if (!host) return true;
    return isLocalhostName(host) || isPrivateIpv4(host) || isPrivateIpv6(host);
}

function stripIpv6Brackets(host: string): string {
    return host.replace(/^\[/u, '').replace(/\]$/u, '');
}

function isLocalhostName(host: string): boolean {
    return host === 'localhost' || host.endsWith('.localhost');
}

function isPrivateIpv4(host: string): boolean {
    const value = ipv4LiteralToInt(host);
    return value !== null && isPrivateIpv4Int(value);
}

function isPrivateIpv4Int(value: number): boolean {
    return PRIVATE_IPV4_RANGES.some(([low, high]) => value >= low && value <= high);
}

function ipv4LiteralToInt(host: string): number | null {
    const fields = host.split('.');
    if (fields.length === 0 || fields.length > 4) return null;
    const values: number[] = [];
    for (const field of fields) {
        const value = parseIpv4Field(field);
        if (value === null) return null;
        values.push(value);
    }
    const head = values.slice(0, -1);
    if (head.some(value => value > 0xff)) return null;
    const tail = values[values.length - 1];
    const tailBytes = 4 - head.length;
    const tailMax = tailBytes >= 4 ? 0xffffffff : 256 ** tailBytes - 1;
    if (tail > tailMax) return null;
    let result = 0;
    for (const value of head) result = result * 256 + value;
    return result * 256 ** tailBytes + tail;
}

function parseIpv4Field(field: string): number | null {
    if (!field) return null;
    if (/^0x[0-9a-f]+$/iu.test(field)) return finiteNonNegative(parseInt(field.slice(2), 16));
    if (/^0[0-7]+$/u.test(field)) return finiteNonNegative(parseInt(field.slice(1), 8));
    if (/^[0-9]+$/u.test(field)) return finiteNonNegative(parseInt(field, 10));
    return null;
}

function finiteNonNegative(value: number): number | null {
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function isPrivateIpv6(host: string): boolean {
    if (!host.includes(':')) return false;
    if (host === '::1' || host === '::') return true;
    const mapped = host.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/u);
    if (mapped) {
        const value = ipv4LiteralToInt(mapped[1]);
        if (value !== null && isPrivateIpv4Int(value)) return true;
    }
    return host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/u.test(host);
}
