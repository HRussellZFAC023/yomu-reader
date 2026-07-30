import 'fake-indexeddb/auto';

import { File } from 'node:buffer';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';

type TargetId = 'th' | 'ru' | 'ar' | 'ko' | 'de' | 'es';

interface CorpusSentence {
    id: string;
    text: string;
    contentWords: readonly string[];
}

interface PublishedDictionary {
    bytes: number;
    sha256: string;
    revision: string;
    url: string;
}

interface GoldSpan {
    sentenceId: string;
    word: string;
    start: number;
    end: number;
}

interface TargetMeasurement {
    language: TargetId;
    dictionary: string;
    dictionaryBytes: number;
    dictionaryRevision: string;
    dictionaryUrl: string;
    sha256: string;
    sentences: number;
    annotated: number;
    contentWords: number;
    percent: number;
    misses: Array<{ sentenceId: string; word: string }>;
    observations: Array<{
        sentenceId: string;
        word: string;
        start: number;
        end: number;
        matchedExpressions: string[];
    }>;
}

const DEFAULT_CACHE_DIR = '/private/tmp/yomu-w11-lookup-cache';
const ACCEPTANCE_PERCENT = 60;
const CHILD_RESULT_PREFIX = 'W11_LOOKUP_RESULT:';
const targets: readonly TargetId[] = ['th', 'ru', 'ar', 'ko', 'de', 'es'];
const execFile = promisify(execFileCallback);

const dictionaries: Record<TargetId, PublishedDictionary> = {
    th: {
        bytes: 2_666_547,
        sha256: 'e38547583923978c0b75337bd523a13c89aedd9b4e31aa44cc67afacd12100ef',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/e38547583923978c0b75337bd523a13c89aedd9b4e31aa44cc67afacd12100ef.zip',
    },
    ru: {
        bytes: 26_007_867,
        sha256: '2d67e8f7b4d1ca0cc7083b198333d4d2fce2c61c3f13ef32abfd39f7c437cb8b',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/2d67e8f7b4d1ca0cc7083b198333d4d2fce2c61c3f13ef32abfd39f7c437cb8b.zip',
    },
    ar: {
        bytes: 13_259_415,
        sha256: 'd1eaa02bc4650b37d90b2b35722be63a9fab4169d791e4c0a1b490f419f9d402',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/d1eaa02bc4650b37d90b2b35722be63a9fab4169d791e4c0a1b490f419f9d402.zip',
    },
    ko: {
        bytes: 7_178_977,
        sha256: '227dc4b28b20f841ded44c13079949f46b689e93da52f370cb0555a329d608d5',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/227dc4b28b20f841ded44c13079949f46b689e93da52f370cb0555a329d608d5.zip',
    },
    de: {
        bytes: 16_936_546,
        sha256: 'a3a053ee7f2f2765dc6876cb698215e6b3607f27e02adf7d74f32bf6147d6f8c',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/a3a053ee7f2f2765dc6876cb698215e6b3607f27e02adf7d74f32bf6147d6f8c.zip',
    },
    es: {
        bytes: 21_074_465,
        sha256: '7d8304996949cb70c7d3c4008a6c7c640f5eaca5edc1084336f266a60575a966',
        revision: '2026.07.15',
        url: 'https://dictionaries.yomureader.com/objects/sha256/7d8304996949cb70c7d3c4008a6c7c640f5eaca5edc1084336f266a60575a966.zip',
    },
};

