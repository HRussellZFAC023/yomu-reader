// A minimal Yomitan-format ZIP (stored entries) for the lookup-perf gate.
//
// Deliberately its own module rather than a copy inside the gate: the ZIP writer
// is the same one furigana-local-default-smoke.mjs needs, and a second inline
// copy is how two fixtures drift apart.
const FIXTURE_TERMS = [
    ['図書館', 'としょかん', '', '', 10, ['library'], 1, ''],
    ['漢字', 'かんじ', '', '', 10, ['Chinese character', 'kanji'], 2, ''],
    ['調べる', 'しらべる', '', 'v1', 10, ['to look up'], 3, ''],
    ['練習', 'れんしゅう', '', 'vs', 10, ['practice'], 4, ''],
    ['静か', 'しずか', '', 'adj-na', 10, ['quiet'], 5, ''],
];

export function miniLookupDictionaryZip() {
    return zipBuffer({
        'index.json': { title: 'Mini Lookup Perf', format: 3, revision: 'lookup-perf-1' },
        'term_bank_1.json': FIXTURE_TERMS,
        'term_meta_bank_1.json': FIXTURE_TERMS.map(([expression, reading]) => [
            expression,
            'pitch',
            { reading, pitches: [{ position: 0 }] },
        ]),
    });
}

function zipBuffer(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const [name, value] of Object.entries(files)) {
        const nameBytes = Buffer.from(encoder.encode(name));
        const data = Buffer.from(encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)));
        const crc = crc32(data);
        const local = Buffer.alloc(30 + nameBytes.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8); // stored
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        nameBytes.copy(local, 30);
        localParts.push(local, data);
        const central = Buffer.alloc(46 + nameBytes.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        nameBytes.copy(central, 46);
        centralParts.push(central);
        offset += local.length + data.length;
    }
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
