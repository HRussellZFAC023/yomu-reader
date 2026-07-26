import type { DictionaryCategory } from './catalog';
import { LEARNER_LANGUAGE_IDS, type LearnerLanguageId } from '../locales';

/**
 * Chrome for the "everything else the mirror hosts" panel.
 *
 * The recommendation seed above it is written in the learner's own language for
 * all 32 Slice 1 languages; the browse panel is the same shelf continued, so it
 * cannot be the one part of Settings that only speaks English and Japanese.
 * These strings therefore live on the learner-language axis, not on the two-way
 * interface-language table.
 */
export interface CatalogBrowseCopy {
    readonly title: string;
    /** Carries {count} and {size}. */
    readonly summary: string;
    readonly searchLabel: string;
    readonly noResults: string;
    readonly categories: Readonly<Record<DictionaryCategory, string>>;
}

/** Positional order of every `categories` tuple below. */
export const CATALOG_BROWSE_CATEGORY_ORDER = [
    'terms',
    'names',
    'grammar',
    'kanji',
    'frequency',
    'pronunciation',
    'examples',
    'thesaurus',
    'encyclopedia',
    'utility',
] as const satisfies readonly DictionaryCategory[];

type CategoryNames = readonly [string, string, string, string, string, string, string, string, string, string];

interface CatalogBrowseCopySource {
    readonly title: string;
    readonly summary: string;
    readonly searchLabel: string;
    readonly noResults: string;
    readonly categories: CategoryNames;
}