const corpus: Record<TargetId, readonly CorpusSentence[]> = {
    th: [
        { id: 'th-01', text: 'เช้าวันจันทร์ มาเรียไปตลาดแต่เช้า', contentWords: ['เช้า', 'วันจันทร์', 'มาเรีย', 'ไป', 'ตลาด', 'เช้า'] },
        { id: 'th-02', text: 'เธอซื้อขนมปังสด แอปเปิลสองลูก และน้ำหนึ่งขวด', contentWords: ['ซื้อ', 'ขนมปัง', 'สด', 'แอปเปิล', 'สอง', 'ลูก', 'น้ำ', 'หนึ่ง', 'ขวด'] },
        { id: 'th-03', text: 'คนขายทักทายและถามถึงครอบครัวของเธอ', contentWords: ['คนขาย', 'ทักทาย', 'ถาม', 'ครอบครัว'] },
        { id: 'th-04', text: 'มาเรียบอกว่าลูกของเธอกำลังเรียนอยู่ที่บ้าน', contentWords: ['มาเรีย', 'บอก', 'ลูก', 'กำลัง', 'เรียน', 'บ้าน'] },
        { id: 'th-05', text: 'หลังจากซื้อของ เธอเดินผ่านสวนสาธารณะ', contentWords: ['ซื้อ', 'ของ', 'เดิน', 'สวนสาธารณะ'] },
        { id: 'th-06', text: 'สุนัขตัวเล็กกำลังเล่นอยู่ใกล้ทะเลสาบ', contentWords: ['สุนัข', 'ตัว', 'เล็ก', 'กำลัง', 'เล่น', 'ใกล้', 'ทะเลสาบ'] },
        { id: 'th-07', text: 'เธอนั่งใต้ต้นไม้และอ่านหนังสือเล่มใหม่', contentWords: ['นั่ง', 'ใต้', 'ต้นไม้', 'อ่าน', 'หนังสือ', 'เล่ม', 'ใหม่'] },
        { id: 'th-08', text: 'เมื่อฝนเริ่มตก เธอกางร่มสีน้ำเงิน', contentWords: ['ฝน', 'เริ่ม', 'ตก', 'กาง', 'ร่ม', 'สีน้ำเงิน'] },
        { id: 'th-09', text: 'เธอกลับบ้านด้วยรถบัสก่อนอาหารเย็น', contentWords: ['กลับ', 'บ้าน', 'รถบัส', 'อาหารเย็น'] },
        { id: 'th-10', text: 'ตอนค่ำ ทุกคนในครอบครัวกินข้าวและคุยกันเรื่องวันนี้', contentWords: ['ตอนค่ำ', 'ทุกคน', 'ครอบครัว', 'กิน', 'ข้าว', 'คุย', 'เรื่อง', 'วันนี้'] },
    ],
    ru: [
        { id: 'ru-01', text: 'В понедельник Мария рано пошла на рынок.', contentWords: ['понедельник', 'Мария', 'рано', 'пошла', 'рынок'] },
        { id: 'ru-02', text: 'Она купила свежий хлеб, два яблока и бутылку воды.', contentWords: ['купила', 'свежий', 'хлеб', 'два', 'яблока', 'бутылку', 'воды'] },
        { id: 'ru-03', text: 'Продавец поздоровался с ней и спросил о семье.', contentWords: ['Продавец', 'поздоровался', 'спросил', 'семье'] },
        { id: 'ru-04', text: 'Мария сказала, что её дети учатся дома.', contentWords: ['Мария', 'сказала', 'дети', 'учатся', 'дома'] },
        { id: 'ru-05', text: 'После покупок она прошла через парк.', contentWords: ['покупок', 'прошла', 'парк'] },
        { id: 'ru-06', text: 'Маленькая собака играла возле озера.', contentWords: ['Маленькая', 'собака', 'играла', 'озера'] },
        { id: 'ru-07', text: 'Она села под деревом и прочитала новую книгу.', contentWords: ['села', 'деревом', 'прочитала', 'новую', 'книгу'] },
        { id: 'ru-08', text: 'Когда начался дождь, она открыла синий зонт.', contentWords: ['начался', 'дождь', 'открыла', 'синий', 'зонт'] },
        { id: 'ru-09', text: 'До ужина она вернулась домой на автобусе.', contentWords: ['ужина', 'вернулась', 'домой', 'автобусе'] },
        { id: 'ru-10', text: 'Вечером вся семья ела вместе и говорила о прошедшем дне.', contentWords: ['Вечером', 'семья', 'ела', 'вместе', 'говорила', 'прошедшем', 'дне'] },
    ],
    ar: [
        { id: 'ar-01', text: 'ذهبت ماريا إلى السوق باكرا يوم الاثنين.', contentWords: ['ذهبت', 'ماريا', 'السوق', 'باكرا', 'الاثنين'] },
        { id: 'ar-02', text: 'اشترت خبزا طازجا وتفاحتين وزجاجة ماء.', contentWords: ['اشترت', 'خبزا', 'طازجا', 'تفاحتين', 'زجاجة', 'ماء'] },
        { id: 'ar-03', text: 'حياها البائع وسألها عن أسرتها.', contentWords: ['حياها', 'البائع', 'سألها', 'أسرتها'] },
        { id: 'ar-04', text: 'قالت ماريا إن أطفالها يدرسون في البيت.', contentWords: ['قالت', 'ماريا', 'أطفالها', 'يدرسون', 'البيت'] },
        { id: 'ar-05', text: 'بعد التسوق مشت عبر الحديقة.', contentWords: ['التسوق', 'مشت', 'الحديقة'] },
        { id: 'ar-06', text: 'كان كلب صغير يلعب قرب البحيرة.', contentWords: ['كلب', 'صغير', 'يلعب', 'البحيرة'] },
        { id: 'ar-07', text: 'جلست تحت شجرة وقرأت كتابا جديدا.', contentWords: ['جلست', 'شجرة', 'قرأت', 'كتابا', 'جديدا'] },
        { id: 'ar-08', text: 'عندما بدأ المطر فتحت مظلتها الزرقاء.', contentWords: ['بدأ', 'المطر', 'فتحت', 'مظلتها', 'الزرقاء'] },
        { id: 'ar-09', text: 'عادت إلى المنزل بالحافلة قبل العشاء.', contentWords: ['عادت', 'المنزل', 'بالحافلة', 'العشاء'] },
        { id: 'ar-10', text: 'في المساء أكلت الأسرة كلها معا وتحدثت عن يومها.', contentWords: ['المساء', 'أكلت', 'الأسرة', 'كلها', 'معا', 'تحدثت', 'يومها'] },
    ],
    ko: [
        { id: 'ko-01', text: '월요일에 마리아는 아침 일찍 시장에 갔습니다.', contentWords: ['월요일', '마리아', '아침', '일찍', '시장', '갔습니다'] },
        { id: 'ko-02', text: '신선한 빵과 사과 두 개, 물 한 병을 샀습니다.', contentWords: ['신선한', '빵', '사과', '두', '개', '물', '한', '병', '샀습니다'] },
        { id: 'ko-03', text: '가게 주인은 인사를 하고 가족의 안부를 물었습니다.', contentWords: ['가게', '주인', '인사', '가족', '안부', '물었습니다'] },
        { id: 'ko-04', text: '마리아는 아이들이 집에서 공부한다고 말했습니다.', contentWords: ['마리아', '아이들', '집', '공부한다고', '말했습니다'] },
        { id: 'ko-05', text: '장을 본 뒤 공원을 걸었습니다.', contentWords: ['장', '본', '뒤', '공원', '걸었습니다'] },
        { id: 'ko-06', text: '작은 개가 호수 근처에서 놀고 있었습니다.', contentWords: ['작은', '개', '호수', '근처', '놀고', '있었습니다'] },
        { id: 'ko-07', text: '나무 아래에 앉아 새 책을 읽었습니다.', contentWords: ['나무', '아래', '앉아', '새', '책', '읽었습니다'] },
        { id: 'ko-08', text: '비가 내리기 시작하자 파란 우산을 폈습니다.', contentWords: ['비', '내리기', '시작하자', '파란', '우산', '폈습니다'] },
        { id: 'ko-09', text: '저녁 식사 전에 버스를 타고 집으로 돌아왔습니다.', contentWords: ['저녁', '식사', '전', '버스', '타고', '집', '돌아왔습니다'] },
        { id: 'ko-10', text: '저녁에는 온 가족이 함께 밥을 먹으며 하루 이야기를 나눴습니다.', contentWords: ['저녁', '온', '가족', '함께', '밥', '먹으며', '하루', '이야기', '나눴습니다'] },
    ],
    de: [
        { id: 'de-01', text: 'Am Montag ging Maria früh zum Markt.', contentWords: ['Montag', 'Maria', 'ging', 'früh', 'Markt'] },
        { id: 'de-02', text: 'Sie kaufte frisches Brot, zwei Äpfel und eine Flasche Wasser.', contentWords: ['kaufte', 'frisches', 'Brot', 'zwei', 'Äpfel', 'Flasche', 'Wasser'] },
        { id: 'de-03', text: 'Der Verkäufer begrüßte sie und fragte nach ihrer Familie.', contentWords: ['Verkäufer', 'begrüßte', 'fragte', 'Familie'] },
        { id: 'de-04', text: 'Maria sagte, dass ihre Kinder zu Hause lernten.', contentWords: ['Maria', 'sagte', 'Kinder', 'Hause', 'lernten'] },
        { id: 'de-05', text: 'Nach dem Einkauf ging sie durch den Park.', contentWords: ['Einkauf', 'ging', 'Park'] },
        { id: 'de-06', text: 'Ein kleiner Hund spielte in der Nähe des Sees.', contentWords: ['kleiner', 'Hund', 'spielte', 'Nähe', 'Sees'] },
        { id: 'de-07', text: 'Sie setzte sich unter einen Baum und las ein neues Buch.', contentWords: ['setzte', 'Baum', 'las', 'neues', 'Buch'] },
        { id: 'de-08', text: 'Als es zu regnen begann, öffnete sie ihren blauen Regenschirm.', contentWords: ['regnen', 'begann', 'öffnete', 'blauen', 'Regenschirm'] },
        { id: 'de-09', text: 'Vor dem Abendessen fuhr sie mit dem Bus nach Hause.', contentWords: ['Abendessen', 'fuhr', 'Bus', 'Hause'] },
        { id: 'de-10', text: 'Am Abend aß die ganze Familie zusammen und sprach über den Tag.', contentWords: ['Abend', 'aß', 'Familie', 'zusammen', 'sprach', 'Tag'] },
    ],
    es: [
        { id: 'es-01', text: 'El lunes, María fue temprano al mercado.', contentWords: ['lunes', 'María', 'fue', 'temprano', 'mercado'] },
        { id: 'es-02', text: 'Compró pan fresco, dos manzanas y una botella de agua.', contentWords: ['Compró', 'pan', 'fresco', 'dos', 'manzanas', 'botella', 'agua'] },
        { id: 'es-03', text: 'El vendedor la saludó y preguntó por su familia.', contentWords: ['vendedor', 'saludó', 'preguntó', 'familia'] },
        { id: 'es-04', text: 'María dijo que sus hijos estudiaban en casa.', contentWords: ['María', 'dijo', 'hijos', 'estudiaban', 'casa'] },
        { id: 'es-05', text: 'Después de comprar, caminó por el parque.', contentWords: ['Después', 'comprar', 'caminó', 'parque'] },
        { id: 'es-06', text: 'Un perro pequeño jugaba cerca del lago.', contentWords: ['perro', 'pequeño', 'jugaba', 'cerca', 'lago'] },
        { id: 'es-07', text: 'Se sentó bajo un árbol y leyó un libro nuevo.', contentWords: ['sentó', 'árbol', 'leyó', 'libro', 'nuevo'] },
        { id: 'es-08', text: 'Cuando empezó a llover, abrió su paraguas azul.', contentWords: ['empezó', 'llover', 'abrió', 'paraguas', 'azul'] },
        { id: 'es-09', text: 'Volvió a casa en autobús antes de la cena.', contentWords: ['Volvió', 'casa', 'autobús', 'cena'] },
        { id: 'es-10', text: 'Por la noche, toda la familia comió junta y habló del día.', contentWords: ['noche', 'familia', 'comió', 'junta', 'habló', 'día'] },
    ],
};

function cliValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function locateGoldSpans(sentence: CorpusSentence): GoldSpan[] {
    const spans: GoldSpan[] = [];
    const occupied: Array<{ start: number; end: number }> = [];
    for (const word of sentence.contentWords) {
        let start = sentence.text.indexOf(word);
        while (
            start >= 0
            && occupied.some(span => start < span.end && start + word.length > span.start)
        ) {
            start = sentence.text.indexOf(word, start + 1);
        }
        if (start < 0) {
            throw new Error(`${sentence.id}: content-word ledger entry "${word}" is absent or overlaps another entry.`);
        }
        const span = { sentenceId: sentence.id, word, start, end: start + word.length };
        spans.push(span);
        occupied.push(span);
    }
    return spans;
}

async function verifyArchive(path: string, expected: PublishedDictionary): Promise<Uint8Array> {
    try {
        await stat(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        process.stderr.write(`Downloading ${expected.url}...\n`);
        const response = await fetch(expected.url);
        if (!response.ok) throw new Error(`Dictionary download failed: ${response.status} ${response.statusText}.`);
        const downloaded = new Uint8Array(await response.arrayBuffer());
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, downloaded);
    }
    const archiveStat = await stat(path);
    if (archiveStat.size !== expected.bytes) {
        throw new Error(`${path}: expected ${expected.bytes} bytes, found ${archiveStat.size}.`);
    }
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expected.sha256) {
        throw new Error(`${path}: expected SHA-256 ${expected.sha256}, found ${sha256}.`);
    }
    return bytes;
}

