/**
 * Yomu Ruby: the <ruby> Yomu writes for a reading. Every one carries
 * YOMU_RUBY_CLASS, and the word stylesheet's ruby and rt rules select on it,
 * so Page-owned Ruby (an author's <ruby> that a scan word wraps whole) keeps
 * the page's own line metrics. Restyling it moved text between pages on
 * ruby-heavy novels even with readings off.
 *
 * Both arguments are HTML: callers escape their text first.
 */
export const YOMU_RUBY_CLASS = 'jpdb-reader-ruby';

export function yomuRubyHtml(baseHtml: string, readingHtml: string, extraClasses = ''): string {
    return `<ruby class="${YOMU_RUBY_CLASS}${extraClasses}"><span class="jpdb-reader-ruby-base">${baseHtml}</span><rp>(</rp><rt class="jpdb-reader-furi">${readingHtml}</rt><rp>)</rp></ruby>`;
}
