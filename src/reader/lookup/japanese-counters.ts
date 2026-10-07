// Numeric counter context shared by segmentation and reading display.
export const NUMERIC_COUNTER_SUFFIX_SEGMENTS = new Set(['話', '巻', '回', '章', '部', '番', '号', '版', '人', '名', '匹', '頭', '羽', '枚', '本', '冊', '個', '台', '件', '分', '秒', '時', '日', '月', '年', '泊', '円']);
const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;

export function numericRangeImmediatelyBefore(sourceText: string, start: number): boolean {
    const before = sourceText.slice(Math.max(0, start - 24), start).replace(/\s+$/u, '');
    return NUMERIC_RANGE_BEFORE_RE.test(before);
}