async function measureTarget(language: TargetId, cacheDir: string): Promise<TargetMeasurement> {
    const target = setActiveLearningTargetLanguage(language);
    if (!target) throw new Error(`No learning-target module is registered for ${language}.`);

    const dictionary = `wty-${language}-en`;
    const expected = dictionaries[language];
    const archivePath = resolve(cacheDir, `${dictionary}.zip`);
    const bytes = await verifyArchive(archivePath, expected);
    const store = new YomitanDictionaryStore();
    await store.clear();
    await store.importFile(
        new File([bytes], `${dictionary}.zip`, { type: 'application/zip' }),
        undefined,
        '',
        {
            persistArchive: false,
            integrity: expected,
        },
    );

    let annotated = 0;
    let contentWords = 0;
    const misses: Array<{ sentenceId: string; word: string }> = [];
    const observations: TargetMeasurement['observations'] = [];
    for (const sentence of corpus[language]) {
        const gold = locateGoldSpans(sentence);
        const matches = await store.findTermMatches(sentence.text, 128);
        for (const span of gold) {
            contentWords++;
            const exactMatches = matches.filter(match => match.start === span.start && match.end === span.end);
            const matchedExpressions = [...new Set(exactMatches.map(match => match.entry.expression))];
            observations.push({
                sentenceId: span.sentenceId,
                word: span.word,
                start: span.start,
                end: span.end,
                matchedExpressions,
            });
            if (matchedExpressions.length) {
                annotated++;
            } else {
                misses.push({ sentenceId: span.sentenceId, word: span.word });
            }
        }
    }
    await store.clear();
    return {
        language,
        dictionary,
        dictionaryBytes: expected.bytes,
        dictionaryRevision: expected.revision,
        dictionaryUrl: expected.url,
        sha256: expected.sha256,
        sentences: corpus[language].length,
        annotated,
        contentWords,
        percent: Number(((annotated / contentWords) * 100).toFixed(1)),
        misses,
        observations,
    };
}

