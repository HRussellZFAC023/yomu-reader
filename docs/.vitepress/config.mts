import { defineConfig } from 'vitepress';

const siteUrl = 'https://hrussellzfac023.github.io/kotoba-reader/';

export default defineConfig({
    title: 'よむ',
    description: 'A free JPDB and Yomitan popup reader for Japanese text, manga, video subtitles, and mining.',
    base: '/kotoba-reader/',
    cleanUrls: true,
    lastUpdated: true,
    head: [
        ['link', { rel: 'icon', href: '/kotoba-reader/yomu-icon.svg' }],
        ['meta', { name: 'theme-color', content: '#5ea780' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:title', content: 'よむ - Free Japanese popup reader' }],
        ['meta', { property: 'og:description', content: 'Install a friendly JPDB/Yomitan reader for lookup, mining, OCR, subtitles, and iPad-friendly study.' }],
        ['meta', { property: 'og:url', content: siteUrl }],
    ],
    themeConfig: {
        logo: '/yomu-icon.svg',
        nav: [
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Features', link: '/features' },
            { text: 'Changelog', link: '/changelog' },
            { text: 'Support', link: '/support' },
        ],
        sidebar: [
            {
                text: 'Start',
                items: [
                    { text: 'Overview', link: '/' },
                    { text: 'Getting Started', link: '/getting-started' },
                    { text: 'Features', link: '/features' },
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
            { icon: 'github', link: 'https://github.com/HRussellZFAC023/kotoba-reader' },
        ],
        footer: {
            message: 'Free userscript now. Chrome, Firefox, and Safari extensions are coming soon.',
            copyright: 'Released under the MIT license.',
        },
    },
});
