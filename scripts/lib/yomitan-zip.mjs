// Minimal Yomitan-format ZIP builder (stored entries, no compression) for
// smoke fixtures: pass { 'index.json': {...}, 'term_bank_1.json': [...] }.
export function yomitanZipBuffer(files) {
    const encoder = new TextEncoder();
    const entries = Object.entries(files).map(([name, value]) => ({
        name: encoder.encode(name),
        data: encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)),
    }));
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
        const crc = crc32(entry.data);
        const local = new Uint8Array(30 + entry.name.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, entry.data.length, true);
        view.setUint32(22, entry.data.length, true);
        view.setUint16(26, entry.name.length, true);
        local.set(entry.name, 30);
        chunks.push(local, entry.data);
        const record = new Uint8Array(46 + entry.name.length);
        const recordView = new DataView(record.buffer);
        recordView.setUint32(0, 0x02014b50, true);
        recordView.setUint16(4, 20, true);
        recordView.setUint16(6, 20, true);
        recordView.setUint32(16, crc, true);
        recordView.setUint32(20, entry.data.length, true);
        recordView.setUint32(24, entry.data.length, true);
        recordView.setUint16(28, entry.name.length, true);
        recordView.setUint32(42, offset, true);
        record.set(entry.name, 46);
        central.push(record);
        offset += local.length + entry.data.length;
    }
    const centralSize = central.reduce((total, record) => total + record.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return Buffer.concat([...chunks, ...central, end].map(part => Buffer.from(part)));
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}