function isTargetId(value: string | undefined): value is TargetId {
    return Boolean(value && targets.includes(value as TargetId));
}

async function runTargetChild(language: TargetId, cacheDir: string): Promise<TargetMeasurement> {
    const scriptPath = fileURLToPath(import.meta.url);
    const viteNodePath = resolve('node_modules/vite-node/vite-node.mjs');
    return new Promise<TargetMeasurement>((resolveResult, reject) => {
        const child = spawn(process.execPath, [
            viteNodePath,
            scriptPath,
            '--target',
            language,
            '--cache-dir',
            cacheDir,
        ], {
            env: process.env,
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        let pending = '';
        let result: TargetMeasurement | undefined;
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            pending += chunk;
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            for (const line of lines) {
                if (line.startsWith(CHILD_RESULT_PREFIX)) {
                    result = JSON.parse(line.slice(CHILD_RESULT_PREFIX.length)) as TargetMeasurement;
                } else {
                    process.stderr.write(`${line}\n`);
                }
            }
        });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error(`Measurement child for ${language} exited ${String(code)}.`));
                return;
            }
            if (!result) {
                reject(new Error(`Measurement child for ${language} returned no result.`));
                return;
            }
            resolveResult(result);
        });
    });
}

function installWindowAlias(): void {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: globalThis,
        writable: true,
    });
}

