<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { libraryFilterUrl, normalizeLibraryQuery, readLibraryFilters } from './library-filters';
import { SITE_INTERACTION_COPY } from '../../../src/reader/app/site-interaction-copy';
import catalog from '../../../config/library/tadoku.catalog.json';

const props = withDefaults(defineProps<{ language?: 'en' | 'ja' }>(), { language: 'en' });
const copy = {
    en: {
        heading: 'Read', search: 'Search books', level: 'Level', genre: 'Genre', all: 'All', start: 'Start', pdf: 'Open a PDF',
        empty: 'No matching books.', source: 'Free books from NPO Tadoku Supporters (NPO多言語多読).', open: 'Read on Tadoku',
        checked: 'Catalogue checked', count: (n: number) => `${n} ${n === 1 ? 'book' : 'books'}`,
        credit: 'Books © their creators and NPO Tadoku Supporters, published free at tadoku.org. Each book’s page names its creators and licence, such as',
        license: 'Creative Commons BY-NC-ND 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', stop: '.',
        linksOnly: 'Yomu only links to the books and copies none of their pages or covers. This page loads nothing from tadoku.org until you open a book.',
    },
    ja: {
        heading: '読む', search: '本を探す', level: 'レベル', genre: 'ジャンル', all: 'すべて', start: '入門', pdf: 'PDFを開く',
        empty: '該当する本はありません。', source: 'NPO多言語多読の無料の読みもの。', open: '多読のサイトで読む',
        checked: 'カタログ確認日', count: (n: number) => `${n}冊`,
        credit: '本の著作権は各作者とNPO多言語多読にあり、tadoku.org で無料公開されています。作者とライセンスは各本のページに記載されています。例：',
        license: 'クリエイティブ・コモンズ 表示-非営利-改変禁止 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ja', stop: '。',
        linksOnly: 'よむは本へのリンクだけを載せ、本のページや表紙は複製しません。本を開くまで、このページは tadoku.org から何も読み込みません。',
    },
};
const text = computed(() => copy[props.language]);
const query = ref('');
const level = ref('');
const genre = ref('');
const levels = ['l-start', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5'];
const normalize = normalizeLibraryQuery;
const queryInput = ref<HTMLInputElement>();
const filtered = computed(() => Boolean(query.value || level.value || genre.value));
function restoreFilters() {
    const filters = readLibraryFilters(location.search, levels, catalog.genres.map(item => item.id));
    query.value = filters.query;
    level.value = filters.level;
    genre.value = filters.genre;
}
function clearFilters() {
    query.value = level.value = genre.value = '';
    queryInput.value?.focus();
}
onMounted(() => {
    restoreFilters();
    window.addEventListener('popstate', restoreFilters);
});
onUnmounted(() => window.removeEventListener('popstate', restoreFilters));
watch([query, level, genre], () => {
    const url = libraryFilterUrl(location.href, { query: query.value, level: level.value, genre: genre.value });
    if (url !== location.href) history.replaceState(history.state, '', url);
});
const books = computed(() => catalog.books.filter(book =>
    (!level.value || book.level === level.value)
    && (!genre.value || book.genreIds.includes(genre.value))
    && normalize(book.title).includes(normalize(query.value))));
const levelLabel = (value: string) => value === 'l-start' ? text.value.start : `${text.value.level} ${value.slice(1)}`;
</script>

<template>
  <main class="reading-library">
    <header class="library-heading">
      <h1>{{ text.heading }}</h1>
      <a href="/pdf-reader/">{{ text.pdf }}</a>
    </header>
    <form class="library-search" role="search" @submit.prevent>
      <label class="library-query">
        <span>{{ text.search }}</span>
        <input ref="queryInput" v-model="query" type="search" autocomplete="off" />
      </label>
      <label>
        <span>{{ text.level }}</span>
        <select v-model="level">
          <option value="">{{ text.all }}</option>
          <option v-for="value in levels" :key="value" :value="value">{{ levelLabel(value) }}</option>
        </select>
      </label>
      <label>
        <span>{{ text.genre }}</span>
        <select v-model="genre">
          <option value="">{{ text.all }}</option>
          <option v-for="item in catalog.genres" :key="item.id" :value="item.id">{{ item.label[props.language] }}</option>
        </select>
      </label>
    </form>
    <div class="library-results-status">
      <p class="library-count" role="status">{{ text.count(books.length) }}</p>
      <button class="library-reset" type="button" :disabled="!filtered" @click="clearFilters">{{ SITE_INTERACTION_COPY[props.language].libraryResetFilters }}</button>
    </div>
    <span id="library-open-hint" class="library-sr-only">{{ text.open }}</span>
    <ul class="library-books">
      <li v-for="book in books" :key="book.id">
        <a :href="book.sourceUrl + '#bd-look-inside'" target="_blank" rel="noopener noreferrer" :aria-describedby="'library-open-hint'">
          <span class="library-book-title" lang="ja">{{ book.title }}</span>
          <span class="library-level">{{ levelLabel(book.level) }}</span>
        </a>
      </li>
    </ul>
    <p v-if="!books.length">{{ text.empty }}</p>
    <p class="library-credit" data-library-credit>
      <a :href="catalog.sourceUrl" target="_blank" rel="noopener noreferrer">{{ text.source }}</a>
      {{ text.credit }} <a :href="text.licenseUrl" target="_blank" rel="noopener noreferrer license">{{ text.license }}</a>{{ text.stop }}
      {{ text.linksOnly }}
    </p>
    <footer>
      <span>{{ text.open }} · {{ text.checked }} {{ catalog.checkedAt.slice(0, 10) }}</span>
    </footer>
  </main>
</template>

<style scoped>
.reading-library { max-width: 68rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
.library-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
h1 { margin: 0; font-size: 1.75rem; font-weight: 600; }
a { color: var(--vp-c-brand-1); }
.library-search { display: flex; flex-wrap: wrap; gap: .75rem; }
label { display: flex; flex-direction: column; gap: .35rem; font-size: .875rem; }
.library-query { flex: 1 1 15rem; }
input, select, .library-reset { min-height: 44px; min-width: 0; border: 1px solid var(--vp-c-divider); border-radius: .4rem; background: var(--vp-c-bg-alt); padding: .5rem .7rem; color: var(--vp-c-text-1); font: inherit; font-size: 16px; }
.library-reset { cursor: pointer; }
.library-reset:disabled { visibility: hidden; }
.library-results-status { display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-height: 44px; margin: 1.25rem 0 .5rem; }
.library-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
select { max-width: 100%; }
input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.library-count, .library-level, .library-credit, footer { color: var(--vp-c-text-2); font-size: .875rem; }
.library-credit { max-width: 46rem; margin: 1.25rem 0 0; line-height: 1.6; }
.library-count { margin: 0; }
.library-books { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: .75rem 1.25rem; padding: 0; margin: 1rem 0 0; list-style: none; }
.library-books a { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; min-height: 44px; padding: .6rem .75rem; border: 1px solid var(--vp-c-divider); border-radius: .45rem; color: var(--vp-c-text-1); }
.library-book-title { font-size: 1rem; line-height: 1.65; font-weight: 500; overflow-wrap: anywhere; }
.library-books a:hover { color: var(--vp-c-brand-1); }
.library-level { flex-shrink: 0; }
footer { display: flex; flex-direction: column; gap: .4rem; margin-top: 2rem; }
@media (max-width: 420px) { .reading-library { padding-inline: 1rem; } .library-books { grid-template-columns: minmax(0, 1fr); } }
</style>