const CATALOG_BROWSE_COPY_SOURCE: Readonly<Record<LearnerLanguageId, CatalogBrowseCopySource>> = {
    sq: {
        title: 'Të gjithë fjalorët e pasqyruar',
        summary: '{count} fjalorë të tjerë · gjithsej {size}',
        searchLabel: 'Kërko fjalorë',
        noResults: 'Asnjë fjalor nuk përputhet me kërkimin.',
        categories: ['Fjalorë fjalësh', 'Fjalorë emrash', 'Fjalorë gramatikorë', 'Fjalorë kanxhish', 'Fjalorë frekuence', 'Fjalorë theksi', 'Fjalorë me fjali shembull', 'Fjalorë sinonimish', 'Enciklopedi', 'Fjalorë ndihmës'],
    },
    grc: {
        title: 'Πάντα τὰ λεξικὰ τοῦ ταμιείου',
        summary: 'Ἕτερα λεξικά: {count} · σύμπαν {size}',
        searchLabel: 'Ζήτει λεξικά',
        noResults: 'Οὐδὲν λεξικὸν εὑρέθη.',
        categories: ['Λεξικὰ λέξεων', 'Λεξικὰ ὀνομάτων', 'Λεξικὰ γραμματικῆς', 'Λεξικὰ κανζί', 'Λεξικὰ συχνότητος', 'Λεξικὰ τόνου', 'Λεξικὰ παραδειγμάτων', 'Λεξικὰ συνωνύμων', 'Ἐγκυκλοπαίδειαι', 'Λεξικὰ βοηθητικά'],
    },
    ar: {
        title: 'كل القواميس المستضافة',
        summary: 'قواميس أخرى: ⁨{count}⁩ · الإجمالي ⁨{size}⁩',
        searchLabel: 'ابحث في القواميس',
        noResults: 'لا توجد قواميس مطابقة لبحثك.',
        categories: ['قواميس المفردات', 'قواميس أسماء الأعلام', 'قواميس القواعد', 'قواميس الكانجي', 'قواميس التكرار', 'قواميس النبر', 'قواميس الجمل التوضيحية', 'معاجم المترادفات', 'الموسوعات', 'قواميس مساعدة'],
    },
    yue: {
        title: '所有鏡像字典',
        summary: '仲有 {count} 本字典 · 合共 {size}',
        searchLabel: '搜尋字典',
        noResults: '搵唔到符合嘅字典。',
        categories: ['詞語字典', '專名字典', '文法字典', '漢字字典', '詞頻字典', '聲調字典', '例句字典', '同義詞字典', '百科全書', '輔助字典'],
    },
    zh: {
        title: '全部镜像词典',
        summary: '另有 {count} 部词典 · 共 {size}',
        searchLabel: '搜索词典',
        noResults: '没有匹配的词典。',
        categories: ['词语词典', '专名词典', '语法词典', '汉字词典', '词频词典', '音调词典', '例句词典', '同义词词典', '百科全书', '辅助词典'],
    },
    da: {
        title: 'Alle spejlede ordbøger',
        summary: '{count} flere ordbøger · {size} i alt',
        searchLabel: 'Søg i ordbøger',
        noResults: 'Ingen ordbøger matcher din søgning.',
        categories: ['Ordbøger', 'Navneordbøger', 'Grammatikordbøger', 'Kanji-ordbøger', 'Frekvensordbøger', 'Tonegangsordbøger', 'Eksempelsætningsordbøger', 'Synonymordbøger', 'Encyklopædier', 'Hjælpeordbøger'],
    },
    nl: {
        title: 'Alle gespiegelde woordenboeken',
        summary: '{count} extra woordenboeken · {size} in totaal',
        searchLabel: 'Woordenboeken zoeken',
        noResults: 'Geen woordenboeken gevonden voor je zoekopdracht.',
        categories: ['Woordenboeken', 'Namenwoordenboeken', 'Grammaticawoordenboeken', 'Kanjiwoordenboeken', 'Frequentiewoordenboeken', 'Toonhoogtewoordenboeken', 'Voorbeeldzinwoordenboeken', 'Synoniemenwoordenboeken', 'Encyclopedieën', 'Hulpwoordenboeken'],
    },
    en: {
        title: 'All mirrored dictionaries',
        summary: '{count} more dictionaries · {size} total',
        searchLabel: 'Search dictionaries',
        noResults: 'No dictionaries match your search.',
        categories: ['Term dictionaries', 'Name dictionaries', 'Grammar dictionaries', 'Kanji dictionaries', 'Frequency dictionaries', 'Pitch dictionaries', 'Example sentence dictionaries', 'Thesauruses', 'Encyclopedias', 'Utility dictionaries'],
    },
    fi: {
        title: 'Kaikki peilatut sanakirjat',
        summary: '{count} sanakirjaa lisää · yhteensä {size}',
        searchLabel: 'Hae sanakirjoja',
        noResults: 'Hakua vastaavia sanakirjoja ei löytynyt.',
        categories: ['Sanakirjat', 'Nimisanakirjat', 'Kielioppisanakirjat', 'Kanji-sanakirjat', 'Yleisyyssanakirjat', 'Sävelkulkusanakirjat', 'Esimerkkilausesanakirjat', 'Synonyymisanakirjat', 'Tietosanakirjat', 'Apusanakirjat'],
    },
    fr: {
        title: 'Tous les dictionnaires hébergés',
        summary: '{count} dictionnaires de plus · {size} au total',
        searchLabel: 'Rechercher des dictionnaires',
        noResults: 'Aucun dictionnaire ne correspond à votre recherche.',
        categories: ['Dictionnaires de mots', 'Dictionnaires de noms propres', 'Dictionnaires de grammaire', 'Dictionnaires de kanji', 'Dictionnaires de fréquence', 'Dictionnaires d’accent tonique', 'Dictionnaires de phrases d’exemple', 'Dictionnaires de synonymes', 'Encyclopédies', 'Dictionnaires utilitaires'],
    },
    de: {
        title: 'Alle gespiegelten Wörterbücher',
        summary: '{count} weitere Wörterbücher · {size} insgesamt',
        searchLabel: 'Wörterbücher durchsuchen',
        noResults: 'Keine Wörterbücher passen zu deiner Suche.',
        categories: ['Wortwörterbücher', 'Namenswörterbücher', 'Grammatikwörterbücher', 'Kanji-Wörterbücher', 'Häufigkeitswörterbücher', 'Tonhöhenwörterbücher', 'Beispielsatzwörterbücher', 'Synonymwörterbücher', 'Enzyklopädien', 'Hilfswörterbücher'],
    },
    el: {
        title: 'Όλα τα φιλοξενούμενα λεξικά',
        summary: '{count} επιπλέον λεξικά · {size} συνολικά',
        searchLabel: 'Αναζήτηση λεξικών',
        noResults: 'Κανένα λεξικό δεν ταιριάζει με την αναζήτησή σας.',
        categories: ['Λεξικά λέξεων', 'Λεξικά κύριων ονομάτων', 'Λεξικά γραμματικής', 'Λεξικά κανζί', 'Λεξικά συχνότητας', 'Λεξικά τονισμού', 'Λεξικά παραδειγμάτων', 'Λεξικά συνωνύμων', 'Εγκυκλοπαίδειες', 'Βοηθητικά λεξικά'],
    },
    hu: {
        title: 'Az összes tükrözött szótár',
        summary: 'További szótárak: {count} · összesen {size}',
        searchLabel: 'Szótárak keresése',
        noResults: 'Nincs a keresésnek megfelelő szótár.',
        categories: ['Szótárak', 'Névszótárak', 'Nyelvtani szótárak', 'Kandzsiszótárak', 'Gyakorisági szótárak', 'Hangsúlyszótárak', 'Példamondat-szótárak', 'Szinonimaszótárak', 'Lexikonok', 'Segédszótárak'],
    },
    id: {
        title: 'Semua kamus yang dicerminkan',
        summary: '{count} kamus lainnya · total {size}',
        searchLabel: 'Cari kamus',
        noResults: 'Tidak ada kamus yang cocok dengan pencarian Anda.',
        categories: ['Kamus kata', 'Kamus nama diri', 'Kamus tata bahasa', 'Kamus kanji', 'Kamus frekuensi', 'Kamus aksen nada', 'Kamus kalimat contoh', 'Tesaurus', 'Ensiklopedia', 'Kamus pendukung'],
    },
    it: {
        title: 'Tutti i dizionari ospitati',
        summary: 'Altri {count} dizionari · {size} in totale',
        searchLabel: 'Cerca dizionari',
        noResults: 'Nessun dizionario corrisponde alla ricerca.',
        categories: ['Dizionari di parole', 'Dizionari di nomi propri', 'Dizionari di grammatica', 'Dizionari di kanji', 'Dizionari di frequenza', 'Dizionari di accento tonale', 'Dizionari di frasi di esempio', 'Dizionari dei sinonimi', 'Enciclopedie', 'Dizionari di utilità'],
    },
    km: {
        title: 'វចនានុក្រមទាំងអស់ដែលបានចម្លង',
        summary: 'វចនានុក្រមផ្សេងទៀត៖ {count} · សរុប {size}',
        searchLabel: 'ស្វែងរកវចនានុក្រម',
        noResults: 'រកមិនឃើញវចនានុក្រមដែលត្រូវនឹងការស្វែងរកទេ។',
        categories: ['វចនានុក្រមពាក្យ', 'វចនានុក្រមឈ្មោះ', 'វចនានុក្រមវេយ្យាករណ៍', 'វចនានុក្រមកានជិ', 'វចនានុក្រមប្រេកង់', 'វចនានុក្រមសំឡេងកម្ពស់', 'វចនានុក្រមឧទាហរណ៍ប្រយោគ', 'វចនានុក្រមពាក្យដូច', 'សព្វវចនាធិប្បាយ', 'វចនានុក្រមជំនួយ'],
    },
    ko: {
        title: '미러링된 모든 사전',
        summary: '사전 {count}개 더 · 총 {size}',
        searchLabel: '사전 검색',
        noResults: '검색과 일치하는 사전이 없습니다.',
        categories: ['어휘 사전', '고유명사 사전', '문법 사전', '한자 사전', '빈도 사전', '악센트 사전', '예문 사전', '유의어 사전', '백과사전', '보조 사전'],
    },
    lo: {
        title: 'ວັດຈະນານຸກົມທັງໝົດທີ່ເກັບໄວ້',
        summary: 'ວັດຈະນານຸກົມອື່ນ {count} ຫົວ · ລວມ {size}',
        searchLabel: 'ຄົ້ນຫາວັດຈະນານຸກົມ',
        noResults: 'ບໍ່ພົບວັດຈະນານຸກົມທີ່ກົງກັບການຄົ້ນຫາ.',
        categories: ['ວັດຈະນານຸກົມຄຳສັບ', 'ວັດຈະນານຸກົມຊື່ສະເພາະ', 'ວັດຈະນານຸກົມໄວຍາກອນ', 'ວັດຈະນານຸກົມຄັນຈິ', 'ວັດຈະນານຸກົມຄວາມຖີ່', 'ວັດຈະນານຸກົມສຽງສູງຕ່ຳ', 'ວັດຈະນານຸກົມປະໂຫຍກຕົວຢ່າງ', 'ວັດຈະນານຸກົມຄຳຄ້າຍ', 'ສາລານຸກົມ', 'ວັດຈະນານຸກົມຊ່ວຍ'],
    },
    la: {
        title: 'Omnia dictionaria in promptuario',
        summary: 'Dictionaria alia: {count} · summa {size}',
        searchLabel: 'Dictionaria quaerere',
        noResults: 'Nulla dictionaria quaesitis respondent.',
        categories: ['Dictionaria verborum', 'Dictionaria nominum', 'Dictionaria grammatica', 'Dictionaria kanji', 'Dictionaria frequentiae', 'Dictionaria accentus', 'Dictionaria exemplorum', 'Dictionaria synonymorum', 'Encyclopaediae', 'Dictionaria auxiliaria'],
    },
    mn: {
        title: 'Толгой хуулбарласан бүх толь бичиг',
        summary: 'Бусад толь бичиг: {count} · нийт {size}',
        searchLabel: 'Толь бичиг хайх',
        noResults: 'Хайлтад тохирох толь бичиг олдсонгүй.',
        categories: ['Үгийн толь', 'Нэрийн толь', 'Хэл зүйн толь', 'Ханзны толь', 'Давтамжийн толь', 'Өргөлтийн толь', 'Жишээ өгүүлбэрийн толь', 'Ойролцоо утгын толь', 'Нэвтэрхий толь', 'Туслах толь'],
    },
    fa: {
        title: 'همهٔ واژه‌نامه‌های میزبانی‌شده',
        summary: 'واژه‌نامه‌های دیگر: ⁨{count}⁩ · مجموع ⁨{size}⁩',
        searchLabel: 'جست‌وجوی واژه‌نامه‌ها',
        noResults: 'هیچ واژه‌نامه‌ای با جست‌وجوی شما مطابقت ندارد.',
        categories: ['واژه‌نامه‌های واژگان', 'واژه‌نامه‌های اسامی خاص', 'واژه‌نامه‌های دستور زبان', 'واژه‌نامه‌های کانجی', 'واژه‌نامه‌های بسامد', 'واژه‌نامه‌های آهنگ واژه', 'واژه‌نامه‌های جمله‌های نمونه', 'واژه‌نامه‌های هم‌معنا', 'دانشنامه‌ها', 'واژه‌نامه‌های کمکی'],
    },
    pl: {
        title: 'Wszystkie kopiowane słowniki',
        summary: 'Więcej słowników: {count} · łącznie {size}',
        searchLabel: 'Szukaj słowników',
        noResults: 'Żaden słownik nie pasuje do wyszukiwania.',
        categories: ['Słowniki wyrazów', 'Słowniki nazw własnych', 'Słowniki gramatyczne', 'Słowniki kanji', 'Słowniki frekwencyjne', 'Słowniki akcentu tonicznego', 'Słowniki zdań przykładowych', 'Słowniki synonimów', 'Encyklopedie', 'Słowniki pomocnicze'],
    },
    pt: {
        title: 'Todos os dicionários espelhados',
        summary: 'Mais {count} dicionários · {size} no total',
        searchLabel: 'Pesquisar dicionários',
        noResults: 'Nenhum dicionário corresponde à sua pesquisa.',
        categories: ['Dicionários de palavras', 'Dicionários de nomes próprios', 'Dicionários de gramática', 'Dicionários de kanji', 'Dicionários de frequência', 'Dicionários de acento tonal', 'Dicionários de frases de exemplo', 'Dicionários de sinónimos', 'Enciclopédias', 'Dicionários utilitários'],
    },
    ro: {
        title: 'Toate dicționarele găzduite',
        summary: 'Încă {count} dicționare · {size} în total',
        searchLabel: 'Caută dicționare',
        noResults: 'Niciun dicționar nu corespunde căutării.',
        categories: ['Dicționare de cuvinte', 'Dicționare de nume proprii', 'Dicționare de gramatică', 'Dicționare de kanji', 'Dicționare de frecvență', 'Dicționare de accent tonal', 'Dicționare de propoziții exemplu', 'Dicționare de sinonime', 'Enciclopedii', 'Dicționare auxiliare'],
    },
    ru: {
        title: 'Все зеркалируемые словари',
        summary: 'Ещё словарей: {count} · всего {size}',
        searchLabel: 'Поиск словарей',
        noResults: 'Ни один словарь не соответствует запросу.',
        categories: ['Словари слов', 'Словари имён собственных', 'Грамматические словари', 'Словари кандзи', 'Частотные словари', 'Словари тонального ударения', 'Словари примеров', 'Словари синонимов', 'Энциклопедии', 'Вспомогательные словари'],
    },
    sh: {
        title: 'Svi preslikani rečnici',
        summary: 'Još rečnika: {count} · ukupno {size}',
        searchLabel: 'Pretraži rečnike',
        noResults: 'Nijedan rečnik ne odgovara pretrazi.',
        categories: ['Rečnici reči', 'Rečnici vlastitih imena', 'Gramatički rečnici', 'Rečnici kandžija', 'Frekvencijski rečnici', 'Rečnici tonskog akcenta', 'Rečnici primera rečenica', 'Rečnici sinonima', 'Enciklopedije', 'Pomoćni rečnici'],
    },
    es: {
        title: 'Todos los diccionarios alojados',
        summary: '{count} diccionarios más · {size} en total',
        searchLabel: 'Buscar diccionarios',
        noResults: 'Ningún diccionario coincide con tu búsqueda.',
        categories: ['Diccionarios de palabras', 'Diccionarios de nombres propios', 'Diccionarios de gramática', 'Diccionarios de kanji', 'Diccionarios de frecuencia', 'Diccionarios de acento tonal', 'Diccionarios de oraciones de ejemplo', 'Diccionarios de sinónimos', 'Enciclopedias', 'Diccionarios auxiliares'],
    },
    sv: {
        title: 'Alla speglade ordböcker',
        summary: '{count} ordböcker till · {size} totalt',
        searchLabel: 'Sök ordböcker',
        noResults: 'Inga ordböcker matchar din sökning.',
        categories: ['Ordböcker', 'Namnordböcker', 'Grammatikordböcker', 'Kanjiordböcker', 'Frekvensordböcker', 'Tonaccentordböcker', 'Exempelmeningsordböcker', 'Synonymordböcker', 'Uppslagsverk', 'Hjälpordböcker'],
    },
    tl: {
        title: 'Lahat ng naka-mirror na diksyunaryo',
        summary: '{count} pang diksyunaryo · {size} sa kabuuan',
        searchLabel: 'Maghanap ng diksyunaryo',
        noResults: 'Walang diksyunaryong tumutugma sa paghahanap.',
        categories: ['Diksyunaryo ng salita', 'Diksyunaryo ng pangngalang pantangi', 'Diksyunaryo ng gramatika', 'Diksyunaryo ng kanji', 'Diksyunaryo ng dalas', 'Diksyunaryo ng tono', 'Diksyunaryo ng halimbawang pangungusap', 'Diksyunaryo ng kasingkahulugan', 'Ensiklopedya', 'Pantulong na diksyunaryo'],
    },
    th: {
        title: 'พจนานุกรมทั้งหมดที่มิเรอร์ไว้',
        summary: 'พจนานุกรมอีก {count} เล่ม · รวม {size}',
        searchLabel: 'ค้นหาพจนานุกรม',
        noResults: 'ไม่พบพจนานุกรมที่ตรงกับการค้นหา',
        categories: ['พจนานุกรมคำศัพท์', 'พจนานุกรมวิสามานยนาม', 'พจนานุกรมไวยากรณ์', 'พจนานุกรมคันจิ', 'พจนานุกรมความถี่', 'พจนานุกรมระดับเสียง', 'พจนานุกรมประโยคตัวอย่าง', 'พจนานุกรมคำพ้องความหมาย', 'สารานุกรม', 'พจนานุกรมเสริม'],
    },
    tr: {
        title: 'Yansılanan tüm sözlükler',
        summary: '{count} sözlük daha · toplam {size}',
        searchLabel: 'Sözlüklerde ara',
        noResults: 'Aramanızla eşleşen sözlük yok.',
        categories: ['Sözcük sözlükleri', 'Özel ad sözlükleri', 'Dil bilgisi sözlükleri', 'Kanji sözlükleri', 'Sıklık sözlükleri', 'Vurgu sözlükleri', 'Örnek cümle sözlükleri', 'Eş anlamlı sözlükler', 'Ansiklopediler', 'Yardımcı sözlükler'],
    },
    vi: {
        title: 'Tất cả từ điển được lưu trữ',
        summary: 'Thêm {count} từ điển · tổng {size}',
        searchLabel: 'Tìm từ điển',
        noResults: 'Không có từ điển nào khớp với tìm kiếm.',
        categories: ['Từ điển từ vựng', 'Từ điển danh từ riêng', 'Từ điển ngữ pháp', 'Từ điển kanji', 'Từ điển tần suất', 'Từ điển trọng âm', 'Từ điển câu ví dụ', 'Từ điển đồng nghĩa', 'Bách khoa toàn thư', 'Từ điển hỗ trợ'],
    },
};