async function runMetadata(): Promise<Record<string, unknown>> {
    const [commit, status, harnessBytes] = await Promise.all([
        execFile('git', ['rev-parse', 'HEAD']).then(result => result.stdout.trim()),
        execFile('git', ['status', '--porcelain=v1', '--untracked-files=all']).then(result => result.stdout.trim()),
        readFile(fileURLToPath(import.meta.url)),
    ]);
    return {
        variant: cliValue('--variant') ?? 'unspecified',
        gitCommit: commit,
        gitDirty: Boolean(status),
        node: process.version,
        icu: process.versions.icu,
        harnessSha256: createHash('sha256').update(harnessBytes).digest('hex'),
        corpusSha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'),
    };
}

async function main(): Promise<void> {
    for (const language of targets) {
        if (corpus[language].length !== 10) throw new Error(`${language}: expected exactly ten sentences.`);
        for (const sentence of corpus[language]) locateGoldSpans(sentence);
    }
    const cacheDir = resolve(cliValue('--cache-dir') ?? DEFAULT_CACHE_DIR);
    const outputPath = cliValue('--json');
    const selectedTarget = cliValue('--target');
    if (selectedTarget !== undefined) {
        if (!isTargetId(selectedTarget)) throw new Error(`Unsupported --target ${selectedTarget}.`);
        installWindowAlias();
        try {
            const result = await measureTarget(selectedTarget, cacheDir);
            console.log(`${CHILD_RESULT_PREFIX}${JSON.stringify(result)}`);
        } finally {
            resetActiveLearningTargetLanguage();
        }
        return;
    }

    const results: TargetMeasurement[] = [];
    for (const language of targets) {
        process.stderr.write(`Measuring ${language} with wty-${language}-en...\n`);
        results.push(await runTargetChild(language, cacheDir));
    }

    const result = {
        measuredAt: new Date().toISOString(),
        ...(await runMetadata()),
        suggestedBenchmarkPercent: ACCEPTANCE_PERCENT,
        corpusRule: 'An occurrence counts only when an annotation match has exactly the reviewed content-word span.',
        ledgerPolicy: {
            ko: 'Particles are excluded; the reviewed span is the visible lexical prefix inside the eojeol.',
            ar: 'Attached clitics stay inside the reviewed orthographic-word span.',
            compounds: 'Reviewed compounds are one occurrence; nested component spans are not counted.',
        },
        results,
    };
    console.table(results.map(item => ({
        language: item.language,
        annotated: item.annotated,
        contentWords: item.contentWords,
        percent: `${item.percent.toFixed(1)}%`,
        suggestedBar: item.percent >= ACCEPTANCE_PERCENT ? 'MEETS' : 'BELOW',
    })));
    console.log(JSON.stringify(result, null, 2));
    if (outputPath) {
        const resolvedOutput = resolve(outputPath);
        await mkdir(dirname(resolvedOutput), { recursive: true });
        await writeFile(resolvedOutput, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
}

await main();
