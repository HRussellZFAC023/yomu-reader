import { defineConfig } from 'vitepress';
import { jpdbAudioDevProxyPlugin } from '../../vite-jpdb-audio-proxy';

const repositoryName = 'yomu-reader';
const base = `/${repositoryName}/`;
const siteUrl = `https://hrussellzfac023.github.io${base}`;
const newTabLink = 'newtab/index.html';
const statsLink = 'newtab/index.html?mode=stats';
const videoPlayerLink = 'video-player/index.html';

export default defineConfig({
    title: 'よむ',
    description: 'A free Japanese immersion reader for web pages, manga, subtitles, JPDB, Yomitan dictionaries, Anki, audio, OCR, and mining.',
    base,
    cleanUrls: true,
    lastUpdated: true,
    vite: {
        plugins: [jpdbAudioDevProxyPlugin()],
    },
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}yomu-icon.svg` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}favicon-32x32.png` }],
        ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${base}favicon-16x16.png` }],
        ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
        ['meta', { name: 'apple-mobile-web-app-title', content: 'よむ' }],
        ['meta', { name: 'theme-color', content: '#5ea780' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:title', content: 'よむ - Free Japanese popup reader' }],
        ['meta', { property: 'og:description', content: 'Learn Japanese by reading what you like. よむ connects lookup, mining, OCR, subtitles, JPDB, Yomitan dictionaries, Anki, and audio in one browser popup.' }],
        ['meta', { property: 'og:image', content: `${siteUrl}yomu-icon.svg` }],
        ['meta', { property: 'og:image:type', content: 'image/svg+xml' }],
        ['meta', { property: 'og:url', content: siteUrl }],
        ['meta', { name: 'twitter:card', content: 'summary' }],
        ['meta', { name: 'twitter:image', content: `${siteUrl}yomu-icon.svg` }],
    ],
    themeConfig: {
        logo: '/yomu-icon.svg',
        siteTitle: 'yomu',
        nav: [
            { text: 'Start', link: '/getting-started' },
            { text: 'Features', link: '/features' },
            { text: 'Study', link: newTabLink, target: '_self' },
            { text: 'Support', link: '/support' },
            {
                text: 'More',
                items: [
                    { text: 'Video Player', link: videoPlayerLink, target: '_self' },
                    { text: 'Local Audio', link: '/local-audio' },
                    { text: 'Stats', link: statsLink, target: '_self' },
                    { text: 'Changelog', link: '/changelog' },
                ],
            },
        ],
        sidebar: [
            {
                text: 'Start',
                items: [
                    { text: 'Overview', link: '/' },
                    { text: 'Getting Started', link: '/getting-started' },
                    { text: 'Features', link: '/features' },
                    { text: 'Local Audio', link: '/local-audio' },
                    { text: 'Video Player', link: videoPlayerLink, target: '_self' },
                ],
            },
            {
                text: 'Project',
                items: [
                    { text: 'Support', link: '/support' },
                    { text: 'Changelog', link: '/changelog' },
                ],
            },
        ],
        search: {
            provider: 'local',
        },
        socialLinks: [
            { icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` },
        ],
        footer: {
            message: 'Free userscript now. Chrome, Firefox, and Safari packages are being prepared for store submission.',
            copyright: 'Released under the GPL-3.0-or-later license.',
        },
    },
});