export const CATALOG_BROWSE_COPY: Readonly<Record<LearnerLanguageId, CatalogBrowseCopy>> = Object.freeze(
    Object.fromEntries(
        LEARNER_LANGUAGE_IDS.map(language => [language, freezeCopy(CATALOG_BROWSE_COPY_SOURCE[language])]),
    ) as Record<LearnerLanguageId, CatalogBrowseCopy>,
);

export function catalogBrowseCopy(language: string): CatalogBrowseCopy {
    return CATALOG_BROWSE_COPY[language as LearnerLanguageId] ?? CATALOG_BROWSE_COPY.en;
}

function freezeCopy(source: CatalogBrowseCopySource): CatalogBrowseCopy {
    return Object.freeze({
        title: source.title,
        summary: source.summary,
        searchLabel: source.searchLabel,
        noResults: source.noResults,
        categories: Object.freeze(
            Object.fromEntries(
                CATALOG_BROWSE_CATEGORY_ORDER.map((category, index) => {
                    const name = source.categories[index];
                    // A category added to the catalogue without a name in every
                    // language would otherwise render as `undefined` in 31 of them.
                    if (!name) throw new Error(`Catalogue browse copy is missing a name for the "${category}" category.`);
                    return [category, name];
                }),
            ) as Record<DictionaryCategory, string>,
        ),
    });
}
